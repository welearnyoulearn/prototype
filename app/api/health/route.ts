import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    await pool.query('SELECT 1')
    return NextResponse.json({ ok: true, db: 'connected' })
  } catch {
    // Public health checks expose availability only. Infrastructure names,
    // account identifiers and raw database errors belong in server logs.
    return NextResponse.json({ ok: false, db: 'unavailable' }, { status: 503 })
  }
}
