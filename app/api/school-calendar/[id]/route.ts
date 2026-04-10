import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// PATCH /api/school-calendar/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const body = await req.json()
  const { title, event_date, end_date, event_type, color, description } = body

  const { rows: [row] } = await pool.query(`
    UPDATE school_calendar SET
      title      = COALESCE($1, title),
      event_date = COALESCE($2, event_date),
      end_date   = COALESCE($3, end_date),
      event_type = COALESCE($4, event_type),
      color      = COALESCE($5, color),
      description= COALESCE($6, description)
    WHERE id = $7
    RETURNING *, event_date::text, end_date::text
  `, [title, event_date, end_date || null, event_type, color, description, id])

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

// DELETE /api/school-calendar/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const { rowCount } = await pool.query('DELETE FROM school_calendar WHERE id = $1', [id])
  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
