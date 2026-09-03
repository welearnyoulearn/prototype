import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/fees/upi-qr/info?school_id=X — returns { upi_id, school_name } as
// plain JSON, for the parent Fees tab to show the UPI ID as copyable text
// alongside the QR from GET /api/fees/upi-qr (which only ever returns a PNG
// and can't carry this back to an <img> tag). Deliberately NOT the same
// route as GET /api/fees/upi-id — that one is requireFeeAccess-gated
// (school-admin only, since it also backs the PUT that sets the value) and
// this needs to be readable by parents too. Same "any logged-in user, but
// only for their own school" guard as upi-qr itself.
export async function GET(req: NextRequest) {
  const session = await getAnySession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (Number(school_id) !== Number(session.schoolId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { rows: [sc] } = await pool.query(`SELECT name, upi_id FROM schools WHERE id = $1`, [school_id])
    return NextResponse.json({ upi_id: sc?.upi_id || '', school_name: sc?.name || 'School' })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
