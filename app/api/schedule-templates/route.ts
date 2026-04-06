import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET  /api/schedule-templates?school_id=X   — list all templates
// POST /api/schedule-templates               — create { school_id, name, settings }
// PUT  /api/schedule-templates?id=X          — rename { name } or update { settings }
// DELETE /api/schedule-templates?id=X&school_id=X — delete

export async function GET(req: NextRequest) {
  await ensureDB()
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      `SELECT id, name, settings, created_at
       FROM schedule_templates
       WHERE school_id = $1
       ORDER BY created_at ASC`,
      [school_id]
    )
    return NextResponse.json(rows)
  } catch (e) {
    console.error('[schedule-templates GET]', e)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  await ensureDB()
  try {
    const { school_id, name, settings } = await req.json()
    if (!school_id || !name?.trim() || !settings) {
      return NextResponse.json({ error: 'school_id, name, settings required' }, { status: 400 })
    }
    const { rows: [row] } = await pool.query(
      `INSERT INTO schedule_templates (school_id, name, settings)
       VALUES ($1, $2, $3)
       ON CONFLICT (school_id, name) DO UPDATE SET settings = $3
       RETURNING id, name, settings, created_at`,
      [school_id, name.trim(), JSON.stringify(settings)]
    )
    return NextResponse.json(row, { status: 201 })
  } catch (e) {
    console.error('[schedule-templates POST]', e)
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  await ensureDB()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const body = await req.json()
    const fields: string[] = []
    const vals: unknown[] = []
    if (body.name)     { vals.push(body.name.trim()); fields.push(`name = $${vals.length}`) }
    if (body.settings) { vals.push(JSON.stringify(body.settings)); fields.push(`settings = $${vals.length}`) }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    vals.push(id)
    const { rows: [row] } = await pool.query(
      `UPDATE schedule_templates SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    )
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    console.error('[schedule-templates PUT]', e)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  await ensureDB()
  const id = req.nextUrl.searchParams.get('id')
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!id || !school_id) return NextResponse.json({ error: 'id and school_id required' }, { status: 400 })
  try {
    await pool.query('DELETE FROM schedule_templates WHERE id=$1 AND school_id=$2', [id, school_id])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[schedule-templates DELETE]', e)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
