import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendMail } from '@/lib/email'
import { buildHealth } from '@/lib/watchline'
import { closeStaleSessions } from '@/lib/usageTracking'

const ADMIN_EMAIL = 'kowsik@welearnyoulearn.com'

// Closes any usage_sessions left open by a heartbeat that never came back
// (tab closed, laptop slept, etc.), then folds the day's now-finalized
// sessions into usage_daily_rollup so the analytics dashboard only ever
// scans a handful of summary rows per school/day instead of raw sessions.
// Runs as part of the same daily cron as log cleanup — no separate cron
// entry needed, and both are cheap, idempotent maintenance jobs.
async function runUsageRollup() {
  const closed = await closeStaleSessions()

  const { rowCount } = await pool.query(`
    INSERT INTO usage_daily_rollup (school_id, day, actor_role, login_count, unique_actors, total_duration_seconds)
    SELECT
      school_id,
      started_at::date AS day,
      actor_role,
      COUNT(*) AS login_count,
      COUNT(DISTINCT actor_id) AS unique_actors,
      COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
    FROM usage_sessions
    WHERE ended_at IS NOT NULL
      AND started_at::date < CURRENT_DATE
      AND started_at::date >= CURRENT_DATE - INTERVAL '2 days'
    GROUP BY school_id, started_at::date, actor_role
    ON CONFLICT (school_id, day, actor_role) DO UPDATE SET
      login_count = EXCLUDED.login_count,
      unique_actors = EXCLUDED.unique_actors,
      total_duration_seconds = EXCLUDED.total_duration_seconds
  `)

  return { stale_sessions_closed: closed, rollup_rows_upserted: rowCount ?? 0 }
}

// Same pattern as runUsageRollup: fold yesterday-and-before's raw
// feature_usage_events into feature_usage_daily_rollup, then delete the raw
// rows once they're safely aggregated — the dashboard only ever reads the
// small rollup table, so there's no reason to keep unbounded per-click rows.
async function runFeatureUsageRollup() {
  const { rowCount } = await pool.query(`
    INSERT INTO feature_usage_daily_rollup (school_id, day, portal, nav_key, actor_role, open_count, unique_actors)
    SELECT
      school_id,
      created_at::date AS day,
      portal,
      nav_key,
      actor_role,
      COUNT(*) AS open_count,
      COUNT(DISTINCT actor_id) AS unique_actors
    FROM feature_usage_events
    WHERE created_at::date < CURRENT_DATE
    GROUP BY school_id, created_at::date, portal, nav_key, actor_role
    ON CONFLICT (school_id, day, portal, nav_key, actor_role) DO UPDATE SET
      open_count = EXCLUDED.open_count,
      unique_actors = EXCLUDED.unique_actors
  `)

  const del = await pool.query(`DELETE FROM feature_usage_events WHERE created_at::date < CURRENT_DATE`)

  return { rollup_rows_upserted: rowCount ?? 0, raw_events_deleted: del.rowCount ?? 0 }
}

async function runCleanup() {
  const [r1, r2, r3] = await Promise.all([
    pool.query(`DELETE FROM request_logs WHERE status_code < 400 AND duration_ms <= 500 AND created_at < NOW() - INTERVAL '7 days'`),
    pool.query(`DELETE FROM request_logs WHERE (status_code >= 400 OR duration_ms > 500) AND created_at < NOW() - INTERVAL '30 days'`),
    pool.query(`DELETE FROM error_events WHERE severity IN ('info','warn') AND created_at < NOW() - INTERVAL '30 days'`),
  ])
  const r4 = await pool.query(`DELETE FROM error_events WHERE severity IN ('error','critical') AND created_at < NOW() - INTERVAL '90 days'`)

  const deleted = {
    request_logs_success:       r1.rowCount,
    request_logs_slow_or_error: r2.rowCount,
    error_events_info_warn:     r3.rowCount,
    error_events_error_critical: r4.rowCount,
  }

  // Check remaining row counts — email only on critical (to avoid daily spam at warn level).
  // The UI banner covers warn; email is reserved for when action is urgent.
  try {
    const health = await buildHealth()
    if (health.overall === 'critical') {
      const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;padding:24px;color:#1f2937">
<h2 style="color:#dc2626;margin:0 0 16px">🚨 Critical: Watchline Storage Alert</h2>
<p>Daily cleanup ran but log row counts remain above the critical (95%) threshold.</p>
<table style="border-collapse:collapse;width:100%;max-width:480px;margin:20px 0">
  <thead><tr style="background:#f3f4f6">
    <th style="text-align:left;padding:10px 14px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb">Table</th>
    <th style="text-align:right;padding:10px 14px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb">Rows</th>
    <th style="text-align:right;padding:10px 14px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb">Limit</th>
    <th style="text-align:right;padding:10px 14px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb">Usage</th>
  </tr></thead>
  <tbody>
    <tr style="background:${health.request_logs.status !== 'ok' ? '#fef2f2' : '#fff'}">
      <td style="padding:10px 14px;font-family:monospace;font-size:13px;border:1px solid #e5e7eb">request_logs</td>
      <td style="text-align:right;padding:10px 14px;font-size:13px;border:1px solid #e5e7eb">${health.request_logs.count.toLocaleString('en-IN')}</td>
      <td style="text-align:right;padding:10px 14px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb">${health.request_logs.limit.toLocaleString('en-IN')}</td>
      <td style="text-align:right;padding:10px 14px;font-weight:700;color:${health.request_logs.status === 'critical' ? '#dc2626' : '#d97706'};border:1px solid #e5e7eb">${health.request_logs.pct}%</td>
    </tr>
    <tr style="background:${health.error_events.status !== 'ok' ? '#fef2f2' : '#fff'}">
      <td style="padding:10px 14px;font-family:monospace;font-size:13px;border:1px solid #e5e7eb">error_events</td>
      <td style="text-align:right;padding:10px 14px;font-size:13px;border:1px solid #e5e7eb">${health.error_events.count.toLocaleString('en-IN')}</td>
      <td style="text-align:right;padding:10px 14px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb">${health.error_events.limit.toLocaleString('en-IN')}</td>
      <td style="text-align:right;padding:10px 14px;font-weight:700;color:${health.error_events.status === 'critical' ? '#dc2626' : '#d97706'};border:1px solid #e5e7eb">${health.error_events.pct}%</td>
    </tr>
  </tbody>
</table>
<p style="font-size:14px;color:#374151">
  <strong>Action required:</strong> Log in to the Platform Admin →
  <a href="${process.env.APP_URL || 'https://welearnyoulearn.com'}/platform-admin/logs">Watchline Logs</a>
  and use <strong>Download &amp; Clear</strong> to free up storage.
</p>
<p style="font-size:13px;color:#6b7280;margin-top:8px">Cleanup deleted: ${JSON.stringify(deleted)}</p>
</body></html>`

      sendMail(ADMIN_EMAIL, '🚨 CRITICAL: Watchline log storage is almost full — action required', html)
        .catch(e => console.error('[log-cleanup] alert email failed:', e))
    }
  } catch (e) {
    console.error('[log-cleanup] health check failed:', e)
  }

  return deleted
}

// GET — called by Vercel Cron (sends Authorization: Bearer <CRON_SECRET>)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const deleted = await runCleanup()
    const usage = await runUsageRollup().catch(e => { console.error('[log-cleanup] usage rollup failed:', e); return null })
    const featureUsage = await runFeatureUsageRollup().catch(e => { console.error('[log-cleanup] feature usage rollup failed:', e); return null })
    return NextResponse.json({ deleted, usage, featureUsage, ran_at: new Date().toISOString() })
  } catch (err) {
    console.error('[log-cleanup]', err)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

// POST — for manual triggering (e.g. from a script or test)
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const deleted = await runCleanup()
    const usage = await runUsageRollup().catch(e => { console.error('[log-cleanup] usage rollup failed:', e); return null })
    const featureUsage = await runFeatureUsageRollup().catch(e => { console.error('[log-cleanup] feature usage rollup failed:', e); return null })
    return NextResponse.json({ deleted, usage, featureUsage, ran_at: new Date().toISOString() })
  } catch (err) {
    console.error('[log-cleanup]', err)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
