import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsTeacher, isClassTeacherOf } from '@/lib/examsAuth'

// POST /api/exams/[id]/subjects/[subjectId]/nudge
// The class teacher's "remind this subject teacher to enter their marks"
// action for a subject that's still pending — same one-off in-app
// notification pattern as every other nudge in this app (see
// /api/exams/[id]/nudge-parent, /api/notifications/nudge-teacher).
// Body: { school_id }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subjectId: string }> }
) {
  try {
    await ensureDB()
    const { id: examId, subjectId } = await params
    const body = await req.json()
    const { school_id } = body

    const actor = await requireExamsTeacher(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [examId, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (!await isClassTeacherOf(actor.teacherId, exam.class_id)) {
      return NextResponse.json({ error: 'Only this class’s class teacher can nudge a subject teacher' }, { status: 403 })
    }

    const { rows: [subject] } = await pool.query(
      'SELECT * FROM exam_subjects WHERE id = $1 AND exam_id = $2', [subjectId, examId]
    )
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    if (subject.status === 'submitted') {
      return NextResponse.json({ error: 'This subject has already been submitted' }, { status: 400 })
    }
    if (!subject.teacher_id) {
      return NextResponse.json({ error: 'This subject has no teacher assigned to nudge' }, { status: 400 })
    }
    if (subject.teacher_id === actor.teacherId) {
      return NextResponse.json({ error: 'This is your own subject to enter' }, { status: 400 })
    }

    await pool.query(`
      INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
      VALUES ($1, $2, $3, 'marks_entry_nudge', $4, $5, $6)
    `, [
      actor.schoolId, subject.teacher_id, actor.teacherId,
      `Reminder — enter marks for ${subject.subject_name}`,
      `${actor.actorName} reminded you that ${subject.subject_name} marks are still pending for ${exam.exam_name}.`,
      JSON.stringify({ exam_id: exam.id, exam_subject_id: subject.id, class_id: exam.class_id }),
    ])

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
