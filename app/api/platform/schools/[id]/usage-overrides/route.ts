import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin, type JWTPayload } from '@/lib/auth'
import type { SchoolOverride } from '@/lib/billingTypes'

type Ctx = { params: Promise<{ id: string }> }
const paramsSchema = z.object({ id: z.coerce.number().int().positive() })
const meterKey = z.string().min(1).max(80)
// NULL / omitted field = use the plan's value. Applies immediately, current month included.
const putSchema = z.object({
  meterKey,
  included: z.number().min(0).max(1e12).nullable().optional(),
  unitPrice: z.number().min(0).max(100000).nullable().optional(),
  cap: z.number().min(0).max(1e12).nullable().optional(),
  atCap: z.enum(['block', 'allow', 'notify']).nullable().optional(),
  note: z.string().trim().min(3).max(200),
}).strict()
  .refine(b => b.included != null || b.unitPrice != null || b.cap != null || b.atCap != null, { message: 'Set at least one value' })
  .refine(b => b.cap == null || b.included == null || b.cap >= b.included, { message: 'Cap must be at least the included amount' })

const LIST_SQL = `SELECT o.meter_key AS "meterKey", o.included_per_month::float8 AS included, o.unit_price::float8 AS "unitPrice",
    o.monthly_cap::float8 AS cap, o.at_cap AS "atCap", o.note,
    o.updated_by AS "updatedBy", o.updated_at AS "updatedAt"
  FROM school_usage_overrides o
  WHERE o.school_id = $1`

async function schoolName(id: number): Promise<string | null> {
  const r = await pool.query<{ name: string }>(`SELECT name FROM schools WHERE id = $1`, [id])
  return r.rows[0]?.name ?? null
}
const actorName = (s: JWTPayload) => s.displayName ?? `user #${s.userId}`
const serialize = (o: SchoolOverride): SchoolOverride => ({ ...o, updatedAt: new Date(o.updatedAt).toISOString() })

// GET /api/platform/schools/[id]/usage-overrides
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = paramsSchema.safeParse(await params)
  if (!p.success) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
  try {
    if (await schoolName(p.data.id) === null) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    const { rows } = await pool.query<SchoolOverride>(`${LIST_SQL} ORDER BY o.meter_key`, [p.data.id])
    return NextResponse.json(rows.map(serialize))
  } catch (err) {
    console.error('[usage-overrides GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// PUT /api/platform/schools/[id]/usage-overrides — body { meterKey, included?, unitPrice?, cap?, atCap?, note }
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = paramsSchema.safeParse(await params)
  if (!p.success) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  const b = parsed.data
  const schoolId = p.data.id

  try {
    const name = await schoolName(schoolId)
    if (name === null) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    const meter = await pool.query<{ is_billable: boolean }>(`SELECT is_billable FROM usage_meters WHERE key = $1`, [b.meterKey])
    if (!meter.rows.length) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    if (!meter.rows[0].is_billable) return NextResponse.json({ error: 'This service is counted only and has no price' }, { status: 400 })

    const old = await pool.query<SchoolOverride>(`${LIST_SQL} AND o.meter_key = $2`, [schoolId, b.meterKey])
    await pool.query(
      `INSERT INTO school_usage_overrides (school_id, meter_key, included_per_month, unit_price, monthly_cap, at_cap, note, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (school_id, meter_key) DO UPDATE SET
         included_per_month = EXCLUDED.included_per_month, unit_price = EXCLUDED.unit_price, monthly_cap = EXCLUDED.monthly_cap,
         at_cap = EXCLUDED.at_cap, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [schoolId, b.meterKey, b.included ?? null, b.unitPrice ?? null, b.cap ?? null, b.atCap ?? null, b.note, actorName(session)],
    )
    const saved = (await pool.query<SchoolOverride>(`${LIST_SQL} AND o.meter_key = $2`, [schoolId, b.meterKey])).rows[0]

    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, (SELECT email FROM users WHERE id = $1), 'set_usage_override', 'school', $2, $3, $4)`,
      [session.userId, schoolId, name, JSON.stringify({ meter_key: b.meterKey, old: old.rows[0] ?? null, new: saved })],
    ).catch(err => console.error('[audit/set_usage_override]', err))

    return NextResponse.json(serialize(saved))
  } catch (err) {
    console.error('[usage-overrides PUT]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// DELETE /api/platform/schools/[id]/usage-overrides?meter=<key> — back to the plan's price.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = paramsSchema.safeParse(await params)
  if (!p.success) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
  const m = meterKey.safeParse(req.nextUrl.searchParams.get('meter'))
  if (!m.success) return NextResponse.json({ error: 'meter is required' }, { status: 400 })
  const schoolId = p.data.id

  try {
    const name = await schoolName(schoolId)
    if (name === null) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    const old = await pool.query<SchoolOverride>(`${LIST_SQL} AND o.meter_key = $2`, [schoolId, m.data])
    if (!old.rows.length) return NextResponse.json({ error: 'No override for this service' }, { status: 404 })
    await pool.query(`DELETE FROM school_usage_overrides WHERE school_id = $1 AND meter_key = $2`, [schoolId, m.data])

    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, (SELECT email FROM users WHERE id = $1), 'remove_usage_override', 'school', $2, $3, $4)`,
      [session.userId, schoolId, name, JSON.stringify({ meter_key: m.data, old: old.rows[0] })],
    ).catch(err => console.error('[audit/remove_usage_override]', err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[usage-overrides DELETE]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
