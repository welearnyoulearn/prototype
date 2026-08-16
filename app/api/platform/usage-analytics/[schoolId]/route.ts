import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// Per-school drill-down: daily trend, role breakdown, and a per-actor
// engagement list segmented by recency of last login —
//   Active:   logged in within the last 7 days
//   Cooling:  8-21 days ago
//   At Risk:  22+ days ago (or never, for actors who exist but never logged in
//             — though this table only has rows for actors who did log in;
//             "never logged in" isn't derivable from usage_sessions alone)
// Segmentation runs off raw usage_sessions (last-login-per-actor), not the
// rollup table, since the rollup is grouped by role/day and can't answer
// "when did THIS person last log in."
//
// trend/by_role UNION the rollup (days before today) with a live aggregate
// computed from usage_sessions for today — see the sibling platform-wide
// route for the same pattern — so today's activity shows up immediately
// instead of waiting for tomorrow's cron run.
const ACTIVE_DAYS = 7
const COOLING_DAYS = 21

export async function GET(req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { schoolId: schoolIdParam } = await params
  const schoolId = Number(schoolIdParam)
  if (!Number.isInteger(schoolId)) {
    return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
  }

  try {
    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 90)

    const [school, trend, byRole, actors] = await Promise.all([
      pool.query(`SELECT id, name FROM schools WHERE id = $1 AND deleted_at IS NULL`, [schoolId]),
      pool.query(`
        SELECT day, actor_role, login_count, unique_actors, total_duration_seconds
        FROM (
          SELECT day, actor_role, login_count, unique_actors, total_duration_seconds
          FROM usage_daily_rollup
          WHERE school_id = $1 AND day >= CURRENT_DATE - $2::int AND day < CURRENT_DATE
          UNION ALL
          SELECT CURRENT_DATE AS day, actor_role, COUNT(*) AS login_count, COUNT(DISTINCT actor_id) AS unique_actors,
                 COALESCE(SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::int)), 0) AS total_duration_seconds
          FROM usage_sessions
          WHERE school_id = $1 AND started_at::date = CURRENT_DATE
          GROUP BY actor_role
        ) combined
        ORDER BY day ASC
      `, [schoolId, days]),
      pool.query(`
        SELECT actor_role, SUM(login_count) AS login_count, SUM(unique_actors) AS unique_actors,
               SUM(total_duration_seconds) AS total_duration_seconds
        FROM (
          SELECT actor_role, login_count, unique_actors, total_duration_seconds
          FROM usage_daily_rollup
          WHERE school_id = $1 AND day >= CURRENT_DATE - $2::int AND day < CURRENT_DATE
          UNION ALL
          SELECT actor_role, COUNT(*) AS login_count, COUNT(DISTINCT actor_id) AS unique_actors,
                 COALESCE(SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::int)), 0) AS total_duration_seconds
          FROM usage_sessions
          WHERE school_id = $1 AND started_at::date = CURRENT_DATE
          GROUP BY actor_role
        ) combined
        GROUP BY actor_role
        ORDER BY login_count DESC
      `, [schoolId, days]),
      pool.query(`
        SELECT actor_id, actor_role, MAX(actor_name) AS actor_name,
               COUNT(*) AS login_count,
               MAX(started_at) AS last_login_at,
               COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
        FROM usage_sessions
        WHERE school_id = $1 AND started_at >= NOW() - ($2::int || ' days')::interval
        GROUP BY actor_id, actor_role
        ORDER BY last_login_at DESC
      `, [schoolId, days]),
    ])

    if (school.rows.length === 0) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }

    const now = Date.now()
    const segmented = actors.rows.map(r => {
      const daysSinceLogin = (now - new Date(r.last_login_at).getTime()) / 86_400_000
      const segment = daysSinceLogin <= ACTIVE_DAYS ? 'active' : daysSinceLogin <= COOLING_DAYS ? 'cooling' : 'at_risk'
      return {
        actor_id: r.actor_id,
        actor_role: r.actor_role,
        actor_name: r.actor_name,
        login_count: Number(r.login_count),
        last_login_at: r.last_login_at,
        total_duration_seconds: Number(r.total_duration_seconds),
        segment,
      }
    })

    const segmentCounts = { active: 0, cooling: 0, at_risk: 0 }
    for (const a of segmented) segmentCounts[a.segment as keyof typeof segmentCounts]++

    return NextResponse.json({
      school: { id: school.rows[0].id, name: school.rows[0].name },
      trend: trend.rows.map(r => ({
        day: r.day,
        actor_role: r.actor_role,
        login_count: Number(r.login_count),
        unique_actors: Number(r.unique_actors),
        total_duration_seconds: Number(r.total_duration_seconds),
      })),
      by_role: byRole.rows.map(r => ({
        actor_role: r.actor_role,
        login_count: Number(r.login_count),
        unique_actors: Number(r.unique_actors),
        total_duration_seconds: Number(r.total_duration_seconds),
      })),
      segment_counts: segmentCounts,
      actors: segmented,
    })
  } catch (error) {
    console.error('[platform/usage-analytics/:schoolId]', error)
    return NextResponse.json({ error: 'Failed to load school usage analytics' }, { status: 500 })
  }
}
