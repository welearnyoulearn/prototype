import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/internal/log-cleanup
// Called by Vercel Cron daily. Enforces Watchline retention policy.
// Requires CRON_SECRET header to prevent public triggering.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    // request_logs: keep 7 days for 2xx success, 30 days for slow/4xx/5xx
    const [r1, r2, r3] = await Promise.all([
      pool.query(
        `DELETE FROM request_logs
         WHERE status_code < 400 AND duration_ms <= 500
           AND created_at < NOW() - INTERVAL '7 days'`,
      ),
      pool.query(
        `DELETE FROM request_logs
         WHERE (status_code >= 400 OR duration_ms > 500)
           AND created_at < NOW() - INTERVAL '30 days'`,
      ),
      // error_events: keep 30 days for info/warn, 90 days for error/critical
      pool.query(
        `DELETE FROM error_events
         WHERE severity IN ('info','warn')
           AND created_at < NOW() - INTERVAL '30 days'`,
      ),
    ])
    const r4 = await pool.query(
      `DELETE FROM error_events
       WHERE severity IN ('error','critical')
         AND created_at < NOW() - INTERVAL '90 days'`,
    )
    return NextResponse.json({
      deleted: {
        request_logs_success: r1.rowCount,
        request_logs_slow_or_error: r2.rowCount,
        error_events_info_warn: r3.rowCount,
        error_events_error_critical: r4.rowCount,
      },
      ran_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[log-cleanup]', err)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
