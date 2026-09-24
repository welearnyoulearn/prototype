import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/year-rollover?school_id=X
// Returns list of closed academic years for this school.
//
// There is no POST any more: creating the next year, promoting students and switching the
// active year all happen in ONE place — POST /api/academic-years/rollover — once the fee
// year-end (POST /api/fees/year-end, action close) is complete.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    try {
      const { rows } = await pool.query(
        `SELECT academic_year, closed_at, closed_by, is_reopened
         FROM fee_year_close
         WHERE school_id = $1 AND is_reopened = FALSE
         ORDER BY closed_at DESC`,
        [school_id]
      )
      return NextResponse.json(rows)
    } catch { return NextResponse.json([]) }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
