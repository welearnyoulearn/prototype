import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// PATCH /api/announcements/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const body = await req.json()
  const { title, content, priority, expires_at, target_audience, announcement_type } = body

  const { rows: [row] } = await pool.query(`
    UPDATE announcements SET
      title             = COALESCE($1, title),
      content           = COALESCE($2, content),
      priority          = COALESCE($3, priority),
      expires_at        = COALESCE($4, expires_at),
      target_audience   = COALESCE($5, target_audience),
      announcement_type = COALESCE($6, announcement_type)
    WHERE id = $7
    RETURNING *
  `, [title, content, priority, expires_at || null, target_audience, announcement_type, id])

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

// DELETE /api/announcements/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  const { rowCount } = await pool.query('DELETE FROM announcements WHERE id = $1', [id])
  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
