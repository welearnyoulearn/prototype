import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

// POST /api/fees/generate
// Generates ledger entries for all students in a grade/all grades for an academic year
// Idempotent — skips students who already have entries for this category+year+period
export async function POST(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
      const { school_id, academic_year, grade } = await req.json()
      if (!school_id || !academic_year) {
        return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
      }

      // Get fee structures (fixed categories only — variable handled via assignments)
      const { rows: structures } = await pool.query(
        `SELECT fs.*, fc.name AS category_name, fc.frequency,
                COALESCE(fc.category_type, 'fixed') AS category_type
         FROM fee_structures fs
         JOIN fee_categories fc ON fc.id = fs.fee_category_id AND fc.is_active = TRUE
         WHERE fs.school_id = $1 AND fs.academic_year = $2
         ${grade ? 'AND fs.grade = $3' : ''}`,
        grade ? [school_id, academic_year, grade] : [school_id, academic_year]
      )

      // Get variable category assignments for this year (student_id → { fee_category_id, amount })
      let variableAssignments: Array<{ student_id: number; fee_category_id: number; amount: number; frequency: string; due_day: number }> = []
      try {
        const { rows: varCats } = await pool.query(
          `SELECT id, frequency FROM fee_categories
           WHERE school_id = $1 AND category_type = 'variable' AND is_active = TRUE`,
          [school_id]
        )
        if (varCats.length > 0) {
          // Get due_day from fee_structures for variable categories (use first matching structure)
          const { rows: varStructures } = await pool.query(
            `SELECT DISTINCT ON (fs.fee_category_id) fs.fee_category_id, fs.due_day
             FROM fee_structures fs WHERE fs.school_id = $1 AND fs.academic_year = $2
               AND fs.fee_category_id = ANY($3)
             ORDER BY fs.fee_category_id, fs.id`,
            [school_id, academic_year, varCats.map(c => c.id)]
          )
          const dueDayMap: Record<number, number> = {}
          varStructures.forEach(s => { dueDayMap[s.fee_category_id] = s.due_day })

          const gradeFilter = grade ? 'AND s.grade = $4' : ''
          const params = grade
            ? [school_id, academic_year, varCats.map(c => c.id), grade]
            : [school_id, academic_year, varCats.map(c => c.id)]
          const { rows: assigns } = await pool.query(
            `SELECT sfca.student_id, sfca.fee_category_id, sfca.amount
             FROM student_fee_category_assignments sfca
             JOIN students s ON s.id = sfca.student_id
             WHERE sfca.school_id = $1 AND sfca.academic_year = $2
               AND sfca.fee_category_id = ANY($3) AND sfca.amount > 0
               ${gradeFilter}`,
            params
          )
          const freqMap: Record<number, string> = {}
          varCats.forEach(c => { freqMap[c.id] = c.frequency })
          variableAssignments = assigns.map(a => ({
            ...a,
            frequency: freqMap[a.fee_category_id] || 'monthly',
            due_day: dueDayMap[a.fee_category_id] || 10,
          }))
        }
      } catch { /* assignments table may not exist — skip variable */ }

      if (structures.length === 0 && variableAssignments.length === 0) {
        return NextResponse.json({ error: 'No fee structures found for this year. Set up fee structure first.' }, { status: 400 })
      }

      // Get students (for fixed categories)
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

        // Fixed categories → all students at fee_structures.amount
        for (const student of students) {
          const studentStructures = structures.filter(s => s.grade === student.grade && s.category_type !== 'variable')
          for (const s of studentStructures) {
            const periods = buildPeriods(s.frequency, academic_year, s.due_day)
            for (const period of periods) {
              const { rowCount } = await client.query(
                `INSERT INTO student_fee_ledger
                  (school_id, student_id, fee_category_id, fee_structure_id, academic_year, period_label, amount_due, due_date, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
                 ON CONFLICT (student_id, fee_category_id, academic_year, period_label) DO NOTHING`,
                [school_id, student.id, s.fee_category_id, s.id, academic_year, period.label, s.amount, period.due_date]
              )
              if (rowCount && rowCount > 0) created++
              else skipped++
            }
          }
        }

        // Variable categories → only assigned students at per-student amount
        for (const a of variableAssignments) {
          const periods = buildPeriods(a.frequency, academic_year, a.due_day)
          for (const period of periods) {
            const { rowCount } = await client.query(
              `INSERT INTO student_fee_ledger
                (school_id, student_id, fee_category_id, fee_structure_id, academic_year, period_label, amount_due, due_date, status)
               VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'pending')
               ON CONFLICT (student_id, fee_category_id, academic_year, period_label) DO NOTHING`,
              [school_id, a.student_id, a.fee_category_id, academic_year, period.label, a.amount, period.due_date]
            )
            if (rowCount && rowCount > 0) created++
            else skipped++
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
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
