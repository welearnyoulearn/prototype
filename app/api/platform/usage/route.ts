import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { METERS_SELECT, computeCharge, getMonthUsage, monthBoundsIST } from '@/lib/usage'
import type { AtCap, Meter, MeterUsage, TierPrice, UsageResponse, UsageSchoolRow } from '@/lib/billingTypes'

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()

type PriceRow = { meter_key: string; tier: string; in_plan: boolean; included_per_month: string; unit_price: string; monthly_cap: string | null; at_cap: AtCap }
type OverrideRow = { school_id: number; meter_key: string; included_per_month: string | null; unit_price: string | null; monthly_cap: string | null; at_cap: AtCap | null }
const num = (v: string | null) => (v === null ? null : Number(v))
const METERS_SQL = `${METERS_SELECT} ORDER BY sort_order, key`

// GET /api/platform/usage?month=YYYY-MM — every school's usage and extra charges for one IST month.
export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = monthSchema.safeParse(req.nextUrl.searchParams.get('month') ?? undefined)
  if (!parsed.success) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })

  try {
    const { month, start } = monthBoundsIST(parsed.data)
    const [usage, meters, schoolsRes, pricesRes, overridesRes] = await Promise.all([
      getMonthUsage(month),
      pool.query<Meter>(METERS_SQL).then(r => r.rows),
      pool.query<{ id: number; name: string; school_code: string | null; tier: string | null; deactivated: boolean; deleted: boolean }>(
        `SELECT s.id, s.name, s.school_code, ss.tier,
                (COALESCE(s.status, 'active') <> 'active' OR s.deleted_at IS NOT NULL) AS deactivated,
                s.deleted_at IS NOT NULL AS deleted
         FROM schools s LEFT JOIN school_subscriptions ss ON ss.school_id = s.id
         ORDER BY s.name`,
      ),
      // Ordered so the last row seen per (meter, tier) is the one in force for the month.
      pool.query<PriceRow>(
        `SELECT meter_key, tier, effective_month, in_plan, included_per_month, unit_price, monthly_cap, at_cap
         FROM usage_prices WHERE effective_month <= $1::date ORDER BY effective_month`,
        [start],
      ),
      pool.query<OverrideRow>(`SELECT school_id, meter_key, included_per_month, unit_price, monthly_cap, at_cap FROM school_usage_overrides`),
    ])

    // Same rule as getEffectivePrice (lib/usage.ts): plan row in force for the month (none / in_plan=false =
    // not in plan), then the school's override wins field by field.
    const planPrice = new Map<string, PriceRow>()
    for (const r of pricesRes.rows) planPrice.set(`${r.meter_key}|${r.tier}`, r)
    const override = new Map<string, OverrideRow>()
    for (const o of overridesRes.rows) override.set(`${o.school_id}|${o.meter_key}`, o)
    const priceFor = (schoolId: number, tier: string, meterKey: string): TierPrice | null => {
      const p = planPrice.get(`${meterKey}|${tier}`)
      const o = override.get(`${schoolId}|${meterKey}`)
      // An override with its own included amount puts the service in this school's plan.
      if (p?.in_plan !== true && o?.included_per_month == null) return null
      return {
        included: Number(o?.included_per_month ?? p?.included_per_month ?? 0),
        unitPrice: Number(o?.unit_price ?? p?.unit_price ?? 0),
        cap: num(o?.monthly_cap ?? p?.monthly_cap ?? null),
        atCap: o?.at_cap ?? p?.at_cap ?? 'block',
      }
    }

    const qty = new Map<string, number>()
    for (const u of usage) qty.set(`${u.schoolId}|${u.meterKey}`, u.quantity)

    const active = meters.filter(m => m.isActive)
    const charged = active.filter(m => m.isBillable)
    const counted = active.filter(m => !m.isBillable)
    const totals: UsageResponse['totals'] = Object.fromEntries(active.map(m => [m.key, { quantity: 0, extra: 0 }]))

    const schools: UsageSchoolRow[] = []
    for (const s of schoolsRes.rows) {
      const hasUsage = active.some(m => qty.has(`${s.id}|${m.key}`))
      if (s.deleted && !hasUsage) continue // deleted schools only matter for months they used something
      const tier = s.tier ?? 'none'
      const row: UsageSchoolRow = {
        schoolId: s.id, schoolName: s.name, schoolCode: s.school_code ?? '', tier,
        deactivated: s.deactivated, charged: {}, counted: {}, extra: 0,
      }
      for (const m of charged) {
        const used = qty.get(`${s.id}|${m.key}`) ?? 0
        totals[m.key].quantity += used
        const price = priceFor(s.id, tier, m.key)
        if (!price) { row.charged[m.key] = null; continue }
        const { amount } = computeCharge(used, { included: price.included, unitPrice: price.unitPrice, unitSize: m.unitSize })
        const mu: MeterUsage = {
          used, included: price.included, cap: price.cap, extra: amount,
          paused: price.cap !== null && price.atCap === 'block' && used >= price.cap,
        }
        row.charged[m.key] = mu
        row.extra += amount
        totals[m.key].extra += amount
      }
      for (const m of counted) {
        const used = qty.get(`${s.id}|${m.key}`) ?? 0
        row.counted[m.key] = used
        totals[m.key].quantity += used
      }
      row.extra = round2(row.extra)
      schools.push(row)
    }
    for (const t of Object.values(totals)) t.extra = round2(t.extra)

    const platform: Record<string, number> = {}
    for (const u of usage) if (u.schoolId === 0) platform[u.meterKey] = u.quantity

    // Our cost covers everything we paid for, platform usage included. Services without a cost set
    // (free ones, like request counts) add nothing; null only when no service has a cost at all.
    let ourCost: number | null = null
    for (const m of active) {
      if (m.ourCostPerUnit === null) continue
      const total = usage.filter(u => u.meterKey === m.key).reduce((a, u) => a + u.quantity, 0)
      ourCost = (ourCost ?? 0) + (total / m.unitSize) * m.ourCostPerUnit
    }

    const body: UsageResponse = {
      month,
      inProgress: month === monthBoundsIST().month,
      meters,
      totals,
      ourCost: ourCost === null ? null : round2(ourCost),
      billedExtra: round2(schools.reduce((a, s) => a + s.extra, 0)),
      platform,
      schools,
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[platform/usage GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
