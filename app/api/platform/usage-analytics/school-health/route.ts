import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { ALL_FEATURES } from '@/lib/features'

// Per-school health score for sales/CS renewal conversations — combines two
// independent signals into one 0-100 number:
//   1. Recency (60% weight) — days since ANY login, any role. 0 days ago = 100,
//      decays to 0 at 30+ days. Mirrors the Active/Cooling/At-Risk cutoffs
//      already used in the per-school drill-down (7/21 days) as reference
//      points, but expressed continuously here instead of 3 buckets so
//      schools can be ranked, not just grouped.
//   2. Breadth (40% weight) — % of entitled school-admin features actually
//      opened in the window. A school that logs in daily but only ever
//      touches one tab is a real risk signal recency alone would miss.
// Weighted toward recency since a school that's stopped logging in entirely
// is a harder churn signal than one using fewer features but still showing up.
const RECENCY_WEIGHT = 0.6
const BREADTH_WEIGHT = 0.4
const RECENCY_DECAY_DAYS = 30

export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 90)

    const [schoolsRes, lastLoginRes, entitlementRes, opensRes] = await Promise.all([
      pool.query(`
        SELECT s.id, s.name, s.created_at, COALESCE(sub.tier, 'none') AS tier
        FROM schools s
        LEFT JOIN school_subscriptions sub ON sub.school_id = s.id
        WHERE s.deleted_at IS NULL AND s.status = 'active'
      `),
      pool.query(`
        SELECT school_id, MAX(started_at) AS last_login_at
        FROM usage_sessions
        WHERE school_id IS NOT NULL
        GROUP BY school_id
      `),
      pool.query(`
        SELECT s.id AS school_id, af.key AS feature_key,
               COALESCE(ov.enabled, pf.enabled, FALSE) AS entitled
        FROM schools s
        CROSS JOIN (VALUES ${ALL_FEATURES.map((_, i) => `($${i + 1})`).join(',')}) AS af(key)
        LEFT JOIN school_subscriptions sub ON sub.school_id = s.id
        LEFT JOIN plan_features pf ON pf.tier = sub.tier AND pf.feature_key = af.key
        LEFT JOIN school_feature_overrides ov ON ov.school_id = s.id AND ov.feature_key = af.key
        WHERE s.deleted_at IS NULL AND s.status = 'active'
      `, ALL_FEATURES.map(f => f.key)),
      pool.query(`
        SELECT school_id, nav_key
        FROM (
          SELECT school_id, nav_key FROM feature_usage_daily_rollup
          WHERE portal = 'school-admin' AND day >= CURRENT_DATE - $1::int AND day < CURRENT_DATE
          UNION
          SELECT school_id, nav_key FROM feature_usage_events
          WHERE portal = 'school-admin' AND created_at::date = CURRENT_DATE
        ) combined
      `, [days]),
    ])

    const lastLoginBySchool = new Map<number, string>()
    for (const r of lastLoginRes.rows) lastLoginBySchool.set(r.school_id, r.last_login_at)

    const entitledBySchool = new Map<number, Set<string>>()
    for (const r of entitlementRes.rows) {
      if (!r.entitled) continue
      if (!entitledBySchool.has(r.school_id)) entitledBySchool.set(r.school_id, new Set())
      entitledBySchool.get(r.school_id)!.add(r.feature_key)
    }

    const usedBySchool = new Map<number, Set<string>>()
    for (const r of opensRes.rows) {
      if (!usedBySchool.has(r.school_id)) usedBySchool.set(r.school_id, new Set())
      usedBySchool.get(r.school_id)!.add(r.nav_key)
    }

    const now = Date.now()
    const results = schoolsRes.rows.map(s => {
      const lastLogin = lastLoginBySchool.get(s.id)
      const daysSinceLogin = lastLogin ? (now - new Date(lastLogin).getTime()) / 86_400_000 : null
      const recencyScore = daysSinceLogin == null ? 0 : Math.max(0, 100 - (daysSinceLogin / RECENCY_DECAY_DAYS) * 100)

      const entitled = entitledBySchool.get(s.id) || new Set()
      const used = usedBySchool.get(s.id) || new Set()
      const usedEntitled = [...used].filter(k => entitled.has(k)).length
      const breadthScore = entitled.size > 0 ? (usedEntitled / entitled.size) * 100 : 0

      const healthScore = Math.round(recencyScore * RECENCY_WEIGHT + breadthScore * BREADTH_WEIGHT)
      const riskLevel = healthScore >= 60 ? 'healthy' : healthScore >= 30 ? 'watch' : 'at_risk'

      return {
        school_id: s.id,
        school_name: s.name,
        tier: s.tier,
        onboarded_at: s.created_at,
        last_login_at: lastLogin || null,
        days_since_login: daysSinceLogin == null ? null : Math.floor(daysSinceLogin),
        features_entitled: entitled.size,
        features_used: usedEntitled,
        breadth_pct: Math.round(breadthScore),
        health_score: healthScore,
        risk_level: riskLevel,
      }
    }).sort((a, b) => a.health_score - b.health_score)

    const riskCounts = { healthy: 0, watch: 0, at_risk: 0 }
    for (const r of results) riskCounts[r.risk_level as keyof typeof riskCounts]++

    return NextResponse.json({ days, risk_counts: riskCounts, schools: results })
  } catch (error) {
    console.error('[platform/usage-analytics/school-health]', error)
    return NextResponse.json({ error: 'Failed to load school health' }, { status: 500 })
  }
}
