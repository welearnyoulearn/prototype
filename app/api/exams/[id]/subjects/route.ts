import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsTeacher, isClassTeacherOf } from '@/lib/examsAuth'

// POST /api/exams/[id]/subjects — reassigns the teacher for one or more of
// an exam's existing subject slots.
//
// Every subject's teacher is normally already set at exam-creation time,
// copied straight from class_subjects (POST /api/exams/schedule) — there is
// no separate "class teacher assigns subject teachers" step in the normal
// flow. This route exists for the two narrower cases that still need a
// manual fix: a subject that had no teacher in class_subjects at all (the
// class teacher can self-assign it), or genuinely reassigning who enters a
// subject after the fact. It only ever UPDATEs teacher_id/teacher_name on
// existing exam_subjects rows; it never creates or deletes a subject slot,
// since the subject list itself must exactly match what the class teaches.
//
// Body: { school_id, assignments: [{ exam_subject_id, teacher_id }] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: examId } = await params
    const body = await req.json()
    const { school_id, assignments } = body

    const actor = await requireExamsTeacher(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ error: 'assignments[] required' }, { status: 400 })
    }
    if (assignments.length > 100) return NextResponse.json({ error: 'Too many assignments' }, { status: 413 })
    const subjectIds = assignments.map(assignment => Number(assignment?.exam_subject_id))
    if (subjectIds.some(id => !Number.isInteger(id)) || new Set(subjectIds).size !== subjectIds.length) {
      return NextResponse.json({ error: 'Each exam subject may be assigned once per request' }, { status: 400 })
    }

    const { rows: [exam] } = await pool.query(
      'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [examId, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    // Only this exam's own class teacher may assign subject teachers —
    // checked against classes.class_teacher_id (the real source of truth),
    // never exam_records.created_by, which is an admin-created exam's
    // creator, not a teacher, and was never a reliable class-teacher signal.
    if (!await isClassTeacherOf(actor.teacherId, exam.class_id)) {
      return NextResponse.json({ error: 'Only this class’s class teacher can assign subject teachers' }, { status: 403 })
    }
    if (exam.status !== 'collecting') {
      return NextResponse.json({ error: 'Marks entry has not opened for this exam yet' }, { status: 400 })
    }

    // Every teacher being assigned must actually teach this exact class+
    // subject (per class_subjects) — prevents assigning someone with no real
    // connection to the class, and confirms the id isn't forged.
    const validated: { subjectId: number; teacherId: number | null; teacherName: string | null }[] = []
    for (const a of assignments) {
      const { rows: [subjRow] } = await pool.query(
        'SELECT id, class_subject_id, status FROM exam_subjects WHERE id = $1 AND exam_id = $2',
        [a.exam_subject_id, examId]
      )
      if (!subjRow) return NextResponse.json({ error: `Subject ${a.exam_subject_id} does not belong to this exam` }, { status: 400 })
      if (subjRow.status === 'submitted') return NextResponse.json({ error: 'Submitted subjects cannot be reassigned' }, { status: 409 })

      if (a.teacher_id) {
        const { rows: [validTeacher] } = await pool.query(
          `SELECT t.id, t.name FROM teachers t
           JOIN class_subjects cs ON cs.id = $2
           WHERE t.id = $1 AND t.school_id = $3 AND t.status = 'active'
             AND (cs.teacher_id = t.id OR (cs.teacher_id IS NULL AND t.id = $4))`,
          [a.teacher_id, subjRow.class_subject_id, actor.schoolId, actor.teacherId]
        )
        if (!validTeacher) return NextResponse.json({ error: 'Teacher is not eligible for this class subject' }, { status: 400 })
        validated.push({ subjectId: subjRow.id, teacherId: validTeacher.id, teacherName: validTeacher.name })
      } else {
        validated.push({ subjectId: subjRow.id, teacherId: null, teacherName: null })
      }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const assignment of validated) {
        await client.query(
          `UPDATE exam_subjects SET teacher_id = $1, teacher_name = $2 WHERE id = $3 AND status = 'pending'`,
          [assignment.teacherId, assignment.teacherName, assignment.subjectId],
        )
        if (assignment.teacherId && assignment.teacherId !== actor.teacherId) {
          await client.query(`
            INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
            VALUES ($1, $2, $3, 'marks_entry_required', $4, $5, $6)
          `, [actor.schoolId, assignment.teacherId, actor.teacherId,
            `Enter marks — ${exam.exam_name}`,
            `You've been assigned to enter marks for this subject in ${exam.exam_name}.`,
            JSON.stringify({ exam_id: exam.id, exam_subject_id: assignment.subjectId, class_id: exam.class_id })])
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    return NextResponse.json({ success: true, assigned: validated.filter(assignment => assignment.teacherId).length })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
