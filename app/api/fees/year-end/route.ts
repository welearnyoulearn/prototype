import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

// GET /api/fees/year-end?school_id=X&academic_year=Y
// Returns all unpaid entries eligible for carry-forward or write-off
export async function GET(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const school_id     = p.get('school_id')
  const academic_year = p.get('academic_year')
  if (!school_id || !academic_year) {
    return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
  }
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.student_id, s.name AS student_name, s.roll_number, s.grade, s.section,
              fc.name AS category_name, l.period_label,
              l.amount_due, l.amount_paid,
              (l.amount_due - l.amount_paid) AS balance,
              l.due_date, l.status
       FROM student_fee_ledger l
       JOIN students s ON s.id = l.student_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE l.school_id = $1 AND l.academic_year = $2
         AND l.status IN ('pending', 'overdue', 'partial')
         AND l.amount_paid < l.amount_due
       ORDER BY s.grade::int NULLS LAST, s.section, s.name, l.due_date`,
      [school_id, academic_year]
    )
    const totalOutstanding = rows.reduce((s, r) => s + parseFloat(r.balance), 0)
    return NextResponse.json({ entries: rows, total_outstanding: totalOutstanding, count: rows.length })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/fees/year-end
// Body: { school_id, from_year, to_year, action: 'carry_forward'|'write_off', ledger_ids: number[], reason?, done_by }
export async function POST(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const client = await pool.connect()
  try {
    const { school_id, from_year, to_year, action, ledger_ids, reason, done_by } = await req.json()
    if (!school_id || !from_year || !action || !Array.isArray(ledger_ids) || !ledger_ids.length || !done_by) {
      return NextResponse.json({ error: 'school_id, from_year, action, ledger_ids, done_by required' }, { status: 400 })
    }

    await client.query('BEGIN')

    const { rows: entries } = await client.query(
      `SELECT l.*, fc.frequency, fc.id AS fee_cat_id,
              s.grade
       FROM student_fee_ledger l
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       JOIN students s ON s.id = l.student_id
       WHERE l.id = ANY($1) AND l.school_id = $2
         AND l.status IN ('pending','overdue','partial')`,
      [ledger_ids, school_id]
    )

    let processed = 0

    if (action === 'write_off') {
      // Mark each entry as waived with the reason
      await client.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) NOT NULL DEFAULT 0`)
      for (const entry of entries) {
        const balance = parseFloat(entry.amount_due) - parseFloat(entry.amount_paid)
        await client.query(
          `UPDATE student_fee_ledger
           SET waiver_amount = COALESCE(waiver_amount, 0) + $1,
               amount_paid   = amount_due,
               status        = 'waived'
           WHERE id = $2`,
          [balance, entry.id]
        )
        await client.query(
          `INSERT INTO fee_waivers
             (school_id, student_id, ledger_id, waiver_type, waiver_amount, reason, granted_by_name)
           VALUES ($1, $2, $3, 'full', $4, $5, $6)`,
          [school_id, entry.student_id, entry.id, balance, reason || `Year-end write-off ${from_year}`, done_by]
        )
        processed++
      }
    } else if (action === 'carry_forward') {
      if (!to_year) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'to_year required for carry_forward' }, { status: 400 })
      }
      for (const entry of entries) {
        const balance = parseFloat(entry.amount_due) - parseFloat(entry.amount_paid)
        // Create a new one-time ledger entry in the next year
        await client.query(
          `INSERT INTO student_fee_ledger
             (school_id, student_id, fee_category_id, fee_structure_id, academic_year,
              period_label, amount_due, due_date, status)
           VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'pending')
           ON CONFLICT (student_id, fee_category_id, academic_year, period_label) DO NOTHING`,
          [school_id, entry.student_id, entry.fee_cat_id, to_year,
           `CF: ${entry.period_label} (${from_year})`,
           balance,
           new Date().toISOString().slice(0, 10)]
        )
        // Mark original as written off via carry-forward
        await client.query(
          `UPDATE student_fee_ledger
           SET status = 'waived', amount_paid = amount_due,
               waiver_amount = COALESCE(waiver_amount, 0) + $1
           WHERE id = $2`,
          [balance, entry.id]
        )
        processed++
      }
    }

    await client.query('COMMIT')
    return NextResponse.json({ processed, action })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    return NextResponse.json({ error: 'Year-end operation failed' }, { status: 500 })
  } finally { client.release() }
}
