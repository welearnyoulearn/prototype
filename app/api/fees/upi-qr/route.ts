import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/fees/upi-qr?amount=1000&school_id=X — returns PNG QR code for school's UPI ID
// Callable by any logged-in user (admin records; parent pays) but only for THEIR school.
//
// ============================================================================
// FUTURE: Payment Gateway Integration (Cashfree)
// ----------------------------------------------------------------------------
// Today: this route only ever builds a static `upi://pay` deep link against
// the school's own UPI ID (schools.upi_id) — no gateway involved. The parent
// scans it, pays in their own UPI app, then self-reports the transaction ID
// via POST /api/parent/fees for a school admin to manually verify.
//
// Planned: once Cashfree goes live (schema already scaffolded —
// school_payment_config, payment_transactions, payment_webhook_log in
// lib/db.ts), this manual QR path is replaced end-to-end by:
//   1. Parent taps "Pay" → server creates a Cashfree order
//      (POST to Cashfree's Orders API using the school's own
//      school_payment_config credentials, decrypted via lib/encryption.ts
//      the same way Cashfree secrets are already handled elsewhere) and
//      stores it in payment_transactions with a fresh idempotency_key.
//   2. Parent is redirected to Cashfree's hosted checkout (or shown Cashfree's
//      own dynamic UPI-intent QR) instead of this static deep link.
//   3. Cashfree calls back on completion; the webhook handler verifies the
//      payload signature, logs it to payment_webhook_log, and — on success —
//      automatically marks the matching student_fee_ledger row(s) paid,
//      inserts the fee_payments row itself (no admin verification step),
//      and generates + delivers the receipt (email/WhatsApp) automatically.
//   4. School admin's Collect → Online queue becomes a real-time settled-
//      payments feed instead of a manual pending_verification review queue.
// No caller of this route needs to change shape when that lands — only the
// QR-generation internals here get replaced by a gateway-order redirect.
// ============================================================================
export async function GET(req: NextRequest) {
  const session = await getAnySession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const amount    = p.get('amount') || '0'
  const school_id = p.get('school_id')
  // Optional payer-supplied reference (e.g. a ledger/bill id or receipt-style
  // token) so the QR's own `tr` param and what the parent later types back in
  // as their transaction ID reconciliation hint line up — purely a UI
  // convenience today; the actual match to a bill happens via the amount +
  // manual entry flow in POST /api/parent/fees, not this param.
  const ref       = p.get('ref')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  // Tenant check: the requested school must match the session's school
  if (Number(school_id) !== Number(session.schoolId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch school's UPI ID
  let upiId: string | null = null
  let schoolName = 'School'
  try {
    const { rows: [sc] } = await pool.query(
      `SELECT name, upi_id FROM schools WHERE id = $1`, [school_id]
    )
    if (sc) {
      schoolName = sc.name || schoolName
      upiId = sc.upi_id || null
    }
  } catch { /* handled below */ }

  // Refuse to generate a QR for a missing/invalid UPI ID — paying to a wrong account is dangerous
  if (!upiId || !upiId.includes('@')) {
    return NextResponse.json({ error: 'no_upi_id', message: 'This school has not configured a UPI ID for online payments.' }, { status: 400 })
  }

  const encodedName = encodeURIComponent(schoolName)
  const trParam = ref ? `&tr=${encodeURIComponent(ref)}` : ''
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodedName}&am=${amount}&cu=INR&tn=School%20Fee%20Payment${trParam}`

  try {
    const buffer = await QRCode.toBuffer(upiLink, { width: 300, margin: 2, color: { dark: '#1e3a5f', light: '#ffffff' } })
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 })
  }
}
