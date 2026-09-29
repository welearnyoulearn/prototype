import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAdmin, getApplicableExamStudentIds } from '@/lib/examsAuth'
import { isPassing } from '@/lib/examGrading'
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

    const client = await pool.connect()
    let exam: { id: number; exam_name: string; passing_pct: number } | null = null
    let students: { id: number; name: string; total: string | null }[] = []
    let totalMax = 0
    let notified = 0
    try {
      await client.query('BEGIN')
      const examResult = await client.query(
        `SELECT e.id, e.exam_name, e.passing_pct, e.status
         FROM exam_records e WHERE e.id = $1 AND e.school_id = $2 FOR UPDATE`,
        [exam_id, actor.schoolId],
      )
      const lockedExam = examResult.rows[0]
      if (!lockedExam) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
      }
      if (lockedExam.status === 'released') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Already released' }, { status: 409 })
      }
      if (lockedExam.status !== 'teacher_reviewed') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This exam has not been reviewed by the class teacher yet' }, { status: 409 })
      }
      exam = lockedExam

      const { rows: [subjectSummary] } = await client.query(`
        SELECT COUNT(*)::int AS subject_count,
          COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted_count,
          COALESCE(SUM(max_marks), 0)::float AS total_max
        FROM exam_subjects WHERE exam_id = $1
      `, [exam_id])
      if (!subjectSummary.subject_count || subjectSummary.subject_count !== subjectSummary.submitted_count) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Every subject must be submitted before release' }, { status: 409 })
      }
      totalMax = Number(subjectSummary.total_max)
      const studentIds = await getApplicableExamStudentIds(Number(exam_id), actor.schoolId, client)
      if (studentIds.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This exam has no applicable active students' }, { status: 409 })
      }
      const { rows: [coverage] } = await client.query(`
        SELECT COUNT(*)::int AS entered
        FROM exam_marks
        WHERE exam_id = $1 AND student_id = ANY($2::int[])
          AND (marks_obtained IS NOT NULL OR is_absent)
      `, [exam_id, studentIds])
      if (Number(coverage.entered) !== studentIds.length * Number(subjectSummary.subject_count)) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Marks are incomplete for one or more students' }, { status: 409 })
      }
      const studentResult = await client.query(`
        SELECT s.id, s.name, SUM(CASE WHEN em.is_absent THEN 0 ELSE em.marks_obtained END)::text AS total
        FROM students s
        JOIN exam_marks em ON em.student_id = s.id AND em.exam_id = $1
        WHERE s.id = ANY($2::int[])
        GROUP BY s.id, s.name ORDER BY s.id
      `, [exam_id, studentIds])
      students = studentResult.rows

      const { rows: notificationSettings } = await client.query(
        `SELECT notify_marks_published FROM exam_notification_settings WHERE school_id = $1`,
        [actor.schoolId],
      )
      const marksNotifsOn = notificationSettings.length === 0 || notificationSettings[0].notify_marks_published
      if (marksNotifsOn) {
        for (const student of students) {
          const percentage = totalMax > 0 ? (Number(student.total ?? 0) / totalMax) * 100 : 0
          const pass = isPassing(percentage, lockedExam.passing_pct)
          await client.query(`
            INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
            VALUES ($1, $2, 'marks_released', $3, $4, $5)
          `, [actor.schoolId, student.id, `${lockedExam.exam_name} results released`,
            `Your results for ${lockedExam.exam_name} are available — ${percentage.toFixed(1)}%.`,
            JSON.stringify({ exam_id: Number(exam_id), percentage: percentage.toFixed(1), pass })])
          notified++
          const parentInsert = await client.query(`
            INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data)
            SELECT $1, sp.parent_id, 'marks_released', $3, $4, $5
            FROM student_parents sp JOIN parents p ON p.id = sp.parent_id
            WHERE sp.student_id = $2 AND p.school_id = $1
            RETURNING id
          `, [actor.schoolId, student.id, `${lockedExam.exam_name} results released`,
            `${student.name}'s results for ${lockedExam.exam_name} are available. Please review and acknowledge.`,
            JSON.stringify({ exam_id: Number(exam_id), student_id: student.id })])
          notified += parentInsert.rowCount ?? 0
        }
      }
      await client.query(`
        UPDATE exam_records SET status = 'released', released_at = NOW(),
          released_by_admin_id = $2, published_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [exam_id, actor.userId])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    if (exam) {
      for (const student of students) {
        const percentage = totalMax > 0 ? (Number(student.total ?? 0) / totalMax) * 100 : 0
        if (percentage >= 80) {
          awardPoints(student.id, actor.schoolId, 'task_scored_high', Number(exam_id), 'exam').catch(() => undefined)
        }
      }
    }
    return NextResponse.json({ success: true, recipients_notified: notified, students_released: students.length })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
