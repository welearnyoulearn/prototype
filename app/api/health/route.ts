import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  const env = {
    pghost:     process.env.PGHOST     ?? 'MISSING',
    pgport:     process.env.PGPORT     ?? 'MISSING',
    pguser:     process.env.PGUSER     ?? 'MISSING',
    pgpassword: process.env.PGPASSWORD ? `set(${process.env.PGPASSWORD.length} chars)` : 'MISSING',
    pgdatabase: process.env.PGDATABASE ?? 'MISSING',
    jwt:        process.env.JWT_SECRET ? 'set' : 'MISSING',
  }

  try {
    const { rows } = await pool.query('SELECT NOW() as time')
    return NextResponse.json({ ok: true, db: 'connected', time: rows[0].time, env })
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, db: 'FAILED', error: String(err), env }, { status: 500 })
  }
}
