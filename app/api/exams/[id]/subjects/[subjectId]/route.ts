import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsTeacher, isClassTeacherOf } from '@/lib/examsAuth'

// PATCH /api/exams/[id]/subjects/[subjectId]
// Lets the subject teacher (or the class teacher, on any subject) set the
// max marks and pass marks for one exam_subjects row before entering marks —
// the numbers every pass/fail and analytics calculation downstream is keyed
// on (see subjectStats in GET /api/exams/[id]/marks). Locked once the
// subject has been submitted, same as the marks themselves; and once at
// least one mark has been recorded, a lower max_marks can no longer
// invalidate marks already entered above it.
// Body: { school_id, max_marks, pass_marks }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subjectId: string }> }
) {
  try {
    await ensureDB()
    const { id: examId, subjectId } = await params
    const body = await req.json()
    const { school_id, max_marks, pass_marks } = body

    const actor = await requireExamsTeacher(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // exam_subjects.max_marks/pass_marks are INTEGER columns — a fractional
    // value here would otherwise surface as an opaque Postgres 22P02 error
    // instead of a message the teacher can act on.
    const maxMarks = Number(max_marks)
    const passMarks = Number(pass_marks)
    if (!Number.isInteger(maxMarks) || maxMarks <= 0) {
      return NextResponse.json({ error: 'Max marks must be a whole number greater than 0' }, { status: 400 })
    }
    if (!Number.isInteger(passMarks) || passMarks < 0 || passMarks > maxMarks) {
      return NextResponse.json({ error: `Pass marks must be a whole number between 0 and ${maxMarks}` }, { status: 400 })
    }

    const { rows: [exam] } = await pool.query(
      'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [examId, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (exam.status !== 'collecting') {
      return NextResponse.json({ error: 'Marks entry is not open for this exam' }, { status: 400 })
    }

    const { rows: [subject] } = await pool.query(
      'SELECT * FROM exam_subjects WHERE id = $1 AND exam_id = $2', [subjectId, examId]
    )
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

    const isClassTeacher = await isClassTeacherOf(actor.teacherId, exam.class_id)
    if (!isClassTeacher && subject.teacher_id !== actor.teacherId) {
      return NextResponse.json({ error: 'You are not assigned to this subject' }, { status: 403 })
    }
    if (subject.status === 'submitted') {
      return NextResponse.json({ error: 'This subject has already been submitted and is locked' }, { status: 400 })
    }

    // A mark already on record above the new max would silently become
    // invalid data (e.g. a saved 85 under a max being lowered to 50) — reject
    // rather than let that happen quietly.
    const { rows: [{ over_max: overMax }] } = await pool.query(
      `SELECT COUNT(*)::int AS over_max FROM exam_marks
       WHERE exam_id = $1 AND subject_name = $2 AND NOT is_absent AND marks_obtained > $3`,
      [examId, subject.subject_name, maxMarks]
    )
    if (overMax > 0) {
      return NextResponse.json({ error: `${overMax} mark(s) already entered exceed ${maxMarks} — fix those first or choose a higher max` }, { status: 400 })
    }

    await pool.query(
      `UPDATE exam_subjects SET max_marks = $1, pass_marks = $2 WHERE id = $3`,
      [maxMarks, passMarks, subjectId]
    )

    return NextResponse.json({ success: true, max_marks: maxMarks, pass_marks: passMarks })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
