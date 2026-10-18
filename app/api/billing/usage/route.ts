import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'
import { METERS_SELECT, getEffectivePrice, getMonthUsage, meterUsage, monthBoundsIST, nextMonth } from '@/lib/usage'
import type { Meter, MyUsageResponse, TierPrice } from '@/lib/billingTypes'

const METERS_SQL = `${METERS_SELECT} WHERE is_active ORDER BY sort_order, key`

const samePrice = (a: TierPrice, b: TierPrice) =>
  a.included === b.included && a.unitPrice === b.unitPrice && a.cap === b.cap && a.atCap === b.atCap
const pickPrice = (p: TierPrice): TierPrice => ({ included: p.included, unitPrice: p.unitPrice, cap: p.cap, atCap: p.atCap })

// GET /api/billing/usage — this month's usage and extra charges for the signed-in school admin / principal's own school.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['school_admin', 'principal'].includes(session.role) || !session.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const schoolId = session.schoolId // from the session only, never the query

  try {
    const { month, end } = monthBoundsIST()
    const next = nextMonth(month)
    const [meters, usage] = await Promise.all([
      // Our provider cost is platform-only: schools never see it.
      pool.query<Meter>(METERS_SQL).then(r => r.rows.map(m => ({ ...m, ourCostPerUnit: null }))),
      getMonthUsage(month, schoolId),
    ])

    const charged: MyUsageResponse['charged'] = []
    for (const meter of meters.filter(m => m.isBillable)) {
      const [usageNow, price, upcoming] = await Promise.all([
        meterUsage(schoolId, meter.key, month),
        getEffectivePrice(schoolId, meter.key, month),
        getEffectivePrice(schoolId, meter.key, next),
      ])
      if (!usageNow || !price) continue // not in this school's plan
      const item: MyUsageResponse['charged'][number] = { meter, usage: usageNow, price: pickPrice(price) }
      // ponytail: a service leaving the plan next month isn't flagged here; add when the screen needs it.
      if (upcoming && !samePrice(price, upcoming)) item.nextPrice = pickPrice(upcoming)
      charged.push(item)
    }

    const counted = meters.filter(m => !m.isBillable).map(meter => ({
      meter,
      quantity: usage.find(u => u.meterKey === meter.key)?.quantity ?? 0,
    }))

    // '1 – 31 Oct' — end is exclusive, so the last day is the day before it.
    const last = new Date(`${end}T00:00:00Z`)
    last.setUTCDate(last.getUTCDate() - 1)
    const monthLabel = `1 – ${last.getUTCDate()} ${last.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}`

    const body: MyUsageResponse = {
      month, monthLabel, charged, counted,
      extra: Math.round(charged.reduce((a, c) => a + c.usage.extra, 0) * 100) / 100,
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[billing/usage GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
