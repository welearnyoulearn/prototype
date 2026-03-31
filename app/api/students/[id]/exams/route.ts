import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

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

// GET /api/students/[id]/exams?school_id=&class_id=
// Returns all published exams with this student's marks. Student sees ONLY their own data.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB()
  const { id: student_id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')
  const class_id = req.nextUrl.searchParams.get('class_id')

  if (!school_id || !class_id) {
    return NextResponse.json({ error: 'school_id and class_id required' }, { status: 400 })
  }

  try {
    // Verify student belongs to this class
    const { rows: [student] } = await pool.query(
      `SELECT id, name, grade, section FROM students WHERE id = $1 AND school_id = $2`,
      [student_id, school_id]
    )
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    // Get all published exams for this class
    const { rows: exams } = await pool.query(`
      SELECT e.id, e.exam_name, e.exam_type, TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
        e.passing_pct, e.published_at, e.class_id
      FROM exam_records e
      JOIN classes c ON c.id = e.class_id
      WHERE e.class_id = $1 AND e.school_id = $2 AND e.status = 'published'
        AND c.grade = $3 AND c.section = $4
      ORDER BY e.published_at DESC
    `, [class_id, school_id, student.grade, student.section])

    const results = []

    for (const exam of exams) {
      // Get subjects for this exam
      const { rows: subjects } = await pool.query(
        `SELECT subject_name, max_marks FROM exam_subjects WHERE exam_id = $1 ORDER BY subject_name`,
        [exam.id]
      )

      // Get this student's marks
      const { rows: marks } = await pool.query(
        `SELECT subject_name, marks_obtained, is_absent
         FROM exam_marks WHERE exam_id = $1 AND student_id = $2`,
        [exam.id, student_id]
      )

      const marksMap: Record<string, { marks_obtained: number | null; is_absent: boolean }> = {}
      marks.forEach(m => {
        marksMap[m.subject_name] = {
          marks_obtained: m.marks_obtained !== null ? parseFloat(m.marks_obtained) : null,
          is_absent: m.is_absent,
        }
      })

      const totalMax = subjects.reduce((sum, s) => sum + s.max_marks, 0)
      let totalObtained = 0
      const subjectResults = subjects.map(s => {
        const m = marksMap[s.subject_name]
        const obtained = m?.is_absent ? null : (m?.marks_obtained ?? null)
        const subPct = obtained !== null ? (obtained / s.max_marks) * 100 : null
        if (obtained !== null) totalObtained += obtained
        return {
          subject_name: s.subject_name,
          max_marks: s.max_marks,
          marks_obtained: obtained,
          is_absent: m?.is_absent ?? false,
          percentage: subPct !== null ? Math.round(subPct * 10) / 10 : null,
          grade: subPct !== null ? calcGrade(subPct) : null,
          pass: subPct !== null ? subPct >= exam.passing_pct : null,
        }
      })

      const allEntered = marks.length === subjects.length
      const totalPct = allEntered && totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : null

      // Get parent acknowledgement
      const { rows: [ack] } = await pool.query(
        `SELECT parent_name, acknowledged_at FROM parent_mark_acks WHERE exam_id = $1 AND student_id = $2`,
        [exam.id, student_id]
      )

      results.push({
        exam_id: exam.id,
        exam_name: exam.exam_name,
        exam_type: exam.exam_type,
        exam_date: exam.exam_date,
        passing_pct: exam.passing_pct,
        published_at: exam.published_at,
        subjects: subjectResults,
        total_obtained: allEntered ? totalObtained : null,
        total_max: totalMax,
        percentage: totalPct,
        grade: totalPct !== null ? calcGrade(totalPct) : null,
        pass: totalPct !== null ? totalPct >= exam.passing_pct : null,
        parent_acknowledged: !!ack,
        parent_ack_name: ack?.parent_name ?? null,
        parent_ack_at: ack?.acknowledged_at ?? null,
      })
    }

    return NextResponse.json(results)
  } catch (err) {
    console.error('GET /api/students/[id]/exams error:', err)
    return NextResponse.json({ error: 'Failed to fetch student exams' }, { status: 500 })
  }
}
