import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess } from '@/lib/examsAuth'
import { calcGrade, isPassing } from '@/lib/examGrading'

// GET /api/students/[id]/exams?school_id=&class_id=
// Returns all released exams with this student's marks.
//
// v2 security fix: this route previously had NO session check at all —
// anyone who knew a student_id/school_id/class_id could read that student's
// full mark sheet. It now requires a real session and, for a student or
// parent caller, verifies the identity actually has a claim to this
// student — a student may only ever request their own id, a parent only a
// linked child's.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: student_id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    const class_id = req.nextUrl.searchParams.get('class_id')

    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (actor.kind === 'student' && Number(student_id) !== actor.studentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (actor.kind === 'parent') {
      const { rows: link } = await pool.query(
        'SELECT 1 FROM student_parents WHERE parent_id = $1 AND student_id = $2',
        [actor.parentId, student_id]
      )
      if (link.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!class_id) {
      return NextResponse.json({ error: 'class_id required' }, { status: 400 })
    }

    const { rows: [student] } = await pool.query(
      `SELECT id, name, grade, section FROM students WHERE id = $1 AND school_id = $2`,
      [student_id, actor.schoolId]
    )
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const { rows: exams } = await pool.query(`
      SELECT e.id, e.exam_name, e.exam_type, TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
        e.passing_pct, e.released_at, e.class_id
      FROM exam_records e
      JOIN classes c ON c.id = e.class_id
      WHERE e.class_id = $1 AND e.school_id = $2 AND e.status = 'released'
        AND c.grade = $3 AND c.section = $4
      ORDER BY e.released_at DESC
    `, [class_id, actor.schoolId, student.grade, student.section])

    const results = []

    for (const exam of exams) {
      const { rows: subjects } = await pool.query(
        `SELECT subject_name, max_marks FROM exam_subjects WHERE exam_id = $1 ORDER BY subject_name`,
        [exam.id]
      )

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
          pass: subPct !== null ? isPassing(subPct, exam.passing_pct) : null,
        }
      })

      const allEntered = marks.length === subjects.length
      const totalPct = allEntered && totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : null

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
        released_at: exam.released_at,
        subjects: subjectResults,
        total_obtained: allEntered ? totalObtained : null,
        total_max: totalMax,
        percentage: totalPct,
        grade: totalPct !== null ? calcGrade(totalPct) : null,
        pass: totalPct !== null ? isPassing(totalPct, exam.passing_pct) : null,
        parent_acknowledged: !!ack,
        parent_ack_name: ack?.parent_name ?? null,
        parent_ack_at: ack?.acknowledged_at ?? null,
      })
    }

    return NextResponse.json(results)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
