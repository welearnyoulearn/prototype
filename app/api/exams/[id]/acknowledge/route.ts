import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, parentOwnsStudent } from '@/lib/examsAuth'

// POST /api/exams/[id]/acknowledge
// A parent acknowledges seeing their child's released result.
// Body: { student_id, school_id }
//
// v2 fix: any authenticated session (getAnySession admits teacher/student/
// parent/admin alike) could previously acknowledge on behalf of any student
// just by typing a name — in practice the student portal's own UI did
// exactly this, letting a student sign off their own parent's
// acknowledgement. This is now parent-only, and the parent must actually be
// linked to the student via student_parents. parent_name/phone are taken
// from the parent's own account, not typed input, and serve only as a
// display snapshot.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: exam_id } = await params
    const body = await req.json()
    const { student_id, school_id } = body

    const actor = await requireExamsAccess(school_id)
    if (!actor || actor.kind !== 'parent') {
      return NextResponse.json({ error: 'Only a parent can acknowledge a result' }, { status: 403 })
    }
    if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })
    if (!await parentOwnsStudent(actor.parentId, Number(student_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [exam] } = await pool.query(
      `SELECT id, exam_name FROM exam_records WHERE id = $1 AND school_id = $2 AND status = 'released'`,
      [exam_id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found or not yet released' }, { status: 404 })

    const { rows: [parent] } = await pool.query(
      'SELECT name, phone FROM parents WHERE id = $1', [actor.parentId]
    )

    await pool.query(`
      INSERT INTO parent_mark_acks (exam_id, student_id, parent_id, school_id, parent_name, parent_phone, acknowledged_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (exam_id, student_id) DO UPDATE SET
        parent_id = EXCLUDED.parent_id,
        parent_name = EXCLUDED.parent_name,
        parent_phone = EXCLUDED.parent_phone,
        acknowledged_at = NOW()
    `, [exam_id, student_id, actor.parentId, actor.schoolId, parent?.name ?? actor.actorName, parent?.phone ?? null])

    // Let the class teacher know a parent signed off, so their ack-tracking
    // view can move this student from "needs a nudge" without a refresh.
    try {
      const { rows: [student] } = await pool.query('SELECT name, grade, section FROM students WHERE id = $1', [student_id])
      const { rows: [cls] } = student
        ? await pool.query('SELECT class_teacher_id FROM classes WHERE school_id = $1 AND grade = $2 AND section = $3', [actor.schoolId, student.grade, student.section])
        : { rows: [] }
      if (cls?.class_teacher_id) {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
          VALUES ($1, $2, 'ack_completed', $3, $4, $5)
        `, [
          actor.schoolId, cls.class_teacher_id,
          `Parent acknowledged — ${exam.exam_name}`,
          `${student?.name ?? 'A parent'}'s result for ${exam.exam_name} has been acknowledged.`,
          JSON.stringify({ exam_id: Number(exam_id), student_id: Number(student_id) }),
        ])
      }
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
