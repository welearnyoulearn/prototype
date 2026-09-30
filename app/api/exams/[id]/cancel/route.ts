import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAdmin, examNotificationEnabled } from '@/lib/examsAuth'

// POST /api/exams/[id]/cancel — admin-only. Distinct from DELETE: cancel
// keeps the row (status='cancelled', a real terminal state the calendar and
// every list query already excludes — see idx_exam_records_date_time and
// findExamConflicts) and notifies every affected student/parent/teacher, for
// an exam people have already seen on their calendar. DELETE stays for
// removing a mistaken entry no one was ever notified about.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { school_id, reason = null } = body

    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      `SELECT e.*, c.class_teacher_id, c.grade, c.section
       FROM exam_records e JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (exam.status === 'released') {
      return NextResponse.json({ error: 'Cannot cancel an exam whose results are already released' }, { status: 400 })
    }
    if (exam.status === 'cancelled') {
      return NextResponse.json({ error: 'Exam is already cancelled' }, { status: 400 })
    }

    const { rows: [updated] } = await pool.query(`
      UPDATE exam_records SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_admin_id = $2, cancellation_reason = $3, updated_at = NOW()
      WHERE id = $1 AND status NOT IN ('cancelled', 'released')
      RETURNING *, TO_CHAR(exam_date, 'YYYY-MM-DD') AS exam_date
    `, [id, actor.kind === 'admin' ? actor.userId : null, reason])
    if (!updated) return NextResponse.json({ error: 'Exam was already cancelled or released' }, { status: 409 })

    const studentIds = exam.student_scope === 'specific'
      ? (await pool.query(`SELECT student_id FROM exam_applicable_students WHERE exam_id = $1`, [id])).rows.map(r => r.student_id)
      : (await pool.query(
          `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
          [actor.schoolId, exam.grade, exam.section]
        )).rows.map(r => r.id)

    const dateLabel = exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : ''
    const title = `${exam.exam_name} cancelled`
    const message = `❌ ${exam.exam_name}${dateLabel ? ` scheduled for ${dateLabel}` : ''} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`
    const data = JSON.stringify({ exam_id: exam.id, class_id: exam.class_id })

    let notified = 0
    const notifsOn = await examNotificationEnabled(actor.schoolId, 'notify_cancelled')
    if (!notifsOn) return NextResponse.json({ ...updated, notified })

    for (const sid of studentIds) {
      try {
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data) VALUES ($1, $2, 'exam_cancelled', $3, $4, $5)`,
          [actor.schoolId, sid, title, message, data]
        )
        notified++
      } catch { /* non-critical */ }
    }
    if (studentIds.length > 0) {
      try {
        const { rows: parentLinks } = await pool.query(
          `SELECT DISTINCT sp.parent_id FROM student_parents sp
           JOIN parents p ON p.id = sp.parent_id
           WHERE sp.student_id = ANY($1::int[]) AND p.school_id = $2`, [studentIds, actor.schoolId]
        )
        for (const link of parentLinks) {
          await pool.query(
            `INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data) VALUES ($1, $2, 'exam_cancelled', $3, $4, $5)`,
            [actor.schoolId, link.parent_id, title, message, data]
          )
        }
      } catch { /* non-critical */ }
    }
    // Dedup: a teacher who is both class teacher and assigned invigilator
    // must only get one cancellation notice, not two.
    for (const tid of new Set([exam.class_teacher_id, exam.assigned_teacher_id].filter(Boolean))) {
      try {
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data) VALUES ($1, $2, 'exam_cancelled', $3, $4, $5)`,
          [actor.schoolId, tid, title, message, data]
        )
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ ...updated, notified })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
