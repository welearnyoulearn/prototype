import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ALL_FEATURES } from '@/lib/features'

export type SchoolTrafficResponse = {
  days: number
  totals: { logins: number; activeUsers: number; seconds: number }
  byRole: { role: string; logins: number; activeUsers: number; seconds: number }[]
  byHour: { hour: number; sessions: number }[] // 0-23, IST
  topFeatures: { portal: string; key: string; label: string; opens: number }[]
}

const Query = z.object({ days: z.enum(['7', '30']).default('7') })
const FEATURE_LABEL = new Map(ALL_FEATURES.map(f => [f.key, f.label]))

// GET /api/school-admin/traffic?days=7|30 — logins, time spent, busiest hours and most-opened
// features for the signed-in school admin / principal's own school.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['school_admin', 'principal'].includes(session.role) || !session.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const schoolId = session.schoolId // from the session only, never the query

  const parsed = Query.safeParse({ days: req.nextUrl.searchParams.get('days') ?? undefined })
  if (!parsed.success) return NextResponse.json({ error: 'days must be 7 or 30' }, { status: 400 })
  const days = Number(parsed.data.days)

  try {
    // Open sessions count up to their last heartbeat, not NOW(), so a tab left open doesn't inflate time spent.
    const [roles, hours, features] = await Promise.all([
      pool.query<{ actor_role: string; logins: string; active_users: string; seconds: string }>(`
        SELECT actor_role, COUNT(*) AS logins, COUNT(DISTINCT actor_id) AS active_users,
               COALESCE(SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (last_seen_at - started_at))::int)), 0) AS seconds
        FROM usage_sessions
        WHERE school_id = $1 AND started_at >= NOW() - make_interval(days => $2)
        GROUP BY actor_role
        ORDER BY logins DESC
      `, [schoolId, days]),
      pool.query<{ hour: number; sessions: string }>(`
        SELECT EXTRACT(HOUR FROM started_at AT TIME ZONE 'Asia/Kolkata')::int AS hour, COUNT(*) AS sessions
        FROM usage_sessions
        WHERE school_id = $1 AND started_at >= NOW() - make_interval(days => $2)
        GROUP BY hour
      `, [schoolId, days]),
      // Raw events are pruned nightly, so past days come from the rollup and today from the raw table.
      pool.query<{ portal: string; nav_key: string; opens: string }>(`
        SELECT portal, nav_key, SUM(opens) AS opens
        FROM (
          SELECT portal, nav_key, open_count AS opens
          FROM feature_usage_daily_rollup
          WHERE school_id = $1 AND day >= CURRENT_DATE - $2::int AND day < CURRENT_DATE
          UNION ALL
          SELECT portal, nav_key, COUNT(*) AS opens
          FROM feature_usage_events
          WHERE school_id = $1 AND created_at::date = CURRENT_DATE
          GROUP BY portal, nav_key
        ) combined
        GROUP BY portal, nav_key
        ORDER BY opens DESC
        LIMIT 10
      `, [schoolId, days]),
    ])

    const byRole = roles.rows.map(r => ({
      role: r.actor_role, logins: Number(r.logins), activeUsers: Number(r.active_users), seconds: Number(r.seconds),
    }))
    const perHour = new Map(hours.rows.map(r => [r.hour, Number(r.sessions)]))
    const body: SchoolTrafficResponse = {
      days,
      totals: {
        logins: byRole.reduce((a, r) => a + r.logins, 0),
        activeUsers: byRole.reduce((a, r) => a + r.activeUsers, 0), // ids are per role table, so summing roles is exact
        seconds: byRole.reduce((a, r) => a + r.seconds, 0),
      },
      byRole,
      byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: perHour.get(hour) ?? 0 })),
      topFeatures: features.rows.map(f => ({
        portal: f.portal,
        key: f.nav_key,
        label: (f.portal === 'school-admin' && FEATURE_LABEL.get(f.nav_key)) || f.nav_key.replace(/-/g, ' '),
        opens: Number(f.opens),
      })),
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[school-admin/traffic]', err)
    return NextResponse.json({ error: 'Failed to load traffic' }, { status: 500 })
  }
}
