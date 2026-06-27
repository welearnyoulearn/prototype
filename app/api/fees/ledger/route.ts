import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/ledger?school_id=X&academic_year=2025-26&grade=8&status=overdue&student_id=Y
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id    = p.get('school_id')
    const academic_year = p.get('academic_year')
    const grade        = p.get('grade')
    const status       = p.get('status')
    const student_id   = p.get('student_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const conditions = ['l.school_id = $1']
    const values: (string | number)[] = [school_id]

    if (academic_year) { values.push(academic_year); conditions.push(`l.academic_year = $${values.length}`) }
    if (grade)         { values.push(grade);          conditions.push(`s.grade = $${values.length}`) }
    if (status)        { values.push(status);          conditions.push(`l.status = $${values.length}`) }
    if (student_id)    { values.push(student_id);      conditions.push(`l.student_id = $${values.length}`) }

    try {
      // Auto-update overdue status based on academic year end date
      if (academic_year) {
        // Mark overdue: only after the academic year's end date has passed
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
        // Reset stale overdue back to pending if academic year hasn't ended yet
        await pool.query(
          `UPDATE student_fee_ledger l SET status = 'pending'
           WHERE l.school_id = $1 AND l.academic_year = $2 AND l.status = 'overdue'
             AND EXISTS (
               SELECT 1 FROM academic_years ay
               WHERE ay.school_id = l.school_id AND ay.label = l.academic_year
                 AND ay.end_date >= CURRENT_DATE
             )`,
          [school_id, academic_year]
        )
      }

      // Check whether the audit table exists (created by migration)
      const { rows: [tableCheck] } = await pool.query(
        `SELECT to_regclass('student_fee_ledger_edits') IS NOT NULL AS exists`
      )
      const hasEditsCol = tableCheck.exists
        ? `EXISTS(SELECT 1 FROM student_fee_ledger_edits e WHERE e.ledger_id = l.id) AS has_edits`
        : `FALSE AS has_edits`

      const { rows } = await pool.query(
        `SELECT
           l.*,
           s.name AS student_name, s.roll_number, s.school_roll_number, s.grade, s.section,
           s.email, s.phone, s.parent_name, s.parent_phone, s.parent_email,
           fc.name AS category_name, fc.frequency,
           COALESCE(
             (SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.ledger_id = l.id AND fp.payment_status = 'completed'),
             0
           ) AS total_paid_confirmed,
           GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0) AS balance,
           (CURRENT_DATE - l.due_date) AS days_overdue,
           ${hasEditsCol}
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY l.due_date, s.grade, s.section, s.school_roll_number NULLS LAST, s.name`,
        values
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
