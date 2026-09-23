import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendFeePaymentConfirmedEmail, sendFeePaymentRejectedEmail } from '@/lib/email'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'
import { withWatchline } from '@/lib/logger'

// GET /api/fees/payments/verify?school_id=X — list pending_verification payments
async function handleGET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    try {
      const { rows } = await pool.query(
        `SELECT fp.*, s.name AS student_name, s.roll_number, s.grade, s.section,
                fc.name AS category_name, l.period_label, l.amount_due, l.amount_paid,
                GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0) AS ledger_balance
         FROM fee_payments fp
         JOIN students s ON s.id = fp.student_id
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE fp.school_id = $1 AND fp.payment_status = 'pending_verification'
         ORDER BY fp.created_at DESC`,
        [school_id]
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const GET = withWatchline(handleGET, { route: '/api/fees/payments/verify' })

// POST /api/fees/payments/verify — approve or reject a pending payment
// Body: { payment_id, action: 'approve'|'reject', verified_by, rejection_reason? }
//
// ============================================================================
// FUTURE: Payment Gateway Integration (Cashfree)
// ----------------------------------------------------------------------------
// Today: every online payment lands here as payment_status='pending_verification'
// (self-reported by the parent, see POST /api/parent/fees) and a school admin
// has to manually approve/reject it in Collect → Online before the parent's
// receipt becomes visible in their Fees tab.
//
// Planned: once Cashfree's webhook is live, a gateway-completed payment skips
// this manual step entirely — the webhook handler inserts the fee_payments
// row already 'completed' (never 'pending_verification'), applies the same
// ledger update this route does above, and triggers receipt
// generation/delivery (email/WhatsApp) automatically, in real time. This
// route stays in place for genuinely offline/manual submissions (or as a
// fallback if a webhook is ever missed), but stops being the only path to a
// confirmed receipt. School-side tracking becomes a live settled-payments
// feed rather than a review queue.
// ============================================================================
async function handlePOST(req: NextRequest) {
  try {
    const client = await pool.connect()
    try {
      const { payment_id, action, verified_by: clientActor, rejection_reason } = await req.json()
      if (!payment_id || !action) {
        return NextResponse.json({ error: 'payment_id, action required' }, { status: 400 })
      }
      // Resolve the payment's school and verify ownership
      const { rows: [pmtRow] } = await client.query(`SELECT school_id FROM fee_payments WHERE id = $1`, [payment_id])
      if (!pmtRow) { client.release(); return NextResponse.json({ error: 'Payment not found' }, { status: 404 }) }
      // Pass `client` — requireFeeAccess's school-staff path runs a real query
      // (session validation); calling it with the default `pool` here, after
      // this handler's own pool.connect() above, deadlocks on a max:1 pool.
      const access = await requireFeeAccess(pmtRow.school_id, client)
      if (!access) { client.release(); return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
      const verified_by = clientActor || access.actor

      await client.query('BEGIN')

      // FOR UPDATE: without this, two concurrent verify calls on the same
      // payment (double-click, or an approve racing a reject) can both pass
      // this check before either commits — the second writer then blindly
      // overwrites payment_status and, for approve, double-applies the
      // ledger credit. Locking the row makes the second transaction wait for
      // the first to commit, then re-evaluate this WHERE clause against the
      // now-current row — so it correctly finds nothing and 404s instead of
      // racing.
      const { rows: [payment] } = await client.query(
        `SELECT * FROM fee_payments WHERE id = $1 AND payment_status = 'pending_verification' FOR UPDATE`,
        [payment_id]
      )
      if (!payment) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Payment not found or already processed' }, { status: 404 })
      }

      if (action === 'approve') {
        // Same reasoning as the closed-year guard just below: reject never
        // touches money, so it stays available even for a school whose plan
        // has since lost online-payments (still need to be able to clear a
        // stuck queue); approve credits the ledger, so it needs the same
        // server-side plan gate the self-report endpoint and QR/UPI-ID routes
        // already have — the UI hides this tab, but that's presentation only.
        // Pass `client` — on a max:1 pool, calling this with the default `pool`
        // while `client` is still held (mid-transaction, since BEGIN above)
        // deadlocks waiting for a second connection this handler is already using.
        if (!await schoolHasFeature(pmtRow.school_id, 'online-payments', client)) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'Online payments is not enabled for this school' }, { status: 403 })
        }

        // Block crediting a closed year's ledger — reject doesn't touch the
        // ledger at all (only flips payment_status), so it stays allowed
        // regardless of year-close state; approve does, so it needs the same
        // guard every other ledger-mutating fee route has.
        const { rows: [closedYear] } = await client.query(
          `SELECT 1 FROM fee_year_close fyc
           JOIN student_fee_ledger l ON l.academic_year = fyc.academic_year AND l.school_id = fyc.school_id
           WHERE l.id = $1 AND fyc.school_id = $2 AND fyc.is_reopened = FALSE`,
          [payment.ledger_id, pmtRow.school_id]
        )
        if (closedYear) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'This academic year is closed. Reopen it to approve this payment.' }, { status: 409 })
        }

        // Lock the ledger row and check its CURRENT balance before crediting.
        // Previously this went straight to LEAST(amount_due-waiver, amount_paid+amount)
        // on the UPDATE below, which silently capped the ledger credit whenever an
        // offline (cash/cheque) payment had been collected in the meantime — but
        // still marked this fee_payments row fully 'completed' for the ORIGINAL
        // amount. That let receipts (sum of completed fee_payments.amount) exceed
        // what the ledger showed as paid, and a later cancellation of this payment
        // reversed the full original amount — which could wipe out the unrelated
        // offline credit too. Rejecting here (same convention as every other
        // ledger-mutating fee route) forces the admin to reconcile the overlap —
        // e.g. cancel/correct the offline collection — before approving, so the
        // amount actually credited always matches what this fee_payments row says.
        const { rows: [ledgerRow] } = await client.query(
          `SELECT amount_due, amount_paid, COALESCE(waiver_amount, 0) AS waiver_amount
           FROM student_fee_ledger WHERE id = $1 FOR UPDATE`,
          [payment.ledger_id]
        )
        const currentBalance = parseFloat(ledgerRow.amount_due) - parseFloat(ledgerRow.waiver_amount) - parseFloat(ledgerRow.amount_paid)
        const paymentAmount = parseFloat(payment.amount)
        if (paymentAmount > currentBalance + 0.001) {
          await client.query('ROLLBACK')
          return NextResponse.json({
            error: `Approving this ₹${paymentAmount} payment would exceed the bill's remaining balance (₹${Math.max(0, currentBalance).toFixed(2)}) — another payment or waiver was recorded on this bill since this was submitted. Reconcile the other collection first (cancel/correct it), then approve.`,
          }, { status: 409 })
        }

        // Mark payment as completed
        await client.query(
          `UPDATE fee_payments
           SET payment_status = 'completed', verified_by = $1, verified_at = NOW()
           WHERE id = $2`,
          [verified_by, payment_id]
        )

        // Update ledger: amount_paid += payment.amount (waiver_amount already applied
        // separately). The balance check above guarantees this stays within
        // amount_due-waiver, so no LEAST(...) cap is needed here anymore — the
        // amount credited now always equals exactly what this payment row records.
        await client.query(
          `UPDATE student_fee_ledger
           SET amount_paid = amount_paid + $1,
               status = CASE
                 WHEN COALESCE(waiver_amount,0) + amount_paid + $1 >= amount_due THEN 'paid'
                 WHEN amount_paid + $1 > 0 THEN 'partial'
                 ELSE status
               END
           WHERE id = $2`,
          [payment.amount, payment.ledger_id]
        )

        await client.query('COMMIT')

        // Send confirmation email to parent (non-blocking)
        try {
          // Reuse `client` (still held below, released in `finally`) rather than
          // `pool.query` — on Vercel's max:1 pool, requesting a second connection
          // while this handler still holds the only one deadlocks until
          // connectionTimeoutMillis fails the whole request.
          const { rows: [detail] } = await client.query(
            `SELECT s.parent_email, s.parent_name, s.name AS student_name,
                    sc.name AS school_name,
                    fc.name AS category_name, l.period_label,
                    fp.amount, fp.receipt_number, fp.payment_mode, fp.paid_date
             FROM fee_payments fp
             JOIN students s ON s.id = fp.student_id
             JOIN student_fee_ledger l ON l.id = fp.ledger_id
             JOIN fee_categories fc ON fc.id = l.fee_category_id
             JOIN schools sc ON sc.id = fp.school_id
             WHERE fp.id = $1`, [payment_id]
          )
          if (detail?.parent_email) {
            sendFeePaymentConfirmedEmail({
              to: detail.parent_email,
              parentName: detail.parent_name || 'Parent',
              studentName: detail.student_name,
              schoolName: detail.school_name,
              receiptNumber: detail.receipt_number,
              amount: parseFloat(detail.amount),
              categoryName: detail.category_name,
              periodLabel: detail.period_label,
              paymentMode: detail.payment_mode,
              paidDate: detail.paid_date,
              verifiedBy: verified_by,
            }).catch(() => {})
          }
        } catch { /* email failure must not block the response */ }

        return NextResponse.json({ approved: true, payment_id })
      }

      if (action === 'reject') {
        await client.query(
          `UPDATE fee_payments
           SET payment_status = 'rejected', verified_by = $1, verified_at = NOW(), rejection_reason = $2
           WHERE id = $3`,
          [verified_by, rejection_reason || 'Rejected by admin', payment_id]
        )
        await client.query('COMMIT')

        // Send rejection email to parent (non-blocking)
        try {
          // See the matching comment in the approve branch above — reuse
          // `client`, don't request a second connection from a max:1 pool.
          const { rows: [detail] } = await client.query(
            `SELECT s.parent_email, s.parent_name, s.name AS student_name,
                    sc.name AS school_name,
                    fc.name AS category_name, l.period_label,
                    fp.amount, fp.receipt_number
             FROM fee_payments fp
             JOIN students s ON s.id = fp.student_id
             JOIN student_fee_ledger l ON l.id = fp.ledger_id
             JOIN fee_categories fc ON fc.id = l.fee_category_id
             JOIN schools sc ON sc.id = fp.school_id
             WHERE fp.id = $1`, [payment_id]
          )
          if (detail?.parent_email) {
            sendFeePaymentRejectedEmail({
              to: detail.parent_email,
              parentName: detail.parent_name || 'Parent',
              studentName: detail.student_name,
              schoolName: detail.school_name,
              receiptNumber: detail.receipt_number,
              amount: parseFloat(detail.amount),
              categoryName: detail.category_name,
              periodLabel: detail.period_label,
              rejectionReason: rejection_reason || 'Rejected by admin',
            }).catch(() => {})
          }
        } catch { /* non-blocking */ }

        return NextResponse.json({ rejected: true, payment_id })
      }

      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to process verification' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
// No getSchoolId extractor — same reasoning as payments/cancel: avoid a second
// query competing with the handler's own pool.connect() under a max:1 pool.
export const POST = withWatchline(handlePOST, { route: '/api/fees/payments/verify' })
