import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// POST /api/fees/payments/cancel
// Cancel (reverse) a completed payment, OR correct it (cancel + re-record with new values).
// Body:
//   { payment_id, action: 'cancel', reason }
//   { payment_id, action: 'correct', reason,
//     new_amount?, new_payment_mode?, new_transaction_ref?, new_paid_date? }
// done_by is derived server-side from the session.
//
// Always: reverses the ledger, soft-marks the payment 'cancelled', records an audit row.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { payment_id, action = 'cancel', reason } = body
    if (!payment_id || !reason) {
      return NextResponse.json({ error: 'payment_id, reason required' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      // Self-heal cancel-tracking columns
      await client.query(`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS cancelled_by    TEXT`)
      await client.query(`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMPTZ`)
      await client.query(`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS cancel_reason   TEXT`)
      await client.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) NOT NULL DEFAULT 0`)

      // Fetch the payment
      const { rows: [pmt] } = await client.query(
        `SELECT fp.*, l.academic_year, l.amount_due, l.amount_paid AS ledger_paid
         FROM fee_payments fp
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         WHERE fp.id = $1`,
        [payment_id]
      )
      if (!pmt) { client.release(); return NextResponse.json({ error: 'Payment not found' }, { status: 404 }) }
      // Verify the caller owns this payment's school (school-admin only)
      const access = await requireFeeAccess(pmt.school_id)
      if (!access) { client.release(); return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
      const done_by = access.actor
      if (pmt.payment_status === 'cancelled') {
        return NextResponse.json({ error: 'Payment already cancelled' }, { status: 409 })
      }

      // Block if the academic year is closed
      const { rows: [locked] } = await client.query(
        `SELECT 1 FROM fee_year_close WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE LIMIT 1`,
        [pmt.school_id, pmt.academic_year]
      ).catch(() => ({ rows: [] }))
      if (locked) {
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to cancel/correct payments.' }, { status: 409 })
      }

      await client.query('BEGIN')

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
                 WHEN GREATEST(0, amount_paid - $1) <= 0                              THEN (CASE WHEN due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END)
                 WHEN GREATEST(0, amount_paid - $1) < amount_due                      THEN 'partial'
                 ELSE 'paid'
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
          `SELECT amount_due, amount_paid, due_date FROM student_fee_ledger WHERE id = $1`, [pmt.ledger_id]
        )
        const amountDue = parseFloat(lg.amount_due)
        const alreadyPaid = parseFloat(lg.amount_paid)        // other payments still on this bill
        const requiredDue = alreadyPaid + newAmount           // bill must cover all real payments

        // If the corrected payment makes total paid exceed the bill, raise the bill amount_due
        // to absorb it (admin is allowed to push the generated bill up or down). Logged as an edit.
        let billAdjusted = false
        if (requiredDue > amountDue + 0.01) {
          await client.query(`
            CREATE TABLE IF NOT EXISTS student_fee_ledger_edits (
              id SERIAL PRIMARY KEY, ledger_id INTEGER NOT NULL, school_id INTEGER NOT NULL,
              student_id INTEGER NOT NULL, old_amount NUMERIC(10,2) NOT NULL, new_amount NUMERIC(10,2) NOT NULL,
              reason TEXT NOT NULL, changed_by TEXT NOT NULL, changed_at TIMESTAMPTZ DEFAULT NOW()
            )`)
          await client.query(
            `INSERT INTO student_fee_ledger_edits (ledger_id, school_id, student_id, old_amount, new_amount, reason, changed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [pmt.ledger_id, pmt.school_id, pmt.student_id, amountDue, requiredDue,
             `Auto-adjusted via payment correction of ${pmt.receipt_number}: ${reason}`, done_by]
          )
          await client.query(`UPDATE student_fee_ledger SET amount_due = $1 WHERE id = $2`, [requiredDue, pmt.ledger_id])
          billAdjusted = true
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

        // Apply the new payment and recompute status against the (possibly adjusted) due
        await client.query(
          `UPDATE student_fee_ledger
           SET amount_paid = amount_paid + $1,
               status = CASE
                 WHEN amount_paid + $1 >= amount_due THEN 'paid'
                 WHEN amount_paid + $1 > 0           THEN 'partial'
                 WHEN due_date < CURRENT_DATE        THEN 'overdue'
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
           billAdjusted ? `${reason} (bill raised to ₹${requiredDue})` : reason, done_by, newReceipt]
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
