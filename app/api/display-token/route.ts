import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import crypto from 'crypto'
import { requireSchoolAdmin } from '@/lib/auth'

// GET /api/display-token?school_id=X — list tokens for this school
export async function GET(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  const { rows } = await pool.query(
    `SELECT * FROM display_tokens WHERE school_id = $1 ORDER BY created_at DESC`,
    [school_id]
  )
  return NextResponse.json(rows)
}

// POST /api/display-token — generate a new token
export async function POST(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { school_id, label } = await req.json()
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    const token = crypto.randomBytes(24).toString('hex')
    const { rows: [row] } = await pool.query(
      `INSERT INTO display_tokens (school_id, token, label) VALUES ($1, $2, $3) RETURNING *`,
      [school_id, token, label || 'Main Display']
    )
    return NextResponse.json(row, { status: 201 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// DELETE /api/display-token?id=X
export async function DELETE(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await pool.query('DELETE FROM display_tokens WHERE id = $1', [id])
  return NextResponse.json({ ok: true })
}
