import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { METERS_SELECT, meterUsage, monthBoundsIST } from '@/lib/usage'
import type { Meter, SchoolOverride, SchoolUsageDetail } from '@/lib/billingTypes'

const paramsSchema = z.object({ schoolId: z.coerce.number().int().positive() })
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()
const METERS_SQL = `${METERS_SELECT} WHERE is_active ORDER BY sort_order, key`

// GET /api/platform/usage/[schoolId]?month=YYYY-MM — one school's month: daily counts, charges, overrides.
export async function GET(req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = paramsSchema.safeParse(await params)
  if (!p.success) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
  const m = monthSchema.safeParse(req.nextUrl.searchParams.get('month') ?? undefined)
  if (!m.success) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  const { schoolId } = p.data

  try {
    const { month, start, end } = monthBoundsIST(m.data)
    const school = await pool.query<{ name: string; tier: string | null }>(
      `SELECT s.name, ss.tier FROM schools s LEFT JOIN school_subscriptions ss ON ss.school_id = s.id WHERE s.id = $1`,
      [schoolId],
    )
    if (!school.rows.length) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    const [meters, dailyRes, overridesRes] = await Promise.all([
      pool.query<Meter>(METERS_SQL).then(r => r.rows),
      pool.query<{ day: string; meter_key: string; quantity: number }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, meter_key, quantity::float8 AS quantity
         FROM usage_daily WHERE school_id = $1 AND day >= $2::date AND day < $3::date`,
        [schoolId, start, end],
      ),
      pool.query<SchoolOverride>(
        `SELECT o.meter_key AS "meterKey", o.included_per_month::float8 AS included, o.unit_price::float8 AS "unitPrice",
                o.monthly_cap::float8 AS cap, o.at_cap AS "atCap", o.note,
                o.updated_by AS "updatedBy", o.updated_at AS "updatedAt"
         FROM school_usage_overrides o
         WHERE o.school_id = $1 ORDER BY o.meter_key`,
        [schoolId],
      ),
    ])

    // Every day of the month up to today (IST), zero-filled; a future month has none yet.
    const todayIST = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
    const days: string[] = []
    for (const d = new Date(`${start}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10)
      if (day >= end || day > todayIST) break
      days.push(day)
    }

    const qty = new Map<string, number>()
    for (const r of dailyRes.rows) qty.set(`${r.meter_key}|${r.day}`, r.quantity)

    const daily: SchoolUsageDetail['daily'] = {}
    const charged: SchoolUsageDetail['charged'] = {}
    for (const meter of meters) {
      daily[meter.key] = days.map(day => ({ day, quantity: qty.get(`${meter.key}|${day}`) ?? 0 }))
      if (meter.isBillable) charged[meter.key] = await meterUsage(schoolId, meter.key, month)
    }

    const body: SchoolUsageDetail = {
      month, schoolId, schoolName: school.rows[0].name, tier: school.rows[0].tier ?? 'none',
      daily, charged,
      overrides: overridesRes.rows.map(o => ({ ...o, updatedAt: new Date(o.updatedAt).toISOString() })),
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[platform/usage/[schoolId] GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
