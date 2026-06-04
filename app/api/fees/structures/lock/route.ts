import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/fees/structures/lock — lock or unlock a fee structure for an academic year
// Body: { school_id, academic_year, action: 'lock'|'unlock', locked_by }
export async function POST(req: NextRequest) {
  try {
    const { school_id, academic_year, action, locked_by } = await req.json()
    if (!school_id || !academic_year || !action) {
      return NextResponse.json({ error: 'school_id, academic_year, action required' }, { status: 400 })
    }

    if (action === 'lock') {
      if (!locked_by) return NextResponse.json({ error: 'locked_by required' }, { status: 400 })
      const { rows: [lock] } = await pool.query(
        `INSERT INTO fee_structure_locks (school_id, academic_year, locked_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (school_id, academic_year) DO UPDATE
           SET locked_by = $3, locked_at = NOW()
         RETURNING *`,
        [school_id, academic_year, locked_by]
      )
      return NextResponse.json(lock)
    }

    if (action === 'unlock') {
      await pool.query(
        `DELETE FROM fee_structure_locks WHERE school_id = $1 AND academic_year = $2`,
        [school_id, academic_year]
      )
      return NextResponse.json({ unlocked: true })
    }

    return NextResponse.json({ error: 'action must be lock or unlock' }, { status: 400 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// GET /api/fees/structures/lock?school_id=X&academic_year=Y
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id    = p.get('school_id')
  const academic_year = p.get('academic_year')
  if (!school_id || !academic_year) {
    return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
  }
  try {
    const { rows: [tbl] } = await pool.query(`SELECT to_regclass('fee_structure_locks') IS NOT NULL AS exists`)
    if (!tbl.exists) return NextResponse.json(null)
    const { rows: [lock] } = await pool.query(
      `SELECT * FROM fee_structure_locks WHERE school_id = $1 AND academic_year = $2`,
      [school_id, academic_year]
    )
    return NextResponse.json(lock || null)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
