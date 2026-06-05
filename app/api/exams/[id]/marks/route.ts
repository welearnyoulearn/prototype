import { NextRequest, NextResponse } from 'next/server'
import { getAnySession } from '@/lib/auth'
import pool, { ensureDB } from '@/lib/db'

// GET /api/exams/[id]/marks?school_id=
// Returns all marks for an exam, organized by student
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: exam_id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    const student_id = req.nextUrl.searchParams.get('student_id') // optional: only this student
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    try {
      const { rows: [exam] } = await pool.query(
        `SELECT e.*, c.grade, c.section FROM exam_records e
         JOIN classes c ON c.id = e.class_id
         WHERE e.id = $1 AND e.school_id = $2`,
        [exam_id, school_id]
      )
      if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

      // Get subjects
      const { rows: subjects } = await pool.query(
        `SELECT * FROM exam_subjects WHERE exam_id = $1 ORDER BY subject_name`,
        [exam_id]
      )

      // Get students in class
      const studentsQuery = student_id
        ? `SELECT id, name, roll_number FROM students WHERE school_id = $1 AND id = $2 AND status = 'active'`
        : `SELECT id, name, roll_number FROM students
           WHERE school_id = $1 AND grade = '${exam.grade}' AND section = '${exam.section}' AND status = 'active'
           ORDER BY roll_number`
      const studentsParams = student_id ? [school_id, parseInt(student_id)] : [school_id]
      const { rows: students } = await pool.query(studentsQuery, studentsParams)

      // Get all marks
      const { rows: marks } = await pool.query(
        `SELECT em.*, t.name AS entered_by_name
         FROM exam_marks em
         LEFT JOIN teachers t ON t.id = em.entered_by
         WHERE em.exam_id = $1`,
        [exam_id]
      )

      // Build marks map: student_id → subject → mark
      const marksMap: Record<number, Record<string, { marks_obtained: number | null; is_absent: boolean; entered_by_name: string | null }>> = {}
      for (const m of marks) {
        if (!marksMap[m.student_id]) marksMap[m.student_id] = {}
        marksMap[m.student_id][m.subject_name] = {
          marks_obtained: m.marks_obtained !== null ? parseFloat(m.marks_obtained) : null,
          is_absent: m.is_absent,
          entered_by_name: m.entered_by_name,
        }
      }

      const totalMaxMarks = subjects.reduce((sum, s) => sum + s.max_marks, 0)

      // Build per-student result rows
      const studentResults = students.map(s => {
        const subjMarks: Record<string, { marks_obtained: number | null; is_absent: boolean }> = {}
        let totalObtained = 0
        let allEntered = true
        let anyAbsent = false

        for (const sub of subjects) {
          const m = marksMap[s.id]?.[sub.subject_name]
          if (!m) { allEntered = false; subjMarks[sub.subject_name] = { marks_obtained: null, is_absent: false }; continue }
          subjMarks[sub.subject_name] = { marks_obtained: m.marks_obtained, is_absent: m.is_absent }
          if (m.is_absent) { anyAbsent = true }
          else if (m.marks_obtained !== null) { totalObtained += m.marks_obtained }
        }

        const pct = allEntered && totalMaxMarks > 0 ? Math.round((totalObtained / totalMaxMarks) * 100 * 10) / 10 : null
        const pass = pct !== null ? pct >= exam.passing_pct : null

        return {
          student_id: s.id,
          name: s.name,
          roll_number: s.roll_number,
          subjects: subjMarks,
          total_obtained: allEntered ? totalObtained : null,
          total_max: totalMaxMarks,
          percentage: pct,
          pass,
          grade: pct !== null ? calcGrade(pct) : null,
          all_entered: allEntered,
        }
      })

      // Subject stats
      const subjectStats = subjects.map(sub => {
        const subMarks = marks.filter(m => m.subject_name === sub.subject_name && !m.is_absent && m.marks_obtained !== null)
        const avg = subMarks.length > 0 ? subMarks.reduce((s, m) => s + parseFloat(m.marks_obtained), 0) / subMarks.length : null
        const passCount = subMarks.filter(m => (parseFloat(m.marks_obtained) / sub.max_marks) * 100 >= exam.passing_pct).length
        const absentCount = marks.filter(m => m.subject_name === sub.subject_name && m.is_absent).length
        return {
          subject_name: sub.subject_name,
          max_marks: sub.max_marks,
          teacher_id: sub.teacher_id,
          teacher_name: sub.teacher_name,
          status: sub.status,
          avg_marks: avg !== null ? Math.round(avg * 10) / 10 : null,
          pass_count: passCount,
          fail_count: subMarks.length - passCount,
          absent_count: absentCount,
          entries: subMarks.length + absentCount,
        }
      })

      return NextResponse.json({
        exam,
        subjects,
        students: studentResults,
        subject_stats: subjectStats,
        total_max: totalMaxMarks,
        pass_count: studentResults.filter(s => s.pass === true).length,
        fail_count: studentResults.filter(s => s.pass === false).length,
      })
    } catch (err) {
      console.error('GET /api/exams/[id]/marks error:', err)
      return NextResponse.json({ error: 'Failed to fetch marks' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

// POST /api/exams/[id]/marks
// Enter/update marks for one or more subjects. teacher_id determines which subjects they can enter.
// Body: { school_id, teacher_id, entries: [{ student_id, subject_name, marks_obtained, is_absent }], submit_subjects?: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

    const { id: exam_id } = await params
    const body = await req.json()
    const { school_id, teacher_id, entries, submit_subjects = [] } = body

    if (!school_id || !teacher_id || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'school_id, teacher_id, entries[] required' }, { status: 400 })
    }

    try {
      const { rows: [exam] } = await pool.query(
        `SELECT e.*, c.grade, c.section FROM exam_records e
         JOIN classes c ON c.id = e.class_id
         WHERE e.id = $1 AND e.school_id = $2`,
        [exam_id, school_id]
      )
      if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
      if (exam.status === 'published') return NextResponse.json({ error: 'Exam is published — marks are locked' }, { status: 400 })

      // Get subjects and verify teacher has permission to edit them
      const { rows: subjects } = await pool.query(
        `SELECT * FROM exam_subjects WHERE exam_id = $1`, [exam_id]
      )
      const isClassTeacher = exam.created_by === parseInt(teacher_id)
      const allowedSubjects = isClassTeacher
        ? new Set(subjects.map(s => s.subject_name))
        : new Set(subjects.filter(s => s.teacher_id === parseInt(teacher_id)).map(s => s.subject_name))

      if (allowedSubjects.size === 0 && !isClassTeacher) {
        return NextResponse.json({ error: 'No subjects assigned to this teacher for this exam' }, { status: 403 })
      }

      // Validate and insert marks
      const subjectMaxMap: Record<string, number> = {}
      subjects.forEach(s => { subjectMaxMap[s.subject_name] = s.max_marks })

      let savedCount = 0
      for (const entry of entries) {
        const { student_id, subject_name, marks_obtained, is_absent = false } = entry
        if (!student_id || !subject_name) continue
        if (!allowedSubjects.has(subject_name)) continue // security: skip unauthorized subjects

        const maxMarks = subjectMaxMap[subject_name]
        if (!is_absent && marks_obtained !== null && marks_obtained !== undefined) {
          if (parseFloat(marks_obtained) > maxMarks) continue // skip invalid
          if (parseFloat(marks_obtained) < 0) continue
        }

        await pool.query(`
          INSERT INTO exam_marks (exam_id, school_id, student_id, subject_name, marks_obtained, is_absent, entered_by, entered_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (exam_id, student_id, subject_name) DO UPDATE SET
            marks_obtained = EXCLUDED.marks_obtained,
            is_absent = EXCLUDED.is_absent,
            entered_by = EXCLUDED.entered_by,
            entered_at = NOW()
        `, [exam_id, school_id, student_id, subject_name, is_absent ? null : (marks_obtained ?? null), is_absent, teacher_id])
        savedCount++
      }

      // Mark subjects as submitted if requested
      const submittedSubjects: string[] = []
      for (const subName of submit_subjects) {
        if (!allowedSubjects.has(subName)) continue

        // Check all students have marks for this subject
        const { rows: [cls] } = await pool.query(
          `SELECT COUNT(*)::int AS total FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
          [school_id, exam.grade, exam.section]
        )
        const totalStudents = cls.total
        const { rows: [entered] } = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM exam_marks WHERE exam_id = $1 AND subject_name = $2`,
          [exam_id, subName]
        )
        if (parseInt(entered.cnt) >= totalStudents) {
          await pool.query(`
            UPDATE exam_subjects SET status = 'submitted', submitted_at = NOW(), submitted_by = $3
            WHERE exam_id = $1 AND subject_name = $2
          `, [exam_id, subName, teacher_id])
          submittedSubjects.push(subName)

          // Notify class teacher that this subject is submitted
          if (!isClassTeacher) {
            const { rows: [t] } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [teacher_id])
            try {
              await pool.query(`
                INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
                VALUES ($1, $2, $3, 'marks_submitted', $4, $5, $6)
              `, [
                school_id, exam.created_by, teacher_id,
                `${subName} marks submitted — ${exam.exam_name}`,
                `${t?.name || 'Teacher'} has submitted ${subName} marks.`,
                JSON.stringify({ exam_id: parseInt(exam_id) }),
              ])
            } catch { /* non-critical */ }
          }
        }
      }

      return NextResponse.json({ success: true, saved: savedCount, submitted_subjects: submittedSubjects })
    } catch (err) {
      console.error('POST /api/exams/[id]/marks error:', err)
      return NextResponse.json({ error: 'Failed to save marks' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}