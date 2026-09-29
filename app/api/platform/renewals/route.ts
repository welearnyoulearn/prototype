import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { planStatus } from '@/lib/planExpiry'

// GET /api/platform/renewals?status=active|renewed|dismissed|all
// The renewal-request queue (Platform Admin → Renewals). "active" = open + contacted.
// Also returns open_count, which drives the badge on the navigation item.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const filter = req.nextUrl.searchParams.get('status') ?? 'active'
    const where = filter === 'all' ? 'TRUE'
      : filter === 'renewed' ? `r.status = 'renewed'`
      : filter === 'dismissed' ? `r.status = 'dismissed'`
      : `r.status IN ('open', 'contacted')`

    const { rows } = await pool.query(
      `SELECT r.id, r.school_id, r.status, r.note, r.created_at, r.handled_at, r.handled_by_email,
              r.requested_by_name, r.requested_by_email, r.plan_tier AS requested_tier,
              r.plan_end_date::text AS requested_end_date, r.next_tier, r.next_end_date::text AS next_end_date,
              sc.name AS school_name, sc.school_code, sc.city, sc.phone AS school_phone, sc.email AS school_email,
              COALESCE(ss.tier, 'none') AS tier, sc.plan_end_date::text AS plan_end_date
       FROM plan_renewal_requests r
       JOIN schools sc ON sc.id = r.school_id
       LEFT JOIN school_subscriptions ss ON ss.school_id = r.school_id
       WHERE ${where}
       ORDER BY (r.status IN ('open', 'contacted')) DESC, r.created_at DESC
       LIMIT 200`)
    const { rows: [c] } = await pool.query(`SELECT COUNT(*)::int AS n FROM plan_renewal_requests WHERE status = 'open'`)

    return NextResponse.json({
      open_count: c.n,
      requests: rows.map(r => {
        const st = planStatus(r.tier, r.plan_end_date)
        return { ...r, plan_status: st.status, days_left: st.days_left }
      }),
    })
  } catch (err) {
    console.error('[platform/renewals]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
