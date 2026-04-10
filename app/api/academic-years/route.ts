import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/academic-years?school_id=
// Returns all academic years for a school, ordered newest first.
export async function GET(req: NextRequest) {

  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { rows } = await pool.query(`
    SELECT
      ay.*,
      ay.start_date::text,
      ay.end_date::text,
      (
        SELECT COUNT(DISTINCT sch.student_id)::int
        FROM student_class_history sch
        WHERE sch.academic_year_id = ay.id
      ) AS student_snapshot_count
    FROM academic_years ay
    WHERE ay.school_id = $1
    ORDER BY ay.start_date DESC
  `, [school_id])

  return NextResponse.json(rows)
}

// POST /api/academic-years
// Body: { school_id, label, start_date, end_date, set_current? }
// Creates a new academic year. If set_current=true, clears is_current on all others first.
export async function POST(req: NextRequest) {

  const body = await req.json()
  const { school_id, label, start_date, end_date, set_current = false } = body

  if (!school_id || !label?.trim() || !start_date || !end_date) {
    return NextResponse.json({ error: 'school_id, label, start_date, end_date required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (set_current) {
      await client.query(
        `UPDATE academic_years SET is_current = FALSE WHERE school_id = $1`,
        [school_id]
      )
    }

    const { rows: [row] } = await client.query(`
      INSERT INTO academic_years (school_id, label, start_date, end_date, is_current)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *, start_date::text, end_date::text
    `, [school_id, label.trim(), start_date, end_date, set_current])

    await client.query('COMMIT')
    return NextResponse.json(row, { status: 201 })
  } catch (err: unknown) {
    await client.query('ROLLBACK')
    const msg = err instanceof Error ? err.message : 'Failed'
    if (msg.includes('unique')) {
      return NextResponse.json({ error: `Academic year "${label}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create academic year' }, { status: 500 })
  } finally {
    client.release()
  }
}

// PATCH /api/academic-years?id=&school_id=
// Sets a specific year as current (clears all others for that school).
export async function PATCH(req: NextRequest) {

  const id        = req.nextUrl.searchParams.get('id')
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!id || !school_id) return NextResponse.json({ error: 'id and school_id required' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`UPDATE academic_years SET is_current = FALSE WHERE school_id = $1`, [school_id])
    await client.query(`UPDATE academic_years SET is_current = TRUE  WHERE id = $1 AND school_id = $2`, [id, school_id])
    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: 'Failed to set current year' }, { status: 500 })
  } finally {
    client.release()
  }
}
