import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/academic-year/current?school_id=X
// Returns the current academic year for a school.
// Falls back to the most recent year if none is flagged is_current.
// Any signed-in school user (staff, teacher, student, parent), for their own school only.
export async function GET(req: NextRequest) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const raw = req.nextUrl.searchParams.get('school_id')
    if (raw !== null && Number(raw) !== session.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const school_id = session.schoolId

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
