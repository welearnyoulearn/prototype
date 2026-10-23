import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAdmin } from '@/lib/examsAuth'
import { calcGrade, isPassing } from '@/lib/examGrading'
import { awardPoints } from '@/lib/rewards'

// POST /api/exams/[id]/release
// School admin's final action — the only thing that actually makes an
// exam's results visible to students and parents (GET /api/exams/[id]/marks
// and GET /api/students/[id]/exams both gate on status === 'released'). This
// is admin-only, review-then-release: it does not accept any mark edits,
// only a straight release of whatever the class teacher already reviewed.
// Terminal — there is no un-release, matching the old publish's
// irreversibility.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: exam_id } = await params
    const body = await req.json()
    const { school_id } = body

    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      `SELECT e.*, c.grade, c.section FROM exam_records e
       JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [exam_id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (exam.status === 'released') return NextResponse.json({ error: 'Already released' }, { status: 400 })
    if (exam.status !== 'teacher_reviewed') {
      return NextResponse.json({ error: 'This exam has not been reviewed by the class teacher yet' }, { status: 400 })
    }

    await pool.query(`
      UPDATE exam_records
      SET status = 'released', released_at = NOW(), released_by_admin_id = $2, published_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [exam_id, actor.userId])

    const { rows: subjects } = await pool.query(`SELECT max_marks FROM exam_subjects WHERE exam_id = $1`, [exam_id])
    const totalMax = subjects.reduce((sum: number, s: { max_marks: number }) => sum + s.max_marks, 0)

    const { rows: students } = await pool.query(`
      SELECT id, name FROM students
      WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'
    `, [actor.schoolId, exam.grade, exam.section])

    let notified = 0
    for (const student of students) {
      const { rows: [{ total: totalRaw }] } = await pool.query(
        `SELECT SUM(marks_obtained) AS total FROM exam_marks
         WHERE exam_id = $1 AND student_id = $2 AND NOT is_absent`,
        [exam_id, student.id]
      )
      const total = totalRaw ? parseFloat(totalRaw) : 0
      const pct = totalMax > 0 ? (total / totalMax) * 100 : 0
      const grade = calcGrade(pct)
      const pass = isPassing(pct, exam.passing_pct)

      try {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
          VALUES ($1, $2, 'marks_released', $3, $4, $5)
        `, [
          actor.schoolId, student.id,
          `${exam.exam_name} results released`,
          pass
            ? `Your results for ${exam.exam_name} are available — ${pct.toFixed(1)}% (${grade}).`
            : `Your results for ${exam.exam_name} are available — ${pct.toFixed(1)}%.`,
          JSON.stringify({ exam_id: Number(exam_id), percentage: pct.toFixed(1), grade, pass }),
        ])
        notified++
      } catch { /* non-critical */ }

      const { rows: parentLinks } = await pool.query(
        'SELECT parent_id FROM student_parents WHERE student_id = $1', [student.id]
      )
      for (const link of parentLinks) {
        try {
          await pool.query(`
            INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data)
            VALUES ($1, $2, 'marks_released', $3, $4, $5)
          `, [
            actor.schoolId, link.parent_id,
            `${exam.exam_name} results released`,
            `${student.name}'s results for ${exam.exam_name} are available. Please review and acknowledge.`,
            JSON.stringify({ exam_id: Number(exam_id), student_id: student.id }),
          ])
        } catch { /* non-critical */ }
      }

      if (pct >= 80) {
        awardPoints(student.id, actor.schoolId, 'task_scored_high', Number(exam_id), 'exam').catch(() => {})
      }
    }

    return NextResponse.json({ success: true, students_notified: notified })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
