import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/parent/fees?school_id=X&student_id=Y&academic_year=2025-26
export async function GET(req: NextRequest) {
  try {
    if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const p = req.nextUrl.searchParams
    const school_id   = p.get('school_id')
    const student_id  = p.get('student_id')
    if (!school_id || !student_id) return NextResponse.json({ error: 'school_id, student_id required' }, { status: 400 })
    const academic_year = p.get('academic_year') || await pool.query(
      `SELECT label FROM academic_years WHERE school_id=$1 AND is_current=TRUE LIMIT 1`, [school_id]
    ).then(r => r.rows[0]?.label ?? '2025-26').catch(() => '2025-26')

    try {
      // Auto-mark overdue for this student only (targeted, not full table scan)
      await pool.query(
        `UPDATE student_fee_ledger SET status = 'overdue'
         WHERE school_id = $1 AND student_id = $2 AND status = 'pending' AND due_date < CURRENT_DATE`,
        [school_id, student_id]
      )

      const { rows: ledger } = await pool.query(
        `SELECT l.*, fc.name AS category_name, fc.frequency,
                 (l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid) AS balance
         FROM student_fee_ledger l
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE l.school_id = $1 AND l.student_id = $2 AND l.academic_year = $3
         ORDER BY l.due_date ASC`,
        [school_id, student_id, academic_year]
      )

      const { rows: payments } = await pool.query(
        `SELECT fp.id, fp.receipt_number, fp.amount, fp.payment_mode, fp.payment_status,
                fp.paid_date, fp.transaction_ref, fp.notes,
                fp.rejection_reason, fp.verified_at,
                fc.name AS category_name, l.period_label
         FROM fee_payments fp
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE fp.school_id = $1 AND fp.student_id = $2
         ORDER BY fp.paid_date DESC, fp.created_at DESC`,
        [school_id, student_id]
      )

      // Fetch waivers so parent sees the full picture of what was reduced/waived
      const { rows: waivers } = await pool.query(
        `SELECT w.id, w.waiver_type, w.waiver_amount, w.reason, w.granted_by_name, w.created_at,
                fc.name AS category_name, l.period_label, l.amount_due
         FROM fee_waivers w
         JOIN student_fee_ledger l ON l.id = w.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE w.school_id = $1 AND w.student_id = $2
         ORDER BY w.created_at DESC`,
        [school_id, student_id]
      ).catch(() => ({ rows: [] }))

      const total_due         = ledger.reduce((s, r) => s + Number(r.amount_due), 0)
      const total_paid        = ledger.reduce((s, r) => s + Number(r.amount_paid), 0)
      const total_outstanding = ledger.reduce((s, r) => s + Number(r.balance), 0)
      const total_waived      = (waivers as Array<{waiver_amount: number}>).reduce((s, r) => s + Number(r.waiver_amount), 0)
      const overdue_count     = ledger.filter(r => r.status === 'overdue').length

      return NextResponse.json({ ledger, payments, waivers, summary: { total_due, total_paid, total_outstanding, total_waived, overdue_count } })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/parent/fees — parent initiates online payment (pending_verification)
//
// Single-entry:  { school_id, student_id, ledger_id, amount, transaction_ref?, upi_id? }
// Multi-entry:   { school_id, student_id, ledger_ids: [1,2,3], total_amount, transaction_ref?, upi_id? }
//   Multi-entry uses FIFO allocation — same as admin payments API.
//
export async function POST(req: NextRequest) {
  try {
    if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await pool.connect()
    try {
      const { school_id, student_id, ledger_id, ledger_ids, amount, total_amount, transaction_ref, upi_id } = await req.json()
      if (!school_id || !student_id) {
        return NextResponse.json({ error: 'school_id, student_id required' }, { status: 400 })
      }

      const isMulti = Array.isArray(ledger_ids) && ledger_ids.length > 0
      const payAmount = isMulti ? parseFloat(String(total_amount)) : parseFloat(String(amount))

      if (!payAmount || payAmount <= 0) {
        return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
      }
      if (!isMulti && !ledger_id) {
        return NextResponse.json({ error: 'ledger_id required for single-entry payment' }, { status: 400 })
      }

      await client.query('BEGIN')

      const { rows: [seq] } = await client.query(`SELECT nextval('receipt_number_seq') AS n`)
      const schoolCode = String(school_id).padStart(3, '0')
      const receipt_number = `RCP-${schoolCode}-${new Date().getFullYear()}-${String(seq.n).padStart(6, '0')}`
      const notes = upi_id ? `Parent UPI: ${upi_id}` : 'Parent online payment'

      const createdPayments = []

      if (!isMulti) {
        // Verify ledger_id belongs to this student, lock the row, and validate the
        // amount against the true balance (amount_due - waiver_amount - amount_paid)
        // — mirrors the admin payments route's excess-payment guard.
        const { rows: [ledgerRow] } = await client.query(
          `SELECT amount_due, amount_paid, COALESCE(waiver_amount, 0) AS waiver_amount
           FROM student_fee_ledger
           WHERE id = $1 AND school_id = $2 AND student_id = $3
             AND status NOT IN ('paid', 'waived')
           FOR UPDATE`,
          [ledger_id, school_id, student_id]
        )
        if (!ledgerRow) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'Ledger entry not found or not payable' }, { status: 404 })
        }
        const balance = parseFloat(ledgerRow.amount_due) - parseFloat(ledgerRow.waiver_amount) - parseFloat(ledgerRow.amount_paid)
        if (payAmount > balance + 0.001) {
          await client.query('ROLLBACK')
          const msg = balance <= 0
            ? 'This fee has already been paid. Please refresh and try again.'
            : `Amount exceeds balance due (₹${balance.toFixed(2)}).`
          return NextResponse.json({ error: msg }, { status: 400 })
        }

        // Single ledger entry
        const { rows: [payment] } = await client.query(
          `INSERT INTO fee_payments
             (school_id, student_id, ledger_id, amount, payment_mode, payment_status,
              receipt_number, transaction_ref, paid_date, notes)
           VALUES ($1,$2,$3,$4,'online','pending_verification',$5,$6,CURRENT_DATE,$7)
           RETURNING *`,
          [school_id, student_id, ledger_id, payAmount, receipt_number, transaction_ref || null, notes]
        )
        createdPayments.push(payment)
      } else {
        // Multi-entry FIFO — fetch entries in due-date order, locked against concurrent submissions
        const { rows: entries } = await client.query(
          `SELECT id, amount_due, amount_paid, COALESCE(waiver_amount, 0) AS waiver_amount,
                  GREATEST(amount_due - COALESCE(waiver_amount, 0) - amount_paid, 0) AS balance
           FROM student_fee_ledger
           WHERE id = ANY($1) AND school_id = $2 AND student_id = $3
             AND status NOT IN ('paid', 'waived')
           ORDER BY due_date ASC
           FOR UPDATE`,
          [ledger_ids, school_id, student_id]
        )

        const totalBalance = entries.reduce((sum, e) => sum + parseFloat(String(e.balance)), 0)
        if (payAmount > totalBalance + 0.001) {
          await client.query('ROLLBACK')
          const msg = totalBalance <= 0
            ? 'These fees have already been paid. Please refresh and try again.'
            : `Amount exceeds total balance due (₹${totalBalance.toFixed(2)}).`
          return NextResponse.json({ error: msg }, { status: 400 })
        }

        let remaining = payAmount
        for (const entry of entries) {
          if (remaining <= 0) break
          const balance = parseFloat(String(entry.balance))
          if (balance <= 0) continue
          const remainingPaise = Math.round(remaining * 100)
          const balancePaise   = Math.round(balance * 100)
          const allocatePaise  = Math.min(remainingPaise, balancePaise)
          const allocate = allocatePaise / 100
          remaining = (remainingPaise - allocatePaise) / 100

          const { rows: [payment] } = await client.query(
            `INSERT INTO fee_payments
               (school_id, student_id, ledger_id, amount, payment_mode, payment_status,
                receipt_number, transaction_ref, paid_date, notes)
             VALUES ($1,$2,$3,$4,'online','pending_verification',$5,$6,CURRENT_DATE,$7)
             RETURNING *`,
            [school_id, student_id, entry.id, allocate, receipt_number, transaction_ref || null, notes]
          )
          createdPayments.push(payment)
        }
      }

      await client.query('COMMIT')

      return NextResponse.json({
        receipt_number,
        total_amount: payAmount,
        entries_count: createdPayments.length,
        message: 'Payment submitted. School will verify and confirm shortly.',
      }, { status: 201 })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to submit payment' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
