import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// Platform-wide usage overview. usage_daily_rollup only covers days that have
// already been through the nightly cron, so on its own it under-reports
// "today" for the entire day the feature is live/being used. Every query
// here UNIONs the rollup (days before today) with a live aggregate computed
// straight from usage_sessions for today specifically — for a still-open
// session that's elapsed-so-far (NOW() - started_at), for a closed one it's
// the stored duration_seconds — so today's numbers show up immediately
// instead of waiting for tomorrow's cron run.
export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 90)

    const [activeNow, trend, byRole, bySchool, totals] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS count
        FROM usage_sessions
        WHERE ended_at IS NULL AND last_seen_at >= NOW() - INTERVAL '10 minutes'
      `),
      pool.query(`
        SELECT day, SUM(login_count) AS login_count, SUM(unique_actors) AS unique_actors,
               SUM(total_duration_seconds) AS total_duration_seconds
        FROM (
          SELECT day, login_count, unique_actors, total_duration_seconds
          FROM usage_daily_rollup
          WHERE day >= CURRENT_DATE - $1::int AND day < CURRENT_DATE
          UNION ALL
          SELECT CURRENT_DATE AS day, COUNT(*) AS login_count, COUNT(DISTINCT actor_id) AS unique_actors,
                 COALESCE(SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::int)), 0) AS total_duration_seconds
          FROM usage_sessions
          WHERE started_at::date = CURRENT_DATE
        ) combined
        GROUP BY day
        ORDER BY day ASC
      `, [days]),
      pool.query(`
        SELECT actor_role, SUM(login_count) AS login_count, SUM(unique_actors) AS unique_actors,
               SUM(total_duration_seconds) AS total_duration_seconds
        FROM (
          SELECT actor_role, login_count, unique_actors, total_duration_seconds
          FROM usage_daily_rollup
          WHERE day >= CURRENT_DATE - $1::int AND day < CURRENT_DATE
          UNION ALL
          SELECT actor_role, COUNT(*) AS login_count, COUNT(DISTINCT actor_id) AS unique_actors,
                 COALESCE(SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::int)), 0) AS total_duration_seconds
          FROM usage_sessions
          WHERE started_at::date = CURRENT_DATE
          GROUP BY actor_role
        ) combined
        GROUP BY actor_role
        ORDER BY login_count DESC
      `, [days]),
      pool.query(`
        SELECT c.school_id, s.name AS school_name,
               SUM(c.login_count) AS login_count,
               SUM(c.unique_actors) AS unique_actors,
               SUM(c.total_duration_seconds) AS total_duration_seconds,
               MAX(c.last_active_day) AS last_active_day
        FROM (
          SELECT school_id, day AS last_active_day, login_count, unique_actors, total_duration_seconds
          FROM usage_daily_rollup
          WHERE day >= CURRENT_DATE - $1::int AND day < CURRENT_DATE
          UNION ALL
          SELECT school_id, CURRENT_DATE AS last_active_day, COUNT(*) AS login_count, COUNT(DISTINCT actor_id) AS unique_actors,
                 COALESCE(SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::int)), 0) AS total_duration_seconds
          FROM usage_sessions
          WHERE started_at::date = CURRENT_DATE AND school_id IS NOT NULL
          GROUP BY school_id
        ) c
        JOIN schools s ON s.id = c.school_id
        WHERE s.deleted_at IS NULL
        GROUP BY c.school_id, s.name
        ORDER BY login_count DESC
      `, [days]),
      pool.query(`
        SELECT SUM(login_count) AS login_count, SUM(unique_actors) AS unique_actors,
               SUM(total_duration_seconds) AS total_duration_seconds
        FROM (
          SELECT login_count, unique_actors, total_duration_seconds
          FROM usage_daily_rollup
          WHERE day >= CURRENT_DATE - $1::int AND day < CURRENT_DATE
          UNION ALL
          SELECT COUNT(*) AS login_count, COUNT(DISTINCT actor_id) AS unique_actors,
                 COALESCE(SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::int)), 0) AS total_duration_seconds
          FROM usage_sessions
          WHERE started_at::date = CURRENT_DATE
        ) combined
      `, [days]),
    ])

    return NextResponse.json({
      active_now: Number(activeNow.rows[0].count),
      totals: {
        login_count: Number(totals.rows[0].login_count) || 0,
        unique_actors: Number(totals.rows[0].unique_actors) || 0,
        total_duration_seconds: Number(totals.rows[0].total_duration_seconds) || 0,
      },
      trend: trend.rows.map(r => ({
        day: r.day,
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
      by_school: bySchool.rows.map(r => ({
        school_id: r.school_id,
        school_name: r.school_name,
        login_count: Number(r.login_count),
        unique_actors: Number(r.unique_actors),
        total_duration_seconds: Number(r.total_duration_seconds),
        last_active_day: r.last_active_day,
      })),
    })
  } catch (error) {
    console.error('[platform/usage-analytics]', error)
    return NextResponse.json({ error: 'Failed to load usage analytics' }, { status: 500 })
  }
}
