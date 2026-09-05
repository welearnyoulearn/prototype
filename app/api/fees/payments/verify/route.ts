import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendFeePaymentConfirmedEmail, sendFeePaymentRejectedEmail } from '@/lib/email'
import { requireFeeAccess } from '@/lib/auth'
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
      const access = await requireFeeAccess(pmtRow.school_id)
      if (!access) { client.release(); return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
      const verified_by = clientActor || access.actor

      await client.query('BEGIN')

      const { rows: [payment] } = await client.query(
        `SELECT * FROM fee_payments WHERE id = $1 AND payment_status = 'pending_verification'`,
        [payment_id]
      )
      if (!payment) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Payment not found or already processed' }, { status: 404 })
      }

      if (action === 'approve') {
        // Mark payment as completed
        await client.query(
          `UPDATE fee_payments
           SET payment_status = 'completed', verified_by = $1, verified_at = NOW()
           WHERE id = $2`,
          [verified_by, payment_id]
        )

        // Update ledger: amount_paid += payment.amount (waiver_amount already applied separately)
        await client.query(
          `UPDATE student_fee_ledger
           SET amount_paid = LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1),
               status = CASE
                 WHEN COALESCE(waiver_amount,0) + LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1) >= amount_due THEN 'paid'
                 WHEN amount_paid + $1 > 0 THEN 'partial'
                 ELSE status
               END
           WHERE id = $2`,
          [payment.amount, payment.ledger_id]
        )

        await client.query('COMMIT')

        // Send confirmation email to parent (non-blocking)
        try {
          const { rows: [detail] } = await pool.query(
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
          const { rows: [detail] } = await pool.query(
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
