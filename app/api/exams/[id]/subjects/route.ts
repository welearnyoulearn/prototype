import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsTeacher, isClassTeacherOf } from '@/lib/examsAuth'

// POST /api/exams/[id]/subjects — the class teacher assigns a subject
// teacher to each of the exam's existing subject slots.
//
// v2 change: exam_subjects rows already exist by the time this is called —
// they were created from the class's own class_subjects at exam-creation
// time (POST /api/exams/schedule). This route only ever UPDATEs teacher_id/
// teacher_name on existing rows; it never creates or deletes a subject slot,
// since the subject list itself is meant to exactly match what the class
// teaches, not something a class teacher curates per exam.
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
    if (exam.status === 'teacher_reviewed' || exam.status === 'released') {
      return NextResponse.json({ error: 'This exam has already been reviewed and can no longer be edited' }, { status: 400 })
    }
    if (exam.status === 'scheduled') {
      return NextResponse.json({ error: 'Marks entry has not opened for this exam yet' }, { status: 400 })
    }

    // Every teacher being assigned must actually teach this exact class+
    // subject (per class_subjects) — prevents assigning someone with no real
    // connection to the class, and confirms the id isn't forged.
    let assignedCount = 0
    for (const a of assignments) {
      const { rows: [subjRow] } = await pool.query(
        'SELECT id, class_subject_id FROM exam_subjects WHERE id = $1 AND exam_id = $2',
        [a.exam_subject_id, examId]
      )
      if (!subjRow) continue

      if (a.teacher_id) {
        const { rows: [validTeacher] } = await pool.query(
          `SELECT t.id, t.name FROM teachers t
           JOIN class_subjects cs ON cs.teacher_id = t.id
           WHERE t.id = $1 AND cs.id = $2 AND t.school_id = $3`,
          [a.teacher_id, subjRow.class_subject_id, actor.schoolId]
        )
        if (!validTeacher) continue
        await pool.query(
          `UPDATE exam_subjects SET teacher_id = $1, teacher_name = $2 WHERE id = $3`,
          [validTeacher.id, validTeacher.name, subjRow.id]
        )
        assignedCount++

        if (validTeacher.id !== actor.teacherId) {
          try {
            await pool.query(`
              INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
              VALUES ($1, $2, $3, 'marks_entry_required', $4, $5, $6)
            `, [
              actor.schoolId, validTeacher.id, actor.teacherId,
              `Enter marks — ${exam.exam_name}`,
              `You've been assigned to enter marks for this subject in ${exam.exam_name}.`,
              JSON.stringify({ exam_id: exam.id, exam_subject_id: subjRow.id, class_id: exam.class_id }),
            ])
          } catch { /* non-critical */ }
        }
      } else {
        // Unassigning — the class teacher will need to enter it themself,
        // or assign someone else before this subject can ever be submitted.
        await pool.query(`UPDATE exam_subjects SET teacher_id = NULL, teacher_name = NULL WHERE id = $1`, [subjRow.id])
      }
    }

    return NextResponse.json({ success: true, assigned: assignedCount })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
