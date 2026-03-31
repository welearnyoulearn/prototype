import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { awardPoints } from '@/lib/rewards'

function calcGrade(pct: number): string {
  if (pct >= 91) return 'A1'
  if (pct >= 81) return 'A2'
  if (pct >= 71) return 'B1'
  if (pct >= 61) return 'B2'
  if (pct >= 51) return 'C1'
  if (pct >= 41) return 'C2'
  if (pct >= 33) return 'D'
  return 'E'
}

// POST /api/exams/[id]/publish
// Publishes exam marks to students. Only class teacher, all subjects must be submitted.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB()
  const { id: exam_id } = await params
  const body = await req.json()
  const { school_id, teacher_id } = body

  if (!school_id || !teacher_id) {
    return NextResponse.json({ error: 'school_id and teacher_id required' }, { status: 400 })
  }

  try {
    const { rows: [exam] } = await pool.query(
      `SELECT e.*, c.grade, c.section FROM exam_records e
       JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [exam_id, school_id]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (exam.created_by !== parseInt(teacher_id)) {
      return NextResponse.json({ error: 'Only the class teacher can publish marks' }, { status: 403 })
    }
    if (exam.status === 'published') {
      return NextResponse.json({ error: 'Already published' }, { status: 400 })
    }

    // Check all subjects submitted
    const { rows: subjects } = await pool.query(
      `SELECT * FROM exam_subjects WHERE exam_id = $1`, [exam_id]
    )
    const pendingSubjects = subjects.filter(s => s.status !== 'submitted')
    if (pendingSubjects.length > 0) {
      return NextResponse.json({
        error: `Pending subjects: ${pendingSubjects.map(s => s.subject_name).join(', ')}`,
        pending_subjects: pendingSubjects.map(s => s.subject_name),
      }, { status: 400 })
    }

    // Publish
    await pool.query(`
      UPDATE exam_records SET status = 'published', published_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [exam_id])

    // Get all students in class
    const { rows: students } = await pool.query(`
      SELECT id, name FROM students
      WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'
    `, [school_id, exam.grade, exam.section])

    const totalMax = subjects.reduce((sum: number, s: { max_marks: number }) => sum + s.max_marks, 0)

    // Notify each student + award reward points for high scorers
    for (const student of students) {
      // Get student's total marks
      const { rows: marks } = await pool.query(
        `SELECT SUM(marks_obtained) AS total FROM exam_marks
         WHERE exam_id = $1 AND student_id = $2 AND NOT is_absent`,
        [exam_id, student.id]
      )
      const total = marks[0]?.total ? parseFloat(marks[0].total) : 0
      const pct = totalMax > 0 ? (total / totalMax) * 100 : 0
      const grade = calcGrade(pct)
      const pass = pct >= exam.passing_pct

      // Notify student
      try {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_student_id, sender_teacher_id, type, title, message, data)
          VALUES ($1, $2, $3, 'marks_published', $4, $5, $6)
        `, [
          school_id, student.id, teacher_id,
          `${exam.exam_name} results published`,
          `Your marks for ${exam.exam_name} are now available. ${pass ? `You scored ${pct.toFixed(1)}% (${grade}) — PASS` : `You scored ${pct.toFixed(1)}% — FAIL. Please work harder!`}`,
          JSON.stringify({ exam_id: parseInt(exam_id), percentage: pct.toFixed(1), grade, pass }),
        ])
      } catch { /* non-critical */ }

      // Award points for high scorers (≥80%)
      if (pct >= 80) {
        awardPoints(student.id, parseInt(school_id), 'task_scored_high', parseInt(exam_id), 'exam').catch(() => {})
      }
    }

    return NextResponse.json({ success: true, students_notified: students.length })
  } catch (err) {
    console.error('POST /api/exams/[id]/publish error:', err)
    return NextResponse.json({ error: 'Failed to publish exam' }, { status: 500 })
  }
}
