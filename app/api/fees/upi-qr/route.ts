import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/fees/upi-qr?amount=1000&school_id=X — returns PNG QR code for school's UPI ID
export async function GET(req: NextRequest) {
  if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const amount    = p.get('amount') || '0'
  const school_id = p.get('school_id')

  // Fetch school's UPI ID (self-healing column)
  let upiId = 'school@upi'
  let schoolName = 'School'
  if (school_id) {
    try {
      await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS upi_id TEXT`)
      const { rows: [sc] } = await pool.query(
        `SELECT name, upi_id FROM schools WHERE id = $1`, [school_id]
      )
      if (sc) {
        schoolName = sc.name || schoolName
        upiId = sc.upi_id || upiId
      }
    } catch { /* fallback */ }
  }

  const encodedName = encodeURIComponent(schoolName)
  const upiLink = `upi://pay?pa=${upiId}&pn=${encodedName}&am=${amount}&cu=INR&tn=School%20Fee%20Payment`

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
