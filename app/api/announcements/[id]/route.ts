import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { AnnouncementPatchSchema, normaliseAudience } from '@/lib/announcements'

// Who may change a notice: the school's own admin / principal / vice principal (or a platform
// admin). requireFeeAccess is the shared "school staff for THIS school" tenant guard. The school
// comes from the notice itself, never from the caller, so a login for another school is refused.
async function accessFor(id: string) {
  if (!/^\d+$/.test(id)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
  const { rows: [row] } = await pool.query<{ school_id: number }>(`SELECT school_id FROM announcements WHERE id = $1`, [id])
  // Unknown ids and other schools' ids look the same to a caller who is not signed in as staff
  const access = await requireFeeAccess(row?.school_id)
  if (!access) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!row) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { schoolId: row.school_id }
}

// PATCH /api/announcements/[id]
// Body: any of { title, content, priority, expires_at (null clears it), target_audience, announcement_type }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const guard = await accessFor(id)
    if ('error' in guard) return guard.error

    const parsed = AnnouncementPatchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    const d = parsed.data

    const sets: string[] = []
    const values: (string | number | null)[] = []
    const add = (column: string, value: string | null) => { values.push(value); sets.push(`${column} = $${values.length}`) }
    if (d.title !== undefined) add('title', d.title)
    if (d.content !== undefined) add('content', d.content)
    if (d.priority !== undefined) add('priority', d.priority)
    if (d.announcement_type !== undefined) add('announcement_type', d.announcement_type)
    if (d.target_audience !== undefined) add('target_audience', normaliseAudience(d.target_audience))
    if (d.expires_at !== undefined) add('expires_at', d.expires_at)     // null = never expires
    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    values.push(id, guard.schoolId)
    const { rows: [row] } = await pool.query(
      `UPDATE announcements SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND school_id = $${values.length}
       RETURNING id, school_id, title, content, announcement_type, target_audience, priority, created_by_name, expires_at::text, created_at`,
      values
    )
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/announcements/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const guard = await accessFor(id)
    if ('error' in guard) return guard.error
    const { rowCount } = await pool.query('DELETE FROM announcements WHERE id = $1 AND school_id = $2', [id, guard.schoolId])
    if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
