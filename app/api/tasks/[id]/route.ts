import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { v2 as cloudinary } from 'cloudinary'
import { getAnySession, getTeacherSession } from '@/lib/auth'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (Number(school_id) !== Number(session.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [task] } = await pool.query(`
      SELECT
        t.id, t.title, t.subject, t.task_type, t.max_marks,
        t.instructions, t.assigned_to, t.status,
        TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date,
        TO_CHAR(t.due_time, 'HH24:MI') AS due_time,
        t.teacher_id, t.class_id, t.school_id, t.created_at,
        te.name AS teacher_name, c.grade, c.section,
        COUNT(DISTINCT CASE WHEN ts.submitted_at IS NOT NULL THEN ts.student_id END)::int AS submitted_count,
        COUNT(DISTINCT CASE WHEN ts.status = 'reviewed' THEN ts.student_id END)::int AS reviewed_count,
        COUNT(DISTINCT CASE WHEN ts.submitted_at IS NOT NULL AND ts.status != 'reviewed' THEN ts.student_id END)::int AS pending_count,
        (SELECT COUNT(*)::int FROM students s2 WHERE s2.grade = c.grade AND s2.section = c.section AND s2.school_id = t.school_id) AS total_students,
        (SELECT MAX(tr.sent_at) FROM task_reminders tr WHERE tr.task_id = t.id) AS last_reminder_at
      FROM tasks t
      JOIN teachers te ON t.teacher_id = te.id
      JOIN classes c ON t.class_id = c.id
      LEFT JOIN task_submissions ts ON ts.task_id = t.id
      WHERE t.id = $1 AND t.school_id = $2
      GROUP BY t.id, te.name, c.grade, c.section
    `, [id, school_id])

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    return NextResponse.json(task)
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json()
    const { school_id, teacher_id, title, subject, task_type, max_marks, instructions, assigned_to, status, due_date, due_time } = body

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (Number(school_id) !== Number(session.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [task] } = await pool.query(
      'SELECT * FROM tasks WHERE id=$1 AND school_id=$2', [id, school_id]
    )
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    if (teacher_id && task.teacher_id !== parseInt(teacher_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (status === 'published' && !due_date && !task.due_date) {
      return NextResponse.json({ error: 'Due date required when publishing' }, { status: 400 })
    }

    const { rows: [updated] } = await pool.query(`
      UPDATE tasks SET
        title = COALESCE($3, title),
        subject = COALESCE($4, subject),
        task_type = COALESCE($5, task_type),
        max_marks = COALESCE($6, max_marks),
        instructions = COALESCE($7, instructions),
        assigned_to = COALESCE($8, assigned_to),
        status = COALESCE($9, status),
        due_date = COALESCE($10::date, due_date),
        due_time = COALESCE($11::time, due_time),
        updated_at = NOW()
      WHERE id=$1 AND school_id=$2
      RETURNING *,
        TO_CHAR(due_date,'YYYY-MM-DD') AS due_date,
        TO_CHAR(due_time,'HH24:MI') AS due_time
    `, [id, school_id, title, subject, task_type, max_marks, instructions, assigned_to, status,
        due_date || null, due_time || null])

    return NextResponse.json(updated)
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    const teacher_id = req.nextUrl.searchParams.get('teacher_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (Number(school_id) !== Number(session.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [task] } = await pool.query(
      'SELECT * FROM tasks WHERE id=$1 AND school_id=$2', [id, school_id]
    )
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    if (teacher_id && task.teacher_id !== parseInt(teacher_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: subs } = await pool.query(
      'SELECT file_public_id FROM task_submissions WHERE task_id=$1 AND file_public_id IS NOT NULL', [id]
    )
    for (const sub of subs) {
      try { await cloudinary.uploader.destroy(sub.file_public_id) } catch { /* ignore */ }
    }

    await pool.query('DELETE FROM tasks WHERE id=$1 AND school_id=$2', [id, school_id])
    return NextResponse.json({ message: 'Task deleted' })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
