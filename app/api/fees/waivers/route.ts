import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

// GET /api/fees/waivers?school_id=X&student_id=Y
export async function GET(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const p = req.nextUrl.searchParams
    const school_id  = p.get('school_id')
    const student_id = p.get('student_id')
    const ledger_id  = p.get('ledger_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    // Self-heal: add soft-delete columns
    await pool.query(`ALTER TABLE fee_waivers ADD COLUMN IF NOT EXISTS is_revoked    BOOLEAN     NOT NULL DEFAULT FALSE`)
    await pool.query(`ALTER TABLE fee_waivers ADD COLUMN IF NOT EXISTS revoked_by    TEXT`)
    await pool.query(`ALTER TABLE fee_waivers ADD COLUMN IF NOT EXISTS revoked_at    TIMESTAMPTZ`)
    await pool.query(`ALTER TABLE fee_waivers ADD COLUMN IF NOT EXISTS revoke_reason TEXT`)

    const showRevoked = p.get('show_revoked') === '1'
    const conditions = ['w.school_id = $1']
    const values: (string | number)[] = [school_id]
    if (!showRevoked) conditions.push('w.is_revoked = FALSE')
    if (student_id) { values.push(student_id); conditions.push(`w.student_id = $${values.length}`) }
    if (ledger_id)  { values.push(ledger_id);  conditions.push(`w.ledger_id = $${values.length}`) }

    try {
      const { rows } = await pool.query(
        `SELECT w.*, s.name AS student_name, s.grade, s.section, s.roll_number,
                fc.name AS category_name, l.period_label, l.amount_due
         FROM fee_waivers w
         JOIN students s ON s.id = w.student_id
         JOIN student_fee_ledger l ON l.id = w.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY w.created_at DESC`,
        values
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/fees/waivers — grant a waiver and update ledger
export async function POST(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client = await pool.connect()
    try {
      const { school_id, student_id, ledger_id, waiver_type, waiver_value, reason, granted_by_name } = await req.json()
      if (!school_id || !student_id || !ledger_id || !waiver_type || !reason) {
        return NextResponse.json({ error: 'school_id, student_id, ledger_id, waiver_type, reason required' }, { status: 400 })
      }

      await client.query('BEGIN')

      // Get ledger entry
      const { rows: [ledger] } = await client.query(
        `SELECT * FROM student_fee_ledger WHERE id = $1 AND school_id = $2`,
        [ledger_id, school_id]
      )
      if (!ledger) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 })
      }

      // Calculate waiver amount
      let waiver_amount = 0
      if (waiver_type === 'full') {
        waiver_amount = ledger.amount_due - ledger.amount_paid
      } else if (waiver_type === 'percentage') {
        waiver_amount = Math.round((ledger.amount_due * (waiver_value || 0)) / 100)
      } else if (waiver_type === 'fixed_amount') {
        waiver_amount = waiver_value || 0
      }

      // Insert waiver
      const { rows: [waiver] } = await client.query(
        `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_value, waiver_amount, reason, granted_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [school_id, student_id, ledger_id, waiver_type, waiver_value || null, waiver_amount, reason, granted_by_name || null]
      )

      // Self-heal: add waiver_amount column if missing
      await client.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) NOT NULL DEFAULT 0`)

      // Apply waiver — track separately from cash payments
      await client.query(
        `UPDATE student_fee_ledger
         SET waiver_amount = COALESCE(waiver_amount, 0) + $1,
             amount_paid   = LEAST(amount_due, amount_paid + $1),
             status = CASE
               WHEN LEAST(amount_due, amount_paid + $1) >= amount_due THEN 'waived'
               WHEN amount_paid + $1 > 0                              THEN 'partial'
               ELSE status
             END
         WHERE id = $2`,
        [waiver_amount, ledger_id]
      )

      await client.query('COMMIT')
      return NextResponse.json(waiver, { status: 201 })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to grant waiver' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/fees/waivers?id=X&revoked_by=Admin&reason=... — soft-revoke waiver
export async function DELETE(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const p          = req.nextUrl.searchParams
    const id         = p.get('id')
    const revoked_by = p.get('revoked_by') || 'Admin'
    const reason     = p.get('reason') || 'Revoked by admin'
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Soft-delete — mark as revoked, keep the record
      const { rows: [waiver] } = await client.query(
        `UPDATE fee_waivers
         SET is_revoked = TRUE, revoked_by = $1, revoked_at = NOW(), revoke_reason = $2
         WHERE id = $3 AND is_revoked = FALSE
         RETURNING *`,
        [revoked_by, reason, id]
      )
      if (!waiver) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Waiver not found or already revoked' }, { status: 404 })
      }

      // Reverse waiver from ledger — recalculate status correctly
      // Count actual confirmed payments to distinguish 'partial' (real payment) vs 'pending' (zero paid)
      const { rows: [actualPaid] } = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS paid
         FROM fee_payments
         WHERE ledger_id = $1 AND payment_status = 'completed'`,
        [waiver.ledger_id]
      )
      const realPaid = parseFloat(actualPaid.paid)
      const newAmountPaid = Math.max(0, realPaid) // strip the waiver, keep only real payments

      await client.query(
        `UPDATE student_fee_ledger
         SET amount_paid = $1,
             status = CASE
               WHEN $1 >= amount_due                    THEN 'paid'
               WHEN $1 > 0 AND $1 < amount_due          THEN 'partial'
               WHEN due_date < CURRENT_DATE             THEN 'overdue'
               ELSE 'pending'
             END
         WHERE id = $2`,
        [newAmountPaid, waiver.ledger_id]
      )

      await client.query('COMMIT')
      return NextResponse.json({ success: true })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to revoke waiver' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
