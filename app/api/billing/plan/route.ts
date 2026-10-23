import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'
import { todayIST } from '@/lib/istDate'
import type { PlanTerm } from '@/lib/billingTypes'

// GET /api/billing/plan — the signed-in school admin / principal's own plan and the term covering today.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['school_admin', 'principal'].includes(session.role) || !session.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const schoolId = session.schoolId // from the session only, never the query

  try {
    const [plan, term] = await Promise.all([
      pool.query<{ tier: string; name: string }>(
        `SELECT COALESCE(ss.tier, 'none') AS tier, COALESCE(pp.display_name, 'No Plan') AS name
         FROM schools s LEFT JOIN school_subscriptions ss ON ss.school_id = s.id LEFT JOIN plan_pricing pp ON pp.tier = ss.tier
         WHERE s.id = $1`, [schoolId]),
      pool.query<PlanTerm>(
        `SELECT id, tier, start_date::text AS "startDate", end_date::text AS "endDate", billing_period AS "billingPeriod",
                list_price::float8 AS "listPrice", agreed_price::float8 AS "agreedPrice", discount_reason AS "discountReason"
         FROM school_plan_terms WHERE school_id = $1 AND start_date <= $2::date AND end_date >= $2::date
         ORDER BY start_date DESC, id DESC LIMIT 1`, [schoolId, todayIST()]),
    ])
    return NextResponse.json({ tier: plan.rows[0]?.tier ?? 'none', name: plan.rows[0]?.name ?? 'No Plan', term: term.rows[0] ?? null })
  } catch (err) {
    console.error('[billing/plan GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
