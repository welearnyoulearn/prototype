import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/school-calendar?school_id=&year=2026
// Returns all events for the given year (or all if no year).
export async function GET(req: NextRequest) {
  try {

    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const year      = searchParams.get('year')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    let query = `
      SELECT id, title, event_date::text, end_date::text, event_type, color, description, all_day, created_at
      FROM school_calendar
      WHERE school_id = $1
    `
    const params: (string | number)[] = [school_id]

    if (year) {
      query += ` AND EXTRACT(YEAR FROM event_date) = $2`
      params.push(parseInt(year))
    }

    query += ` ORDER BY event_date ASC`
    const { rows } = await pool.query(query, params)
    return NextResponse.json(rows)
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/school-calendar
// Body: { school_id, title, event_date, end_date?, event_type, color?, description? }
export async function POST(req: NextRequest) {
  try {

    const body = await req.json()
    const {
      school_id, title, event_date, end_date,
      event_type = 'event', color = 'blue', description, all_day = true,
    } = body

    if (!school_id || !title?.trim() || !event_date) {
      return NextResponse.json({ error: 'school_id, title, event_date required' }, { status: 400 })
    }
    if (!['holiday', 'exam', 'event', 'meeting', 'other'].includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
    }

    const { rows: [row] } = await pool.query(`
      INSERT INTO school_calendar
        (school_id, title, event_date, end_date, event_type, color, description, all_day)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *, event_date::text, end_date::text
    `, [school_id, title.trim(), event_date, end_date || null, event_type, color, description || null, all_day])

    return NextResponse.json(row, { status: 201 })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
