import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { ALL_FEATURES } from '@/lib/features'

// Feature adoption: for every school-admin nav key in ALL_FEATURES, how many
// entitled schools (per schoolHasFeature's own precedence — override first,
// then tier via plan_features) actually opened that tab in the window vs.
// never did. "Entitled" is computed the same way schoolHasFeature does it
// per-school, just in bulk SQL instead of N calls.
//
// Scoped to portal='school-admin' only — teacher/student/parent nav keys
// aren't gated by ALL_FEATURES/plan tiers, so "adoption against entitlement"
// isn't a meaningful question for them the same way; their usage still shows
// up in the overview's by-role breakdown.
export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 90)

    // Entitlement per school per feature key — override takes precedence,
    // else tier's plan_features row (missing plan_features row = not entitled,
    // same default-false behavior as schoolHasFeature).
    const entitlementRes = await pool.query(`
      SELECT s.id AS school_id, af.key AS feature_key,
             COALESCE(ov.enabled, pf.enabled, FALSE) AS entitled
      FROM schools s
      CROSS JOIN (VALUES ${ALL_FEATURES.map((_, i) => `($${i + 1})`).join(',')}) AS af(key)
      LEFT JOIN school_subscriptions sub ON sub.school_id = s.id
      LEFT JOIN plan_features pf ON pf.tier = sub.tier AND pf.feature_key = af.key
      LEFT JOIN school_feature_overrides ov ON ov.school_id = s.id AND ov.feature_key = af.key
      WHERE s.deleted_at IS NULL AND s.status = 'active'
    `, ALL_FEATURES.map(f => f.key))

    const entitledCountByKey = new Map<string, number>()
    const entitledSchoolIdsByKey = new Map<string, Set<number>>()
    for (const row of entitlementRes.rows) {
      if (!row.entitled) continue
      entitledCountByKey.set(row.feature_key, (entitledCountByKey.get(row.feature_key) || 0) + 1)
      if (!entitledSchoolIdsByKey.has(row.feature_key)) entitledSchoolIdsByKey.set(row.feature_key, new Set())
      entitledSchoolIdsByKey.get(row.feature_key)!.add(row.school_id)
    }

    // Actual opens (rollup for days before today, union today's raw events —
    // same today-union pattern as the overview route, so a feature opened
    // for the first time today doesn't read as "never used" until tomorrow).
    const opensRes = await pool.query(`
      SELECT nav_key, school_id, SUM(open_count) AS open_count, SUM(unique_actors) AS unique_actors
      FROM (
        SELECT nav_key, school_id, open_count, unique_actors
        FROM feature_usage_daily_rollup
        WHERE portal = 'school-admin' AND day >= CURRENT_DATE - $1::int AND day < CURRENT_DATE
        UNION ALL
        SELECT nav_key, school_id, COUNT(*) AS open_count, COUNT(DISTINCT actor_id) AS unique_actors
        FROM feature_usage_events
        WHERE portal = 'school-admin' AND created_at::date = CURRENT_DATE
        GROUP BY nav_key, school_id
      ) combined
      GROUP BY nav_key, school_id
    `, [days])

    const opensByKey = new Map<string, { schools: Set<number>; total_opens: number }>()
    for (const row of opensRes.rows) {
      if (!opensByKey.has(row.nav_key)) opensByKey.set(row.nav_key, { schools: new Set(), total_opens: 0 })
      const bucket = opensByKey.get(row.nav_key)!
      bucket.schools.add(row.school_id)
      bucket.total_opens += Number(row.open_count)
    }

    const features = ALL_FEATURES.map(f => {
      const entitledCount = entitledCountByKey.get(f.key) || 0
      const entitledIds = entitledSchoolIdsByKey.get(f.key) || new Set<number>()
      const opens = opensByKey.get(f.key)
      const activeSchools = opens ? [...opens.schools].filter(id => entitledIds.has(id)).length : 0
      return {
        key: f.key,
        label: f.label,
        category: f.category,
        entitled_schools: entitledCount,
        active_schools: activeSchools,
        adoption_pct: entitledCount > 0 ? Math.round((activeSchools / entitledCount) * 100) : 0,
        total_opens: opens?.total_opens || 0,
      }
    }).sort((a, b) => a.adoption_pct - b.adoption_pct)

    return NextResponse.json({ days, features })
  } catch (error) {
    console.error('[platform/usage-analytics/feature-adoption]', error)
    return NextResponse.json({ error: 'Failed to load feature adoption' }, { status: 500 })
  }
}
