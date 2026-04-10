import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/fees/generate
// Generates ledger entries for all students in a grade/all grades for an academic year
// Idempotent — skips students who already have entries for this category+year+period
export async function POST(req: NextRequest) {
  try {
    const { school_id, academic_year, grade } = await req.json()
    if (!school_id || !academic_year) {
      return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    }

    // Get fee structures for this year
    const { rows: structures } = await pool.query(
      `SELECT fs.*, fc.name AS category_name, fc.frequency
       FROM fee_structures fs
       JOIN fee_categories fc ON fc.id = fs.fee_category_id AND fc.is_active = TRUE
       WHERE fs.school_id = $1 AND fs.academic_year = $2
       ${grade ? 'AND fs.grade = $3' : ''}`,
      grade ? [school_id, academic_year, grade] : [school_id, academic_year]
    )

    if (structures.length === 0) {
      return NextResponse.json({ error: 'No fee structures found for this year. Set up fee structure first.' }, { status: 400 })
    }

    // Get students
    const { rows: students } = await pool.query(
      `SELECT id, grade FROM students
       WHERE school_id = $1 AND status = 'active'
       ${grade ? 'AND grade = $2' : ''}`,
      grade ? [school_id, grade] : [school_id]
    )

    const client = await pool.connect()
    let created = 0; let skipped = 0
    try {
      await client.query('BEGIN')

      for (const student of students) {
        const studentStructures = structures.filter(s => s.grade === student.grade)
        for (const s of studentStructures) {
          const periods = buildPeriods(s.frequency, academic_year, s.due_day)
          for (const period of periods) {
            const { rowCount } = await client.query(
              `INSERT INTO student_fee_ledger
                (school_id, student_id, fee_category_id, fee_structure_id, academic_year, period_label, amount_due, due_date, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
               ON CONFLICT DO NOTHING`,
              [school_id, student.id, s.fee_category_id, s.id, academic_year, period.label, s.amount, period.due_date]
            )
            if (rowCount && rowCount > 0) created++
            else skipped++
          }
        }
      }
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }

    // Mark overdue entries
    await pool.query(
      `UPDATE student_fee_ledger
       SET status = 'overdue'
       WHERE school_id = $1 AND academic_year = $2
         AND status = 'pending' AND due_date < CURRENT_DATE`,
      [school_id, academic_year]
    )

    return NextResponse.json({ created, skipped, total_students: students.length })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to generate ledger' }, { status: 500 }) }
}

function buildPeriods(frequency: string, academicYear: string, dueDay: number): { label: string; due_date: string }[] {
  const [startYStr] = academicYear.split('-')
  const startYear = parseInt(startYStr)
  const endYear = startYear + 1

  const months = [
    { m: 4, y: startYear }, { m: 5, y: startYear }, { m: 6, y: startYear },
    { m: 7, y: startYear }, { m: 8, y: startYear }, { m: 9, y: startYear },
    { m: 10, y: startYear }, { m: 11, y: startYear }, { m: 12, y: startYear },
    { m: 1, y: endYear }, { m: 2, y: endYear }, { m: 3, y: endYear },
  ]

  const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  if (frequency === 'monthly') {
    return months.map(({ m, y }) => ({
      label: `${MONTH_NAMES[m]} ${y}`,
      due_date: `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
    }))
  }
  if (frequency === 'quarterly') {
    return [
      { label: `Q1 ${academicYear}`, due_date: `${startYear}-04-${String(dueDay).padStart(2, '0')}` },
      { label: `Q2 ${academicYear}`, due_date: `${startYear}-07-${String(dueDay).padStart(2, '0')}` },
      { label: `Q3 ${academicYear}`, due_date: `${startYear}-10-${String(dueDay).padStart(2, '0')}` },
      { label: `Q4 ${academicYear}`, due_date: `${endYear}-01-${String(dueDay).padStart(2, '0')}` },
    ]
  }
  // annual or one_time
  return [{ label: academicYear, due_date: `${startYear}-04-${String(dueDay).padStart(2, '0')}` }]
}
