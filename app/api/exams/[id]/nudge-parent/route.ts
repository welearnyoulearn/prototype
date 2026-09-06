import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, isClassTeacherOf } from '@/lib/examsAuth'

// POST /api/exams/[id]/nudge-parent
// The class teacher's (or admin's) "remind this parent to acknowledge"
// action from the acknowledgement roster. Logs the nudge (so the UI can show
// "nudged 2 days ago") and sends a real notification if the student has a
// linked parent account — previously impossible, since parents had no
// notification delivery at all.
// Body: { school_id, student_id }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: exam_id } = await params
    const body = await req.json()
    const { school_id, student_id } = body

    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (actor.kind !== 'teacher' && actor.kind !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })

    const { rows: [exam] } = await pool.query(
      'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [exam_id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (actor.kind === 'teacher' && !await isClassTeacherOf(actor.teacherId, exam.class_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (exam.status !== 'released') {
      return NextResponse.json({ error: 'This exam has not been released yet' }, { status: 400 })
    }

    const { rows: [ack] } = await pool.query(
      'SELECT id FROM parent_mark_acks WHERE exam_id = $1 AND student_id = $2', [exam_id, student_id]
    )
    if (ack) return NextResponse.json({ error: 'This result has already been acknowledged' }, { status: 400 })

    const { rows: [student] } = await pool.query('SELECT name FROM students WHERE id = $1 AND school_id = $2', [student_id, actor.schoolId])
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const nudgedByTeacherId = actor.kind === 'teacher' ? actor.teacherId : null
    await pool.query(
      'INSERT INTO parent_mark_ack_nudges (exam_id, student_id, nudged_by) VALUES ($1, $2, $3)',
      [exam_id, student_id, nudgedByTeacherId]
    )

    const { rows: parentLinks } = await pool.query(
      'SELECT parent_id FROM student_parents WHERE student_id = $1', [student_id]
    )
    let notified = 0
    for (const link of parentLinks) {
      try {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_parent_id, sender_teacher_id, type, title, message, data)
          VALUES ($1, $2, $3, 'ack_nudge', $4, $5, $6)
        `, [
          actor.schoolId, link.parent_id, nudgedByTeacherId,
          `Please acknowledge — ${exam.exam_name}`,
          `${student.name}'s result for ${exam.exam_name} is waiting for your acknowledgement.`,
          JSON.stringify({ exam_id: Number(exam_id), student_id: Number(student_id) }),
        ])
        notified++
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, notified })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
