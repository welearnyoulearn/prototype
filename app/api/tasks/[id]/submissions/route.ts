import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { awardPoints } from '@/lib/rewards'
import { getAnySession } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: task_id } = await params
    const school_id  = req.nextUrl.searchParams.get('school_id')
    const student_id = req.nextUrl.searchParams.get('student_id') // optional: student viewing own submission
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (Number(school_id) !== Number(session.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [task] } = await pool.query(
      'SELECT * FROM tasks WHERE id=$1 AND school_id=$2', [task_id, school_id]
    )
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const { rows } = await pool.query(`
      SELECT
        s.id AS student_id, s.name AS student_name, s.roll_number,
        ts.id AS submission_id, ts.submitted_at, ts.submission_text,
        ts.file_url, ts.file_name, ts.file_size_kb,
        ts.score, ts.feedback, ts.status,
        ts.resubmission_requested, ts.reviewed_at,
        rev.name AS reviewed_by_name,
        (
          SELECT COUNT(*)::int FROM tasks t2
          LEFT JOIN task_submissions ts2 ON ts2.task_id = t2.id AND ts2.student_id = s.id
          WHERE t2.class_id = $2 AND t2.school_id = $3
            AND t2.status = 'published' AND ts2.submitted_at IS NULL
        ) AS missing_task_count
      FROM students s
      JOIN classes c ON c.id = $2
      LEFT JOIN task_submissions ts ON ts.student_id = s.id AND ts.task_id = $1
      LEFT JOIN teachers rev ON ts.reviewed_by = rev.id
      WHERE s.grade = c.grade AND s.section = c.section AND s.school_id = $3
      ${student_id ? `AND s.id = $4` : ''}
      ORDER BY s.roll_number, s.name
    `, student_id ? [task_id, task.class_id, school_id, parseInt(student_id)] : [task_id, task.class_id, school_id])

    return NextResponse.json(rows)
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAnySession()
    if (!session || session.role !== 'student') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: task_id } = await params
    const body = await req.json()
    const {
      student_id, school_id, teacher_id,
      submitted_at, submission_text,
      file_url, file_name, file_public_id, file_size_kb,
      score, feedback, status = 'pending',
    } = body

    if (!student_id || !school_id) {
      return NextResponse.json({ error: 'student_id and school_id required' }, { status: 400 })
    }
    if (!['pending', 'reviewed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (Number(school_id) !== Number(session.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [task] } = await pool.query(
      'SELECT * FROM tasks WHERE id=$1 AND school_id=$2', [task_id, school_id]
    )
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    if (score !== undefined && score !== null && (score < 0 || score > task.max_marks)) {
      return NextResponse.json({ error: `Score must be between 0 and ${task.max_marks}` }, { status: 400 })
    }

    const reviewerId = status === 'reviewed' ? (teacher_id || null) : null
    const now = new Date().toISOString()

    const { rows: [sub] } = await pool.query(`
      INSERT INTO task_submissions
        (task_id, student_id, school_id, submitted_at, submission_text,
         file_url, file_name, file_public_id, file_size_kb,
         score, feedback, status, reviewed_at, reviewed_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (task_id, student_id) DO UPDATE SET
        submitted_at = COALESCE(EXCLUDED.submitted_at, task_submissions.submitted_at),
        submission_text = COALESCE(EXCLUDED.submission_text, task_submissions.submission_text),
        file_url = COALESCE(EXCLUDED.file_url, task_submissions.file_url),
        file_name = COALESCE(EXCLUDED.file_name, task_submissions.file_name),
        file_public_id = COALESCE(EXCLUDED.file_public_id, task_submissions.file_public_id),
        file_size_kb = COALESCE(EXCLUDED.file_size_kb, task_submissions.file_size_kb),
        score = EXCLUDED.score,
        feedback = EXCLUDED.feedback,
        status = EXCLUDED.status,
        -- When student resubmits (status=pending), clear the resubmission request flag and review data
        resubmission_requested = CASE WHEN EXCLUDED.status = 'pending' THEN FALSE ELSE task_submissions.resubmission_requested END,
        reviewed_at = CASE WHEN EXCLUDED.status = 'reviewed' THEN $13 WHEN EXCLUDED.status = 'pending' THEN NULL ELSE task_submissions.reviewed_at END,
        reviewed_by = CASE WHEN EXCLUDED.status = 'reviewed' THEN $14 WHEN EXCLUDED.status = 'pending' THEN NULL ELSE task_submissions.reviewed_by END
      RETURNING *
    `, [
      task_id, student_id, school_id,
      submitted_at || now, submission_text || null,
      file_url || null, file_name || null, file_public_id || null, file_size_kb || null,
      score ?? null, feedback || null, status,
      status === 'reviewed' ? now : null, reviewerId,
    ])

    // Award points for submission (non-blocking, student only)
    if (status === 'pending' && sub.submitted_at && !teacher_id) {
      awardPoints(parseInt(student_id), parseInt(school_id), 'task_submitted', parseInt(task_id), 'task').catch(() => {})
    }

    // Notify class teacher when student submits (non-blocking)
    if (status === 'pending' && sub.submitted_at) {
      try {
        const { rows: [classTeacher] } = await pool.query(
          `SELECT t.id FROM teachers t
           JOIN classes c ON c.class_teacher_id = t.id
           WHERE c.id = $1 AND c.school_id = $2`,
          [task.class_id, school_id]
        )
        if (classTeacher) {
          const studentName = await pool.query('SELECT name FROM students WHERE id = $1', [student_id])
            .then(r => r.rows[0]?.name || 'A student')
          await pool.query(`
            INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
            VALUES ($1, $2, 'task_submitted', $3, $4, $5)
          `, [
            school_id, classTeacher.id,
            `Task submitted — ${task.title}`,
            `${studentName} submitted "${task.title}"`,
            JSON.stringify({ task_id: task_id, student_id, class_id: task.class_id }),
          ])
        }
      } catch (notifErr) {
        console.warn('Failed to send submission notification (non-critical):', notifErr)
      }
    }

    return NextResponse.json(sub, { status: 201 })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
