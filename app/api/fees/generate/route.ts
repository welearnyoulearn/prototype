import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// POST /api/fees/generate
// Generates ledger entries for all students in a grade/all grades for an academic year
// Idempotent — skips students who already have entries for this category+year+period
export async function POST(req: NextRequest) {
  try {
    try {
      const { school_id, academic_year, grade } = await req.json()
      if (!school_id || !academic_year) {
        return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
      }
      if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      // Every bill's due_date is the academic year's own end_date — not a per-category
      // due-day. All bills for a year (monthly, quarterly, or annual) become due at once,
      // at year-end.
      const { rows: [yearRow] } = await pool.query(
        `SELECT end_date FROM academic_years WHERE school_id = $1 AND label = $2`,
        [school_id, academic_year]
      )
      if (!yearRow) {
        return NextResponse.json({ error: `Academic year ${academic_year} not found. Create it first.` }, { status: 400 })
      }
      const dueDate: string = yearRow.end_date

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
      let variableAssignments: Array<{ student_id: number; fee_category_id: number; amount: number; frequency: string }> = []
      try {
        const { rows: varCats } = await pool.query(
          `SELECT id, frequency FROM fee_categories
           WHERE school_id = $1 AND category_type = 'variable' AND is_active = TRUE`,
          [school_id]
        )
        if (varCats.length > 0) {
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
               AND s.status = 'active'
               ${gradeFilter}`,
            params
          )
          const freqMap: Record<number, string> = {}
          varCats.forEach(c => { freqMap[c.id] = c.frequency })
          variableAssignments = assigns.map(a => ({
            ...a,
            frequency: freqMap[a.fee_category_id] || 'monthly',
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
            const periods = buildPeriods(s.frequency, academic_year, dueDate)
            for (const period of periods) {
              const { rowCount } = await client.query(
                `INSERT INTO student_fee_ledger
                  (school_id, student_id, fee_category_id, fee_structure_id, academic_year, period_label, amount_due, due_date, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
                 ON CONFLICT (student_id, fee_category_id, academic_year, period_label) DO NOTHING`,
                [school_id, student.id, s.fee_category_id, s.id, academic_year, period.label, s.amount, period.due_date]
              )
              if (rowCount && rowCount > 0) {
                created++
              } else {
                skipped++
                // A bill for this exact period already exists — but if the student has since
                // moved to a different grade (e.g. promoted/transferred outside year-rollover),
                // the existing row's fee_structure_id may now point at the WRONG grade's amount.
                // Re-sync unpaid/overdue/partial bills to the current grade's structure, exactly
                // like amending a structure does, so the student is billed at their actual grade.
                // GREATEST(...) guards against amount_due ending up below amount_paid if the new
                // grade's fee is lower than what the student already paid toward the old grade's
                // bill — amount_due must never be less than what's already been collected.
                await client.query(
                  `UPDATE student_fee_ledger
                   SET fee_structure_id = $1, amount_due = GREATEST($2, amount_paid),
                       status = CASE
                         WHEN COALESCE(waiver_amount,0) + amount_paid >= GREATEST($2, amount_paid) THEN 'paid'
                         WHEN amount_paid > 0 THEN 'partial'
                         ELSE status
                       END
                   WHERE school_id = $3 AND student_id = $4 AND fee_category_id = $5
                     AND academic_year = $6 AND period_label = $7
                     AND status IN ('pending', 'overdue', 'partial')
                     AND fee_structure_id IS DISTINCT FROM $1`,
                  [s.id, s.amount, school_id, student.id, s.fee_category_id, academic_year, period.label]
                )
              }
            }
          }
        }

        // Variable categories → only assigned students at per-student amount
        for (const a of variableAssignments) {
          const periods = buildPeriods(a.frequency, academic_year, dueDate)
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

      // Mark overdue: entries become overdue only after the academic year's end date passes
      await pool.query(
        `UPDATE student_fee_ledger l SET status = 'overdue'
         WHERE l.school_id = $1 AND l.academic_year = $2 AND l.status = 'pending'
           AND EXISTS (
             SELECT 1 FROM academic_years ay
             WHERE ay.school_id = l.school_id AND ay.label = l.academic_year
               AND ay.end_date < CURRENT_DATE
           )`,
        [school_id, academic_year]
      )

      return NextResponse.json({ created, skipped, total_students: students.length })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to generate ledger' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Builds the set of billing periods for a frequency — period_label still differs per
// period (so monthly/quarterly bills remain separate, trackable ledger rows), but every
// period shares the same due_date: the academic year's own end_date. There is no more
// per-category due-day — every bill becomes due at year-end, all at once.
function buildPeriods(frequency: string, academicYear: string, dueDate: string): { label: string; due_date: string }[] {
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
    return months.map(({ m, y }) => ({ label: `${MONTH_NAMES[m]} ${y}`, due_date: dueDate }))
  }
  if (frequency === 'quarterly') {
    return [
      { label: `Q1 ${academicYear}`, due_date: dueDate },
      { label: `Q2 ${academicYear}`, due_date: dueDate },
      { label: `Q3 ${academicYear}`, due_date: dueDate },
      { label: `Q4 ${academicYear}`, due_date: dueDate },
    ]
  }
  if (frequency === 'half_yearly') {
    return [
      { label: `H1 ${academicYear}`, due_date: dueDate },
      { label: `H2 ${academicYear}`, due_date: dueDate },
    ]
  }
  // annual or one_time
  return [{ label: academicYear, due_date: dueDate }]
}
