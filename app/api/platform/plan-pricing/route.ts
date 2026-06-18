import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// GET /api/platform/plan-pricing
export async function GET() {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows } = await pool.query(
      `SELECT plan_name, feature_key, enabled FROM plan_features ORDER BY plan_name, feature_key`
    )

    return NextResponse.json({ features: rows })
  } catch (err) {
    console.error('[plan-pricing GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/platform/plan-pricing
export async function POST(req: NextRequest) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { assignments } = body

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ error: 'assignments array required' }, { status: 400 })
    }

    for (const a of assignments) {
      await pool.query(
        `INSERT INTO plan_features (plan_name, feature_key, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (plan_name, feature_key) DO UPDATE SET enabled = $3`,
        [a.plan_name || a.tier, a.feature_key, Boolean(a.enabled)]
      )
    }

    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, action, entity_type, details, created_at)
       VALUES ($1, 'update_plan_features', 'plan_features', $2, NOW())`,
      [session.userId, JSON.stringify({ count: assignments.length })]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[plan-pricing POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
