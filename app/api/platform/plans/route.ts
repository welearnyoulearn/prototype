import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import type { PlanRow } from '@/lib/billingTypes'

// Staff limits are saved through POST /api/platform/features (with its seat-overage check), not here.
const PLAN_SQL = `SELECT pp.tier, pp.display_name AS name, COALESCE(pp.description, '') AS description,
    pp.monthly_price::float8 AS monthly, pp.yearly_price::float8 AS yearly, pp.staff_limit AS "staffLimit",
    (SELECT COUNT(*)::int FROM school_subscriptions ss WHERE ss.tier = pp.tier) AS schools,
    pp.is_public AS "shownOnWebsite", NOT pp.is_active AS retired
  FROM plan_pricing pp WHERE pp.tier IN ('basic', 'standard', 'premium')`

const updateSchema = z.object({
  tier: z.enum(['basic', 'standard', 'premium']),
  monthly: z.number().min(0, 'Monthly price can’t be negative').max(1_000_000, 'Monthly price is too high'),
  yearly: z.number().min(0, 'Yearly price can’t be negative').max(10_000_000, 'Yearly price is too high').nullable(),
  description: z.string().trim().max(300, 'Description is too long (300 characters at most)'),
  shownOnWebsite: z.boolean(),
  retired: z.boolean(),
  free: z.boolean().optional(),
}).strict().refine(b => b.monthly > 0 || b.free === true, { message: 'A ₹0 monthly price needs the plan marked as free' })

// GET /api/platform/plans — every paid plan with its prices and how many schools are on it.
export async function GET() {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { rows } = await pool.query<PlanRow>(`${PLAN_SQL} ORDER BY pp.sort_order, pp.tier`)
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[platform/plans GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// PUT /api/platform/plans — prices, website text and visibility of one plan. Schools already on it
// keep their agreed price (school_plan_terms) until they renew.
export async function PUT(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  const b = parsed.data

  try {
    const { rows: [old] } = await pool.query<PlanRow>(`${PLAN_SQL} AND pp.tier = $1`, [b.tier])
    if (!old) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    await pool.query(
      `UPDATE plan_pricing SET monthly_price = $2, yearly_price = $3, description = $4, is_public = $5, is_active = $6, updated_at = NOW()
       WHERE tier = $1`,
      [b.tier, b.monthly, b.yearly, b.description, b.shownOnWebsite, !b.retired],
    )
    const { rows: [plan] } = await pool.query<PlanRow>(`${PLAN_SQL} AND pp.tier = $1`, [b.tier])

    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, (SELECT email FROM users WHERE id = $1), 'update_plan', 'plan', NULL, $2, $3)`,
      [session.userId, old.name, JSON.stringify({ tier: b.tier, old, new: plan })],
    ).catch(err => console.error('[audit/update_plan]', err))

    const warning = b.yearly != null && b.yearly > b.monthly * 12 ? 'The yearly price is more than 12 × the monthly price.' : undefined
    return NextResponse.json({ success: true, plan, warning })
  } catch (err) {
    console.error('[platform/plans PUT]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
