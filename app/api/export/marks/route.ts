import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAdmin } from '@/lib/examsAuth'

// GET /api/export/marks?school_id=&exam_id=
// Returns CSV with per-student per-subject marks for the given exam.
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const exam_id   = searchParams.get('exam_id')

    // v2 fix: requireSchoolAdmin() only confirmed the caller has an admin
    // role — it never checked the requested school_id actually belonged to
    // that admin's own school, so a school admin could export another
    // school's exam by guessing its id. requireExamsAdmin tenant-matches.
    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!exam_id) {
      return NextResponse.json({ error: 'exam_id required' }, { status: 400 })
    }

    const { rows: [exam] } = await pool.query(
      `SELECT e.exam_name, e.exam_type, e.exam_date::text, e.passing_pct, c.grade, c.section
       FROM exam_records e JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [exam_id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const { rows: subjects } = await pool.query(
      `SELECT subject_name, max_marks FROM exam_subjects WHERE exam_id = $1 ORDER BY subject_name`,
      [exam_id]
    )

    // Pivoted by student_id, not student name — two students sharing a name
    // in the same class previously collapsed into one CSV row.
    const { rows: marks } = await pool.query(`
      SELECT
        s.id           AS student_id,
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
      ORDER BY s.roll_number NULLS LAST, s.name, em.subject_name
    `, [exam_id, actor.schoolId, exam.grade, exam.section])

    const studentMap = new Map<number, { name: string; roll: string; subjects: Record<string, string> }>()
    for (const row of marks) {
      if (!studentMap.has(row.student_id)) {
        studentMap.set(row.student_id, { name: row.student_name, roll: row.roll_number ?? '', subjects: {} })
      }
      if (row.subject_name) {
        studentMap.get(row.student_id)!.subjects[row.subject_name] =
          row.is_absent ? 'Absent' : (row.marks_obtained !== null ? String(row.marks_obtained) : '—')
      }
    }

    const subjectNames = subjects.map((s: { subject_name: string }) => s.subject_name)
    const maxMarks     = subjects.map((s: { max_marks: number }) => s.max_marks)

    const header1 = ['Student Name', 'Roll No', ...subjectNames, 'Total', 'Percentage', 'Result']
    const header2 = ['', '', ...maxMarks.map((m: number) => `(max ${m})`), '', '', '']
    const totalMax = maxMarks.reduce((a: number, b: number) => a + b, 0)

    const csvRows = Array.from(studentMap.values()).map(st => {
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
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
