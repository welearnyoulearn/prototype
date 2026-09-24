import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { AnnouncementPatchSchema, normaliseAudience, normaliseClasses, type TargetClass } from '@/lib/announcements'
import { recordAudit, staffDisplayName } from '@/lib/announcementAudit'

// Who may change a notice: the school's own admin / principal / vice principal (or a platform
// admin). requireFeeAccess is the shared "school staff for THIS school" tenant guard. The school
// comes from the notice itself, never from the caller, so a login for another school is refused.
async function accessFor(id: string) {
  if (!/^\d+$/.test(id)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
  const { rows: [row] } = await pool.query<{ school_id: number; status: string; template_key: string | null }>(
    `SELECT school_id, status, template_key FROM announcements WHERE id = $1 AND deleted_at IS NULL`, [id]
  )
  // Unknown ids and other schools' ids look the same to a caller who is not signed in as staff
  const access = await requireFeeAccess(row?.school_id)
  if (!access) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!row) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { schoolId: row.school_id, status: row.status, templateKey: row.template_key, access }
}

const RETURNING = `id, school_id, title, content, announcement_type, target_audience, priority, created_by_name,
  expires_at::text AS expires_at, created_at, updated_at, status, publish_at, pinned, requires_ack, template_key,
  card_data, target_classes, translations`

// PATCH /api/announcements/[id]
// Any of: title, content, announcement_type, priority, target_audience, expires_at (null clears), status
// (draft ⇄ published), publish_at (null clears the schedule), pinned, requires_ack, template_key, card_data,
// target_classes (null = whole school), translations.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const guard = await accessFor(id)
    if ('error' in guard) return guard.error

    const parsed = AnnouncementPatchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    const d = parsed.data
    if (d.card_data && !(d.template_key ?? guard.templateKey)) return NextResponse.json({ error: 'card_data needs a template_key' }, { status: 400 })

    const sets: string[] = []
    const values: (string | number | boolean | null)[] = []
    const changed: string[] = []
    const add = (column: string, value: string | number | boolean | null, cast = '') => { values.push(value); sets.push(`${column} = $${values.length}${cast}`); changed.push(column) }
    if (d.title !== undefined) add('title', d.title)
    if (d.content !== undefined) add('content', d.content)
    if (d.priority !== undefined) add('priority', d.priority)
    if (d.announcement_type !== undefined) add('announcement_type', d.announcement_type)
    if (d.target_audience !== undefined) add('target_audience', normaliseAudience(d.target_audience))
    if (d.expires_at !== undefined) add('expires_at', d.expires_at)     // null = never expires
    if (d.pinned !== undefined) add('pinned', d.pinned)
    if (d.requires_ack !== undefined) add('requires_ack', d.requires_ack)
    if (d.template_key !== undefined) add('template_key', d.template_key)
    if (d.card_data !== undefined) add('card_data', d.card_data ? JSON.stringify(d.card_data) : null, '::jsonb')
    if (d.target_classes !== undefined) {
      const classes = normaliseClasses(d.target_classes as TargetClass[] | null)
      add('target_classes', classes ? JSON.stringify(classes) : null, '::jsonb')
    }
    if (d.translations !== undefined) add('translations', d.translations ? JSON.stringify(d.translations) : null, '::jsonb')
    if (d.status !== undefined) {
      add('status', d.status)
      if (d.status === 'draft') add('publish_at', null)
    }
    if (d.publish_at !== undefined && d.status !== 'draft') {
      // A schedule in the past just means "now"
      const when = d.publish_at ? new Date(d.publish_at) : null
      add('publish_at', when && when.getTime() > Date.now() ? when.toISOString() : null)
    }
    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    const by = await staffDisplayName(guard.access.userId, guard.access.actor)
    values.push(by)
    sets.push(`updated_at = NOW()`, `updated_by_name = $${values.length}`)

    values.push(id, guard.schoolId)
    const { rows: [row] } = await pool.query(
      `UPDATE announcements SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND school_id = $${values.length} AND deleted_at IS NULL
       RETURNING ${RETURNING}`,
      values
    )
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const action = d.status === 'published' && guard.status === 'draft' ? 'published' : d.status === 'draft' && guard.status === 'published' ? 'unpublished' : 'edited'
    await recordAudit(row.id, guard.schoolId, action, by, { fields: Array.from(new Set(changed)) })
    return NextResponse.json(row)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/announcements/[id]
// Soft delete: the notice disappears for everyone, but stays in the audit trail (Deleted tab).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const guard = await accessFor(id)
    if ('error' in guard) return guard.error
    const by = await staffDisplayName(guard.access.userId, guard.access.actor)
    const { rowCount } = await pool.query(
      `UPDATE announcements SET deleted_at = NOW(), deleted_by_name = $3 WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
      [id, guard.schoolId, by]
    )
    if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await recordAudit(Number(id), guard.schoolId, 'deleted', by)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
