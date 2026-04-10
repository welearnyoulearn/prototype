import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const student_id = searchParams.get('student_id')
  const class_id = searchParams.get('class_id')

  if (!school_id || !student_id || !class_id) {
    return NextResponse.json({ error: 'school_id, student_id, class_id required' }, { status: 400 })
  }

  const sid = parseInt(student_id)
  const scid = parseInt(school_id)
  const cid = parseInt(class_id)

  let upcoming_exams: unknown[] = []
  let published_results: unknown[] = []
  let unacknowledged_count = 0
  let recent_tasks: unknown[] = []
  let attendance_pct: number | null = null

  try {
    const { rows: studentRows } = await pool.query(
      `SELECT grade, section FROM students WHERE id = $1 AND school_id = $2`,
      [sid, scid]
    )
    const student = studentRows[0]
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    try {
      const today = new Date().toISOString().slice(0, 10)
      const cutoff = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { rows } = await pool.query(`
        SELECT
          e.id,
          e.exam_name,
          e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.status,
          e.class_id,
          c.grade,
          c.section,
          e.created_by,
          COUNT(DISTINCT es.id)::int AS total_subjects,
          COUNT(DISTINCT CASE WHEN es.status = 'submitted' THEN es.id END)::int AS submitted_subjects,
          COALESCE(
            ARRAY_AGG(es.subject_name ORDER BY es.subject_name) FILTER (WHERE es.subject_name IS NOT NULL),
            '{}'
          ) AS subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN exam_subjects es ON es.exam_id = e.id
        WHERE c.grade = $1 AND c.section = $2 AND e.school_id = $3
          AND e.exam_date >= $4 AND e.exam_date <= $5
          AND e.status != 'draft'
        GROUP BY e.id, c.grade, c.section
        ORDER BY e.exam_date ASC
        LIMIT 10
      `, [student.grade, student.section, scid, today, cutoff])
      upcoming_exams = rows
    } catch (_) {
      upcoming_exams = []
    }

    try {
      const { rows } = await pool.query(`
        SELECT
          e.id,
          e.exam_name,
          e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.passing_pct,
          SUM(CASE WHEN em.is_absent THEN 0 ELSE COALESCE(em.marks_obtained, 0) END) AS total_obtained,
          SUM(es.max_marks) AS total_max,
          (
            SELECT bool_and(pma.id IS NOT NULL)
            FROM parent_mark_acks pma
            WHERE pma.exam_id = e.id AND pma.student_id = $1
          ) AS parent_acknowledged
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN exam_marks em ON em.exam_id = e.id AND em.student_id = $1
        LEFT JOIN exam_subjects es ON es.exam_id = e.id AND es.subject_name = em.subject_name
        WHERE e.class_id = $2 AND e.school_id = $3 AND e.status = 'published'
        GROUP BY e.id
        ORDER BY e.published_at DESC
        LIMIT 5
      `, [sid, cid, scid])
      published_results = rows
    } catch (_) {
      published_results = []
    }

    try {
      const { rows } = await pool.query(`
        SELECT COUNT(*)::int AS cnt
        FROM exam_records e
        WHERE e.class_id = $1 AND e.school_id = $2 AND e.status = 'published'
          AND NOT EXISTS (
            SELECT 1 FROM parent_mark_acks pma
            WHERE pma.exam_id = e.id AND pma.student_id = $3
          )
      `, [cid, scid, sid])
      unacknowledged_count = rows[0]?.cnt ?? 0
    } catch (_) {
      unacknowledged_count = 0
    }

    try {
      const { rows } = await pool.query(`
        SELECT
          t.title,
          TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date,
          t.task_type,
          (ts.id IS NOT NULL AND ts.status != 'pending') AS submitted
        FROM tasks t
        LEFT JOIN task_submissions ts ON ts.task_id = t.id AND ts.student_id = $1
        WHERE t.class_id = $2 AND t.school_id = $3 AND t.status = 'published'
        ORDER BY t.created_at DESC
        LIMIT 5
      `, [sid, cid, scid])
      recent_tasks = rows
    } catch (_) {
      recent_tasks = []
    }

    try {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'present')::int AS present_days,
          COUNT(DISTINCT date)::int AS total_days
        FROM attendance
        WHERE student_id = $1 AND school_id = $2 AND date >= $3 AND session = 'morning'
      `, [sid, scid, monthStart])
      const r = rows[0]
      if (r && r.total_days > 0) {
        attendance_pct = Math.round((r.present_days / r.total_days) * 100)
      } else {
        attendance_pct = null
      }
    } catch (_) {
      attendance_pct = null
    }

    return NextResponse.json({
      upcoming_exams,
      published_results,
      unacknowledged_count,
      recent_tasks,
      attendance_pct,
    })
  } catch (err) {
    console.error('GET /api/parent/child-summary error:', err)
    return NextResponse.json({ error: 'Failed to fetch child summary' }, { status: 500 })
  }
}
