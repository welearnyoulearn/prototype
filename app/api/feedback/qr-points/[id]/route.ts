import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { requireFeeAccess } from '@/lib/auth'
import { validateQrPointCategories } from '@/lib/feedback-qr-points'
import { feedbackQrPointUpdateSchema } from '@/lib/validation/feedback'

// Columns an admin may change. The code is fixed for the point's lifetime
// (printed posters depend on it) — pause the point instead of rotating it.
const NULLABLE_TEXT = new Set(['venue', 'event_date', 'details', 'poster_quote', 'closes_on'])

// PATCH /api/feedback/qr-points/[id] — partial update of any editable field,
// including is_active (pause/resume — the non-destructive way to retire one).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const parsed = feedbackQrPointUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }
    const body = parsed.data

    const { rows: [existing] } = await pool.query(
      `SELECT school_id, form_type, roles, category_ids FROM feedback_qr_points WHERE id = $1`, [id]
    )
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const access = await requireFeeAccess(existing.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Re-validate the scope against the merged (existing + incoming) values —
    // changing only roles or only form_type can invalidate stored categories.
    const formType = body.form_type ?? existing.form_type
    const roles = body.roles ? [...new Set(body.roles)] : existing.roles
    let categoryIds: number[] = body.category_ids ? [...new Set(body.category_ids)] : existing.category_ids
    if (formType !== 'rating') categoryIds = []
    const scopeError = await validateQrPointCategories(pool, access.schoolId, formType, roles, categoryIds)
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 })

    // Keys are safe to interpolate as column names: zod strips anything not
    // declared in feedbackQrPointUpdateSchema, and every declared key is a column.
    const updates: Record<string, unknown> = { ...body, roles, category_ids: categoryIds }
    const sets: string[] = []
    const values: unknown[] = [id]
    for (const [col, raw] of Object.entries(updates)) {
      if (raw === undefined) continue
      values.push(NULLABLE_TEXT.has(col) && raw === '' ? null : raw)
      sets.push(`${col} = $${values.length}`)
    }

    await pool.query(
      `UPDATE feedback_qr_points SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
      values
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/feedback/qr-points/[id] — permanently deletes a QR point (its
// "folder") together with every submission filed under it; their ratings and
// issues go with them via ON DELETE CASCADE. The printed poster's code stops
// resolving. Voice notes are removed from R2 afterwards, best-effort — a
// storage hiccup leaves an orphaned file, never a half-deleted folder.
// Pausing (PATCH is_active=false) is the non-destructive alternative.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Look up + authorise BEFORE checking out a dedicated client — on Vercel the
  // pool has max: 1, so requireFeeAccess's own query would otherwise wait
  // forever for the connection this handler is holding.
  let access: Awaited<ReturnType<typeof requireFeeAccess>>
  try {
    const { rows: [existing] } = await pool.query(`SELECT school_id FROM feedback_qr_points WHERE id = $1`, [id])
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    access = await requireFeeAccess(existing.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  const schoolId = access.schoolId

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: deleted } = await client.query(
      `DELETE FROM feedback_submissions WHERE qr_point_id = $1 AND school_id = $2 RETURNING voice_object_key`,
      [id, schoolId]
    )
    await client.query(`DELETE FROM feedback_qr_points WHERE id = $1 AND school_id = $2`, [id, schoolId])
    await client.query('COMMIT')

    const voiceKeys = deleted.map(r => r.voice_object_key).filter((k): k is string => !!k && k.startsWith(`feedback/${schoolId}/`))
    if (voiceKeys.length > 0) {
      const r2 = r2Config()
      await Promise.all(voiceKeys.map(key =>
        r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }))
          .catch(err => console.error('[feedback] voice note R2 delete failed', key, err))
      ))
    }

    return NextResponse.json({ ok: true, deleted_submissions: deleted.length })
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    client.release()
  }
}
