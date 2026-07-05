import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { withWatchline } from '@/lib/logger'

// POST /api/fees/payments/cancel
// Cancel (reverse) a completed payment, OR correct it (cancel + re-record with new values).
// Body:
//   { payment_id, action: 'cancel', reason }
//   { payment_id, action: 'correct', reason,
//     new_amount?, new_payment_mode?, new_transaction_ref?, new_paid_date? }
// done_by is derived server-side from the session.
//
// Always: reverses the ledger, soft-marks the payment 'cancelled', records an audit row.
async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json()
    const { payment_id, action = 'cancel', reason } = body
    if (!payment_id || !reason) {
      return NextResponse.json({ error: 'payment_id, reason required' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      // Fetch the payment (no lock yet — just to resolve school_id for the access check)
      const { rows: [pmtPreview] } = await client.query(
        `SELECT fp.school_id, l.academic_year
         FROM fee_payments fp
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         WHERE fp.id = $1`,
        [payment_id]
      )
      if (!pmtPreview) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      // Verify the caller owns this payment's school (school-admin only)
      const access = await requireFeeAccess(pmtPreview.school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const done_by = access.actor

      // Block if the academic year is closed — fee_year_close is guaranteed to exist
      // (see lib/db.ts), so a query error here is a real failure, not a missing table;
      // let it propagate to the outer catch rather than silently failing this guard open.
      const { rows: [locked] } = await client.query(
        `SELECT 1 FROM fee_year_close WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE LIMIT 1`,
        [pmtPreview.school_id, pmtPreview.academic_year]
      )
      if (locked) {
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to cancel/correct payments.' }, { status: 409 })
      }

      await client.query('BEGIN')

      // Re-fetch WITH a row lock now that we're inside the transaction, so two
      // concurrent cancel/correct requests for the same payment can't both pass
      // the "already cancelled" check and both reverse the ledger.
      const { rows: [pmt] } = await client.query(
        `SELECT fp.*, l.academic_year, l.amount_due, l.amount_paid AS ledger_paid
         FROM fee_payments fp
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         WHERE fp.id = $1
         FOR UPDATE OF fp`,
        [payment_id]
      )
      if (!pmt) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      }
      if (pmt.payment_status === 'cancelled') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Payment already cancelled' }, { status: 409 })
      }

      const wasCompleted = pmt.payment_status === 'completed'
      const origAmount = parseFloat(pmt.amount)

      // 1. Mark original payment cancelled (soft) — preserved for audit
      await client.query(
        `UPDATE fee_payments
         SET payment_status = 'cancelled', cancelled_by = $1, cancelled_at = NOW(), cancel_reason = $2
         WHERE id = $3`,
        [done_by, reason, payment_id]
      )

      // 2. Reverse the ledger only if the original was a completed (counted) payment
      if (wasCompleted) {
        await client.query(
          `UPDATE student_fee_ledger
           SET amount_paid = GREATEST(0, amount_paid - $1),
               status = CASE
                 WHEN COALESCE(waiver_amount,0) + GREATEST(0, amount_paid - $1) >= amount_due THEN 'waived'
                 WHEN GREATEST(0, amount_paid - $1) > 0 THEN 'partial'
                 WHEN EXISTS (SELECT 1 FROM academic_years ay WHERE ay.school_id = student_fee_ledger.school_id AND ay.label = student_fee_ledger.academic_year AND ay.end_date < CURRENT_DATE) THEN 'overdue'
                 ELSE 'pending'
               END
           WHERE id = $2`,
          [origAmount, pmt.ledger_id]
        )
      }

      // 3. Record audit row in a dedicated correction log
      await client.query(`
        CREATE TABLE IF NOT EXISTS fee_payment_corrections (
          id SERIAL PRIMARY KEY,
          school_id INTEGER NOT NULL,
          payment_id INTEGER NOT NULL,
          ledger_id INTEGER NOT NULL,
          student_id INTEGER NOT NULL,
          action TEXT NOT NULL,                 -- cancel | correct
          old_amount NUMERIC(10,2),
          new_amount NUMERIC(10,2),
          old_mode TEXT, new_mode TEXT,
          reason TEXT NOT NULL,
          done_by TEXT NOT NULL,
          new_receipt_number TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`)

      let newReceipt: string | null = null
      let newPaymentId: number | null = null

      // 4. For 'correct': re-record a fresh payment with corrected values
      if (action === 'correct') {
        const newAmount = body.new_amount != null ? parseFloat(body.new_amount) : origAmount
        const newMode = body.new_payment_mode || pmt.payment_mode
        const newRef  = body.new_transaction_ref ?? pmt.transaction_ref
        const newDate = body.new_paid_date || pmt.paid_date
        if (!(newAmount > 0)) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'Corrected amount must be greater than 0' }, { status: 400 })
        }

        // Current ledger state (after the reversal above)
        const { rows: [lg] } = await client.query(
          `SELECT amount_due, amount_paid, waiver_amount, due_date FROM student_fee_ledger WHERE id = $1 FOR UPDATE`, [pmt.ledger_id]
        )
        const amountDue   = parseFloat(lg.amount_due)
        const waiverAmt   = parseFloat(lg.waiver_amount ?? '0')
        const alreadyPaid = parseFloat(lg.amount_paid)   // other payments still on this bill after reversal
        const effectiveDue = amountDue - waiverAmt        // max collectable (bill minus any waiver)

        // Reject if the corrected amount would exceed the remaining balance
        if (alreadyPaid + newAmount > effectiveDue + 0.01) {
          await client.query('ROLLBACK')
          return NextResponse.json({
            error: `Corrected amount ₹${newAmount} exceeds balance of ₹${Math.max(0, effectiveDue - alreadyPaid).toFixed(2)} remaining on this bill`
          }, { status: 400 })
        }

        const { rows: [seq] } = await client.query(`SELECT nextval('receipt_number_seq') AS n`)
        const schoolCode = String(pmt.school_id).padStart(3, '0')
        newReceipt = `RCP-${schoolCode}-${new Date().getFullYear()}-${String(seq.n).padStart(6, '0')}`

        const { rows: [created] } = await client.query(
          `INSERT INTO fee_payments
             (school_id, student_id, ledger_id, amount, payment_mode, payment_status,
              receipt_number, transaction_ref, paid_date, collected_by_name, notes)
           VALUES ($1,$2,$3,$4,$5,'completed',$6,$7,$8,$9,$10)
           RETURNING id`,
          [pmt.school_id, pmt.student_id, pmt.ledger_id, newAmount, newMode,
           newReceipt, newRef || null, newDate, done_by,
           `Correction of ${pmt.receipt_number}: ${reason}`]
        )
        newPaymentId = created.id

        // Apply the new payment with a safety cap so amount_paid never exceeds amount_due - waiver_amount
        await client.query(
          `UPDATE student_fee_ledger
           SET amount_paid = LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1),
               status = CASE
                 WHEN COALESCE(waiver_amount,0) + LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1) >= amount_due THEN 'paid'
                 WHEN LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1) > 0 THEN 'partial'
                 WHEN EXISTS (SELECT 1 FROM academic_years ay WHERE ay.school_id = student_fee_ledger.school_id AND ay.label = student_fee_ledger.academic_year AND ay.end_date < CURRENT_DATE) THEN 'overdue'
                 ELSE 'pending'
               END
           WHERE id = $2`,
          [newAmount, pmt.ledger_id]
        )

        await client.query(
          `INSERT INTO fee_payment_corrections
             (school_id, payment_id, ledger_id, student_id, action, old_amount, new_amount, old_mode, new_mode, reason, done_by, new_receipt_number)
           VALUES ($1,$2,$3,$4,'correct',$5,$6,$7,$8,$9,$10,$11)`,
          [pmt.school_id, payment_id, pmt.ledger_id, pmt.student_id, origAmount, newAmount, pmt.payment_mode, newMode,
           reason, done_by, newReceipt]
        )
      } else {
        // cancel only
        await client.query(
          `INSERT INTO fee_payment_corrections
             (school_id, payment_id, ledger_id, student_id, action, old_amount, new_amount, old_mode, new_mode, reason, done_by)
           VALUES ($1,$2,$3,$4,'cancel',$5,NULL,$6,NULL,$7,$8)`,
          [pmt.school_id, payment_id, pmt.ledger_id, pmt.student_id, origAmount, pmt.payment_mode, reason, done_by]
        )
      }

      await client.query('COMMIT')
      return NextResponse.json({
        ok: true, action,
        cancelled_receipt: pmt.receipt_number,
        new_receipt: newReceipt, new_payment_id: newPaymentId,
        reversed_amount: wasCompleted ? origAmount : 0,
      })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      console.error(e)
      return NextResponse.json({ error: 'Cancel/correct failed' }, { status: 500 })
    } finally { client.release() }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
// No getSchoolId extractor — resolving it would need a second query beyond the
// handler's own pool.connect() lookup, adding avoidable contention on a max:1
// connection pool. Errors/requests here log without a school_id instead.
export const POST = withWatchline(handlePOST, { route: '/api/fees/payments/cancel' })
