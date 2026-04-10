import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/export/marks?school_id=&exam_id=
// Returns CSV with per-student per-subject marks for the given exam.
export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const exam_id   = searchParams.get('exam_id')

  if (!school_id || !exam_id) {
    return NextResponse.json({ error: 'school_id and exam_id required' }, { status: 400 })
  }

  // Fetch exam meta
  const { rows: [exam] } = await pool.query(
    `SELECT e.exam_name, e.exam_type, e.exam_date::text, e.passing_pct, c.grade, c.section
     FROM exam_records e JOIN classes c ON c.id = e.class_id
     WHERE e.id = $1 AND e.school_id = $2`,
    [exam_id, school_id]
  )
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

  // Fetch subjects for column headers
  const { rows: subjects } = await pool.query(
    `SELECT subject_name, max_marks FROM exam_subjects WHERE exam_id = $1 ORDER BY subject_name`,
    [exam_id]
  )

  // Fetch all student marks pivoted
  const { rows: marks } = await pool.query(`
    SELECT
      s.name         AS student_name,
      s.roll_number,
      em.subject_name,
      em.marks_obtained,
      em.is_absent
    FROM students s
    JOIN classes c ON c.grade = s.grade AND c.section = s.section AND c.school_id = s.school_id
    JOIN exam_records er ON er.class_id = c.id AND er.id = $1
    LEFT JOIN exam_marks em ON em.student_id = s.id AND em.exam_id = $1
    WHERE s.school_id = $2
      AND c.grade = $3 AND c.section = $4
      AND (s.status IS NULL OR s.status = 'active')
    ORDER BY s.name, em.subject_name
  `, [exam_id, school_id, exam.grade, exam.section])

  // Pivot: build a map student -> subject -> marks
  const studentMap: Record<string, { name: string; roll: string; subjects: Record<string, string> }> = {}
  for (const row of marks) {
    if (!studentMap[row.student_name]) {
      studentMap[row.student_name] = { name: row.student_name, roll: row.roll_number ?? '', subjects: {} }
    }
    if (row.subject_name) {
      studentMap[row.student_name].subjects[row.subject_name] =
        row.is_absent ? 'Absent' : (row.marks_obtained !== null ? String(row.marks_obtained) : '—')
    }
  }

  const subjectNames = subjects.map((s: { subject_name: string }) => s.subject_name)
  const maxMarks     = subjects.map((s: { max_marks: number }) => s.max_marks)

  // Header rows
  const header1 = ['Student Name', 'Roll No', ...subjectNames, 'Total', 'Percentage', 'Result']
  const header2 = ['', '', ...maxMarks.map((m: number) => `(max ${m})`), '', '', '']
  const totalMax = maxMarks.reduce((a: number, b: number) => a + b, 0)

  const csvRows = Object.values(studentMap).map(st => {
    let totalObtained = 0
    let absent = false
    const subCols = subjectNames.map((sub: string) => {
      const val = st.subjects[sub] ?? '—'
      if (val === 'Absent') { absent = true; return 'Absent' }
      const n = parseFloat(val)
      if (!isNaN(n)) totalObtained += n
      return val
    })
    const pct     = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) + '%' : '—'
    const result  = absent ? 'Absent' : (totalObtained >= totalMax * (exam.passing_pct / 100) ? 'PASS' : 'FAIL')
    return [st.name, st.roll, ...subCols, totalObtained, pct, result]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })

  const examLabel = `${exam.exam_name} | ${exam.grade}-${exam.section} | ${exam.exam_date ?? ''}`
  const csv = [`"${examLabel}"`, header1.join(','), header2.join(','), ...csvRows].join('\r\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="marks_${exam.exam_name.replace(/\s+/g, '_')}.csv"`,
    },
  })
}
