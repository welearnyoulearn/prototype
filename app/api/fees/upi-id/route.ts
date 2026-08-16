import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/upi-id?school_id=X — returns { upi_id }
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { rows: [sc] } = await pool.query(`SELECT upi_id FROM schools WHERE id = $1`, [school_id])
    return NextResponse.json({ upi_id: sc?.upi_id || '' })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/fees/upi-id  Body: { school_id, upi_id }
export async function PUT(req: NextRequest) {
  try {
    const { school_id, upi_id } = await req.json()
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const value = (upi_id || '').trim()
    // Allow clearing it, otherwise require a valid-looking VPA (must contain '@')
    if (value && !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(value)) {
      return NextResponse.json({ error: 'Enter a valid UPI ID, e.g. school@okhdfcbank' }, { status: 400 })
    }
    await pool.query(`UPDATE schools SET upi_id = $1 WHERE id = $2`, [value || null, school_id])
    return NextResponse.json({ ok: true, upi_id: value })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
