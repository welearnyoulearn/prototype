import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// PATCH /api/timetable-versions/[id]  — rename or confirm a version
// DELETE /api/timetable-versions/[id] — delete a draft version

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  try {
    const body = await req.json()
    const { name, status } = body

    const updates: string[] = []
    const vals: (string | number | boolean)[] = []

    if (name !== undefined) { updates.push(`name=$${vals.length + 1}`); vals.push(name) }
    if (status !== undefined) { updates.push(`status=$${vals.length + 1}`); vals.push(status) }

    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    vals.push(Number(id))
    const { rows } = await pool.query(
      `UPDATE timetable_versions SET ${updates.join(', ')} WHERE id=$${vals.length} RETURNING *`,
      vals
    )
    if (rows.length === 0) return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update version' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const { id } = await params
  try {
    const { rows } = await pool.query(
      `SELECT status FROM timetable_versions WHERE id=$1`, [id]
    )
    if (rows.length === 0) return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    if (rows[0].status === 'circulated') {
      return NextResponse.json({ error: 'Cannot delete a circulated version' }, { status: 400 })
    }
    await pool.query(`DELETE FROM timetable_versions WHERE id=$1`, [id])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete version' }, { status: 500 })
  }
}
