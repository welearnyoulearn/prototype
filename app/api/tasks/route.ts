import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// AUTH DISABLED FOR TESTING — will be re-enabled when all features are complete

export async function GET(req: NextRequest) {


  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const class_id = searchParams.get('class_id')
  const teacher_id = searchParams.get('teacher_id')
  const status_filter = searchParams.get('status') // optional: 'published' | 'draft' etc.

  if (!school_id) {
    return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  }

  // Build WHERE clause dynamically
  const conditions: string[] = ['t.school_id = $1']
  const params: (string | number)[] = [parseInt(school_id)]

  if (class_id) {
    params.push(parseInt(class_id))
    conditions.push(`t.class_id = $${params.length}`)
  }
  if (teacher_id) {
    params.push(parseInt(teacher_id))
    conditions.push(`t.teacher_id = $${params.length}`)
  }
  if (status_filter) {
    params.push(status_filter)
    conditions.push(`t.status = $${params.length}`)
  }

  const where = conditions.join(' AND ')

  const { rows } = await pool.query(`
    SELECT
      t.id, t.title, t.subject, t.task_type, t.max_marks,
      t.instructions, t.assigned_to, t.status,
      TO_CHAR(t.due_date, 'YYYY-MM-DD') AS due_date,
      TO_CHAR(t.due_time, 'HH24:MI') AS due_time,
      t.teacher_id, t.class_id, t.school_id,
      t.created_at, t.updated_at,
      te.name AS teacher_name,
      CONCAT(c.grade, '-', c.section) AS class_label,
      COUNT(DISTINCT CASE WHEN ts.submitted_at IS NOT NULL THEN ts.student_id END)::int AS submitted_count,
      COUNT(DISTINCT CASE WHEN ts.status = 'reviewed' THEN ts.student_id END)::int AS reviewed_count,
      COUNT(DISTINCT CASE WHEN ts.submitted_at IS NOT NULL AND ts.status != 'reviewed' THEN ts.student_id END)::int AS pending_count,
      (SELECT COUNT(*)::int FROM students s2 JOIN classes c2 ON c2.id = t.class_id WHERE s2.grade = c2.grade AND s2.section = c2.section AND s2.school_id = t.school_id) AS total_students,
      (SELECT MAX(tr.sent_at) FROM task_reminders tr WHERE tr.task_id = t.id) AS last_reminder_at
    FROM tasks t
    JOIN teachers te ON t.teacher_id = te.id
    JOIN classes c ON c.id = t.class_id
    LEFT JOIN task_submissions ts ON ts.task_id = t.id
    WHERE ${where}
    GROUP BY t.id, te.name, c.grade, c.section
    ORDER BY
      CASE WHEN t.status = 'published' THEN 0 ELSE 1 END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `, params)

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {


  const body = await req.json()
  const {
    school_id, class_id, teacher_id,
    title, subject, task_type = 'homework',
    max_marks = 10, instructions,
    assigned_to = 'all', status = 'draft',
    due_date, due_time,
  } = body

  if (!school_id || !class_id || !teacher_id) {
    return NextResponse.json({ error: 'school_id, class_id, teacher_id required' }, { status: 400 })
  }
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!subject?.trim()) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  if (max_marks < 1 || max_marks > 1000) {
    return NextResponse.json({ error: 'max_marks must be between 1 and 1000' }, { status: 400 })
  }
  if (!['practice', 'homework', 'test'].includes(task_type)) {
    return NextResponse.json({ error: 'Invalid task_type' }, { status: 400 })
  }
  if (!['draft', 'published'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (status === 'published' && !due_date) {
    return NextResponse.json({ error: 'Due date is required when publishing' }, { status: 400 })
  }

  const { rows: [teacher] } = await pool.query(
    'SELECT id FROM teachers WHERE id = $1 AND school_id = $2',
    [teacher_id, school_id]
  )
  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  const { rows: [task] } = await pool.query(`
    INSERT INTO tasks (school_id, class_id, teacher_id, title, subject, task_type, max_marks,
      instructions, assigned_to, status, due_date, due_time, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
    RETURNING *,
      TO_CHAR(due_date,'YYYY-MM-DD') AS due_date,
      TO_CHAR(due_time,'HH24:MI') AS due_time
  `, [
    school_id, class_id, teacher_id,
    title.trim(), subject.trim(), task_type, max_marks,
    instructions?.trim() || null, assigned_to, status,
    due_date || null, due_time || '23:59',
  ])

  return NextResponse.json(task, { status: 201 })
}
