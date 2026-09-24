import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsTeacher, isClassTeacherOf } from '@/lib/examsAuth'

// POST /api/exams/[id]/subjects/[subjectId]/reopen
// Lets the class teacher un-submit one subject to fix a mistake before their
// own review/forward-to-admin step. Once the exam itself has moved to
// 'teacher_reviewed', this is no longer available — a single subject-level
// correction after that point would require the whole exam to be sent back
// through admin, which is a heavier action than a single-subject fix
// deserves while the class teacher is still actively reviewing.
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
      return NextResponse.json({ error: 'Only this class’s class teacher can reopen a subject' }, { status: 403 })
    }
    if (exam.status !== 'collecting') {
      return NextResponse.json({ error: 'This exam can no longer be reopened for edits' }, { status: 400 })
    }

    const { rows: [subject] } = await pool.query(
      'SELECT * FROM exam_subjects WHERE id = $1 AND exam_id = $2', [subjectId, examId]
    )
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    if (subject.status !== 'submitted') return NextResponse.json({ error: 'This subject is not submitted' }, { status: 400 })

    await pool.query(`
      UPDATE exam_subjects SET status = 'pending', reopened_at = NOW(), reopened_by = $2
      WHERE id = $1
    `, [subjectId, actor.teacherId])

    if (subject.teacher_id && subject.teacher_id !== actor.teacherId) {
      try {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
          VALUES ($1, $2, $3, 'marks_entry_required', $4, $5, $6)
        `, [
          actor.schoolId, subject.teacher_id, actor.teacherId,
          `${subject.subject_name} reopened — ${exam.exam_name}`,
          `${actor.actorName} reopened ${subject.subject_name} for corrections. Please review and resubmit.`,
          JSON.stringify({ exam_id: exam.id, exam_subject_id: subject.id, class_id: exam.class_id }),
        ])
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
