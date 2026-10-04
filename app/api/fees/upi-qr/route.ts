import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import pool from '@/lib/db'
import { getAnySession, schoolHasFeature } from '@/lib/auth'

// GET /api/fees/upi-qr?amount=1000&school_id=X — returns PNG QR code for school's UPI ID
// Callable by any logged-in user (admin records; parent pays) but only for THEIR school.
//
// FUTURE: Cashfree gateway will replace this manual flow — see docs/DECISIONS.md ("Online payments: Cashfree gateway plan").
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
  // Server-side plan gate — parents/admins could otherwise still fetch a
  // working payment QR for a school whose plan doesn't include online
  // payments, bypassing the UI-only hide.
  if (!await schoolHasFeature(Number(school_id), 'online-payments')) {
    return NextResponse.json({ error: 'Online payments is not enabled for this school' }, { status: 403 })
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
