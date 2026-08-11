import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// Leadership view: month-over-month active-school counts and cohort
// retention. "Active" for a given month means the school had at least one
// login (any role) that month — read from usage_daily_rollup, so this
// necessarily only covers months since usage tracking went live; there's no
// way to backfill activity from before this feature existed.
//
// Cohort retention groups schools by the month they were CREATED (schools.
// created_at — onboarding date, independent of usage tracking's start date),
// then for each cohort reports what % of that cohort logged in at least once
// in each subsequent month. A school onboarded before usage tracking existed
// still lands in its correct cohort month; its early retention months just
// read as 0% until the month tracking began, which is a real gap in the
// data, not a bug — called out via `tracking_started` in the response so the
// UI can grey out months that predate tracking instead of implying 0% churn.
export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const months = Math.min(Math.max(Number(req.nextUrl.searchParams.get('months')) || 6, 1), 12)

    const [monthlyActive, trackingStart, cohorts, cohortActivity] = await Promise.all([
      pool.query(`
        SELECT date_trunc('month', day)::date AS month,
               COUNT(DISTINCT school_id) AS active_schools,
               SUM(login_count) AS login_count
        FROM usage_daily_rollup
        WHERE day >= date_trunc('month', CURRENT_DATE) - ($1::int || ' months')::interval
        GROUP BY date_trunc('month', day)
        ORDER BY month ASC
      `, [months]),
      pool.query(`SELECT MIN(day) AS min_day FROM usage_daily_rollup`),
      pool.query(`
        SELECT date_trunc('month', created_at)::date AS cohort_month, COUNT(*) AS cohort_size
        FROM schools
        WHERE deleted_at IS NULL
          AND created_at >= date_trunc('month', CURRENT_DATE) - ($1::int || ' months')::interval
        GROUP BY date_trunc('month', created_at)
        ORDER BY cohort_month ASC
      `, [months]),
      pool.query(`
        SELECT date_trunc('month', s.created_at)::date AS cohort_month,
               date_trunc('month', r.day)::date AS active_month,
               COUNT(DISTINCT r.school_id) AS active_count
        FROM schools s
        JOIN usage_daily_rollup r ON r.school_id = s.id
        WHERE s.deleted_at IS NULL
          AND s.created_at >= date_trunc('month', CURRENT_DATE) - ($1::int || ' months')::interval
        GROUP BY date_trunc('month', s.created_at), date_trunc('month', r.day)
      `, [months]),
    ])

    // Total school count as of "now" for reference (not month-by-month growth
    // of the total base, just current denominator context in the UI).
    const totalSchools = await pool.query(`SELECT COUNT(*) AS count FROM schools WHERE deleted_at IS NULL AND status = 'active'`)

    // Build cohort_month -> { size, activityByMonthOffset }
    const cohortSizeByMonth = new Map<string, number>()
    for (const r of cohorts.rows) cohortSizeByMonth.set(r.cohort_month.toISOString().slice(0, 10), Number(r.cohort_size))

    const activityByCohort = new Map<string, Map<string, number>>()
    for (const r of cohortActivity.rows) {
      const cohortKey = r.cohort_month.toISOString().slice(0, 10)
      const activeKey = r.active_month.toISOString().slice(0, 10)
      if (!activityByCohort.has(cohortKey)) activityByCohort.set(cohortKey, new Map())
      activityByCohort.get(cohortKey)!.set(activeKey, Number(r.active_count))
    }

    // Retention as offset-from-cohort-month (0 = onboarding month itself, 1 = next month, ...)
    const cohortRows = [...cohortSizeByMonth.entries()].map(([cohortMonth, size]) => {
      const activity = activityByCohort.get(cohortMonth) || new Map()
      const cohortDate = new Date(cohortMonth)
      const retention: { offset: number; month: string; active: number; pct: number }[] = []
      for (let offset = 0; offset <= months; offset++) {
        const d = new Date(cohortDate)
        d.setMonth(d.getMonth() + offset)
        if (d > new Date()) break
        const key = d.toISOString().slice(0, 10)
        const active = activity.get(key) || 0
        retention.push({ offset, month: key, active, pct: size > 0 ? Math.round((active / size) * 100) : 0 })
      }
      return { cohort_month: cohortMonth, cohort_size: size, retention }
    })

    return NextResponse.json({
      months,
      total_active_schools: Number(totalSchools.rows[0].count),
      tracking_started: trackingStart.rows[0].min_day,
      monthly_active: monthlyActive.rows.map(r => ({
        month: r.month,
        active_schools: Number(r.active_schools),
        login_count: Number(r.login_count),
      })),
      cohorts: cohortRows,
    })
  } catch (error) {
    console.error('[platform/usage-analytics/growth]', error)
    return NextResponse.json({ error: 'Failed to load growth analytics' }, { status: 500 })
  }
}
