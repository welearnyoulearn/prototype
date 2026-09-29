import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, isClassTeacherOf, examAppliesToStudent } from '@/lib/examsAuth'

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
    if (!await examAppliesToStudent(Number(exam_id), Number(student_id), actor.schoolId)) {
      return NextResponse.json({ error: 'Student is not included in this exam' }, { status: 403 })
    }

    const { rows: [ack] } = await pool.query(
      'SELECT id FROM parent_mark_acks WHERE exam_id = $1 AND student_id = $2', [exam_id, student_id]
    )
    if (ack) return NextResponse.json({ error: 'This result has already been acknowledged' }, { status: 400 })

    const { rows: [student] } = await pool.query('SELECT name FROM students WHERE id = $1 AND school_id = $2', [student_id, actor.schoolId])
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const nudgedByTeacherId = actor.kind === 'teacher' ? actor.teacherId : null
    const client = await pool.connect()
    let notified = 0
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [Number(exam_id), Number(student_id)])
      const nudge = await client.query(`
        INSERT INTO parent_mark_ack_nudges (exam_id, student_id, nudged_by)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM parent_mark_ack_nudges
          WHERE exam_id = $1 AND student_id = $2 AND nudged_at > NOW() - INTERVAL '24 hours'
        )
        RETURNING id
      `, [exam_id, student_id, nudgedByTeacherId])
      if (nudge.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'A reminder was already sent in the last 24 hours' }, { status: 429 })
      }
      const { rows: parentLinks } = await client.query(
        `SELECT sp.parent_id FROM student_parents sp JOIN parents p ON p.id = sp.parent_id
         WHERE sp.student_id = $1 AND p.school_id = $2`, [student_id, actor.schoolId]
      )
      for (const link of parentLinks) {
        await client.query(`
          INSERT INTO notifications (school_id, recipient_parent_id, sender_teacher_id, type, title, message, data)
          VALUES ($1, $2, $3, 'ack_nudge', $4, $5, $6)
        `, [actor.schoolId, link.parent_id, nudgedByTeacherId,
          `Please acknowledge — ${exam.exam_name}`,
          `${student.name}'s result for ${exam.exam_name} is waiting for your acknowledgement.`,
          JSON.stringify({ exam_id: Number(exam_id), student_id: Number(student_id) })])
        notified++
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    return NextResponse.json({ success: true, notified })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
