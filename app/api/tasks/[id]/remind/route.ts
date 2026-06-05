import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: task_id } = await params
    const { school_id, teacher_id, student_ids, target_type = 'all' } = await req.json()

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const { rows: [task] } = await pool.query(`
      SELECT t.*, te.name AS teacher_name, c.grade, c.section
      FROM tasks t
      JOIN teachers te ON t.teacher_id = te.id
      JOIN classes c ON t.class_id = c.id
      WHERE t.id = $1 AND t.school_id = $2
    `, [task_id, school_id])
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Resolve sender — teacher_id from body if provided, else use task owner
    const senderId = teacher_id ? parseInt(teacher_id) : task.teacher_id
    const { rows: [sender] } = await pool.query(
      'SELECT id, name FROM teachers WHERE id=$1 AND school_id=$2',
      [senderId, school_id]
    )
    if (!sender) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

    let nonSubmitters: { student_id: number; student_name: string }[]
    if (target_type === 'specific' && student_ids?.length > 0) {
      const { rows } = await pool.query(`
        SELECT s.id AS student_id, s.name AS student_name
        FROM students s
        WHERE s.id = ANY($1::int[]) AND s.class_id = $2 AND s.school_id = $3
      `, [student_ids, task.class_id, school_id])
      nonSubmitters = rows
    } else {
      const { rows } = await pool.query(`
        SELECT s.id AS student_id, s.name AS student_name
        FROM students s
        LEFT JOIN task_submissions ts ON ts.student_id = s.id AND ts.task_id = $1
        WHERE s.class_id = $2 AND s.school_id = $3 AND ts.submitted_at IS NULL
      `, [task_id, task.class_id, school_id])
      nonSubmitters = rows
    }

    if (nonSubmitters.length === 0) {
      return NextResponse.json({ message: 'No students to remind', count: 0 })
    }

    await pool.query(`
      INSERT INTO task_reminders (task_id, school_id, sent_by, target_type, student_count, student_ids)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [task_id, school_id, sender.id, target_type, nonSubmitters.length,
        JSON.stringify(nonSubmitters.map(s => s.student_id))])

    return NextResponse.json({
      message: `Reminder recorded for ${nonSubmitters.length} student(s)`,
      count: nonSubmitters.length,
      students: nonSubmitters.map(s => s.student_name),
    })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
