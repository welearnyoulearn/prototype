import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/academic-year/current?school_id=X
// Returns the current academic year for a school.
// Falls back to the most recent year if none is flagged is_current.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    try {
      // First try is_current=true
      let { rows } = await pool.query(
        `SELECT id, label, is_current, start_date::text, end_date::text
         FROM academic_years
         WHERE school_id = $1 AND is_current = TRUE
         LIMIT 1`,
        [school_id]
      )

      // Fallback: newest year by start_date
      if (!rows.length) {
        ;({ rows } = await pool.query(
          `SELECT id, label, is_current, start_date::text, end_date::text
           FROM academic_years
           WHERE school_id = $1
           ORDER BY start_date DESC
           LIMIT 1`,
          [school_id]
        ))
      }

      if (!rows.length) {
        return NextResponse.json({ error: 'No academic year found' }, { status: 404 })
      }

      return NextResponse.json(rows[0])
    } catch (err) {
      console.error('academic-year/current error:', err)
      return NextResponse.json({ error: 'Failed to fetch current academic year' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
