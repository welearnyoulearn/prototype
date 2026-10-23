import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { METERS_SELECT, monthBoundsIST, nextMonth } from '@/lib/usage'
import type { AtCap, Meter, PricingResponse, PricingRow, Tier, TierPrice } from '@/lib/billingTypes'

const TIERS: Tier[] = ['basic', 'standard', 'premium']
const METERS_SQL = METERS_SELECT

type PriceRow = { meter_key: string; tier: Tier; effective_month: string; in_plan: boolean; included: number; unit_price: number; cap: number | null; at_cap: AtCap }
const PRICE_COLS = `meter_key, tier, to_char(effective_month, 'YYYY-MM-DD') AS effective_month, in_plan,
  included_per_month::float8 AS included, unit_price::float8 AS unit_price, monthly_cap::float8 AS cap, at_cap`
const toPrice = (r: PriceRow | undefined): TierPrice | null =>
  r && r.in_plan ? { included: r.included, unitPrice: r.unit_price, cap: r.cap, atCap: r.at_cap } : null

const updateSchema = z.discriminatedUnion('inPlan', [
  z.object({
    meterKey: z.string().min(1).max(80), tier: z.enum(['basic', 'standard', 'premium']), inPlan: z.literal(true),
    included: z.number().min(0).max(1e12),
    unitPrice: z.number().min(0).max(100000),
    cap: z.number().min(0).max(1e12).nullable().default(null),
    atCap: z.enum(['block', 'allow', 'notify']),
  }).strict().refine(b => b.cap === null || b.cap >= b.included, { message: 'Cap must be at least the included amount' }),
  z.object({ meterKey: z.string().min(1).max(80), tier: z.enum(['basic', 'standard', 'premium']), inPlan: z.literal(false) }).strict(),
])

// GET /api/platform/pricing — prices in force this month, plus changes scheduled for next month.
export async function GET() {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { month, start } = monthBoundsIST()
    const next = nextMonth(month)
    const nextStart = monthBoundsIST(next).start
    const [meters, prices] = await Promise.all([
      // Charged services (even switched off) plus active track-only ones, which never have a price.
      pool.query<Meter>(`${METERS_SQL} WHERE is_billable OR is_active ORDER BY sort_order, key`).then(r => r.rows),
      pool.query<PriceRow>(`SELECT ${PRICE_COLS} FROM usage_prices WHERE effective_month <= $1::date ORDER BY effective_month`, [nextStart]),
    ])
    const current = new Map<string, PriceRow>()
    const pending = new Map<string, PriceRow>()
    for (const r of prices.rows) {
      if (r.effective_month === nextStart) pending.set(`${r.meter_key}|${r.tier}`, r)
      else if (r.effective_month <= start) current.set(`${r.meter_key}|${r.tier}`, r) // ascending: last wins
    }
    const NONE = Object.fromEntries(TIERS.map(t => [t, null])) as PricingRow['prices']
    const rows: PricingRow[] = meters.map(m => !m.isBillable ? { ...m, prices: NONE, pending: { basic: undefined, standard: undefined, premium: undefined } } : ({
      ...m,
      prices: Object.fromEntries(TIERS.map(t => [t, toPrice(current.get(`${m.key}|${t}`))])) as PricingRow['prices'],
      pending: Object.fromEntries(TIERS.map(t => {
        const r = pending.get(`${m.key}|${t}`)
        return [t, r ? toPrice(r) : undefined]
      })) as PricingRow['pending'],
    }))
    const body: PricingResponse = { month, nextMonth: next, rows }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[platform/pricing GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// PUT /api/platform/pricing — body PricingUpdate. One plan × service cell; applies from next IST month.
export async function PUT(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  const b = parsed.data
  const price: TierPrice | null = b.inPlan ? { included: b.included, unitPrice: b.unitPrice, cap: b.cap, atCap: b.atCap } : null

  try {
    const meter = await pool.query<{ is_billable: boolean }>(`SELECT is_billable FROM usage_meters WHERE key = $1`, [b.meterKey])
    if (!meter.rows.length) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    if (!meter.rows[0].is_billable) return NextResponse.json({ error: 'This service is counted only and has no price' }, { status: 400 })

    const nextStart = monthBoundsIST(nextMonth(monthBoundsIST().month)).start
    // The price next month would have used before this change: the latest row up to and including next month.
    const old = await pool.query<PriceRow>(
      `SELECT ${PRICE_COLS} FROM usage_prices WHERE meter_key = $1 AND tier = $2 AND effective_month <= $3::date
       ORDER BY effective_month DESC LIMIT 1`,
      [b.meterKey, b.tier, nextStart],
    )

    await pool.query(
      `INSERT INTO usage_prices (meter_key, tier, effective_month, in_plan, included_per_month, unit_price, monthly_cap, at_cap, updated_by, updated_at)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (meter_key, tier, effective_month) DO UPDATE SET
         in_plan = EXCLUDED.in_plan, included_per_month = EXCLUDED.included_per_month, unit_price = EXCLUDED.unit_price,
         monthly_cap = EXCLUDED.monthly_cap, at_cap = EXCLUDED.at_cap, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [b.meterKey, b.tier, nextStart, b.inPlan, price?.included ?? 0, price?.unitPrice ?? 0, price?.cap ?? null, price?.atCap ?? 'block', session.displayName ?? `user #${session.userId}`],
    )

    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, (SELECT email FROM users WHERE id = $1), 'update_usage_price', 'usage_price', NULL, $2, $3)`,
      [session.userId, `${b.meterKey} / ${b.tier}`, JSON.stringify({ from_month: nextStart, old: toPrice(old.rows[0]), new: price })],
    ).catch(err => console.error('[audit/update_usage_price]', err))

    return NextResponse.json({ success: true, effectiveMonth: nextStart.slice(0, 7), price })
  } catch (err) {
    console.error('[platform/pricing PUT]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
