import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { METERS_SELECT } from '@/lib/usage'
import { requirePlatformAdmin } from '@/lib/auth'
import type { Meter } from '@/lib/billingTypes'

const METERS_SQL = METERS_SELECT

// ponytail: no DELETE — a service with history is switched off (isActive=false), never deleted.
const patchSchema = z.object({
  key: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80).optional(),
  unitLabel: z.string().trim().min(1).max(80).optional(),
  ourCostPerUnit: z.number().min(0).max(1000).nullable().optional(),
  isBillable: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict()

const COLUMNS = { name: 'name', unitLabel: 'unit_label', ourCostPerUnit: 'our_cost_per_unit', isBillable: 'is_billable', isActive: 'is_active' } as const

// GET /api/platform/usage-meters — every service we count.
export async function GET() {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { rows } = await pool.query<Meter>(`${METERS_SQL} ORDER BY sort_order, key`)
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[platform/usage-meters GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// PATCH /api/platform/usage-meters — body { key, name?, unitLabel?, ourCostPerUnit?, isBillable?, isActive? }
export async function PATCH(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  const { key, ...changes } = parsed.data
  const fields = (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).filter(f => changes[f] !== undefined)
  if (!fields.length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  try {
    const before = await pool.query<Meter>(`${METERS_SQL} WHERE key = $1`, [key])
    if (!before.rows.length) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

    const vals: unknown[] = [key]
    const sets = fields.map(f => `${COLUMNS[f]} = $${vals.push(changes[f])}`)
    await pool.query(`UPDATE usage_meters SET ${sets.join(', ')}, updated_at = NOW() WHERE key = $1`, vals)
    const after = (await pool.query<Meter>(`${METERS_SQL} WHERE key = $1`, [key])).rows[0]

    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, (SELECT email FROM users WHERE id = $1), 'update_usage_meter', 'usage_meter', NULL, $2, $3)`,
      [session.userId, key, JSON.stringify({
        old: Object.fromEntries(fields.map(f => [f, before.rows[0][f]])),
        new: Object.fromEntries(fields.map(f => [f, after[f]])),
      })],
    ).catch(err => console.error('[audit/update_usage_meter]', err))

    return NextResponse.json(after)
  } catch (err) {
    console.error('[platform/usage-meters PATCH]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
