import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/timetable-versions?school_id=X  — list all versions for a school
// POST /api/timetable-versions             — create a new version

export async function GET(req: NextRequest) {

  const school_id = new URL(req.url).searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      `SELECT * FROM timetable_versions WHERE school_id=$1 ORDER BY created_at DESC`,
      [school_id]
    )
    return NextResponse.json(rows)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {

  try {
    const { school_id, name } = await req.json()
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    const versionName = (name || 'Draft').trim() || 'Draft'
    const { rows } = await pool.query(
      `INSERT INTO timetable_versions (school_id, name, status, is_active)
       VALUES ($1, $2, 'draft', FALSE) RETURNING *`,
      [school_id, versionName]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create version' }, { status: 500 })
  }
}
