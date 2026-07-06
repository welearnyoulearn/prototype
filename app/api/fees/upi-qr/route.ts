import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/fees/upi-qr?amount=1000&school_id=X — returns PNG QR code for school's UPI ID
// Callable by any logged-in user (admin records; parent pays) but only for THEIR school.
export async function GET(req: NextRequest) {
  const session = await getAnySession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const amount    = p.get('amount') || '0'
  const school_id = p.get('school_id')

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
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodedName}&am=${amount}&cu=INR&tn=School%20Fee%20Payment`

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
