import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendMail } from '@/lib/email'
import { buildHealth } from '@/lib/watchline'

const ADMIN_EMAIL = 'kowsik@welearnyoulearn.com'

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
    return NextResponse.json({ deleted, ran_at: new Date().toISOString() })
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
    return NextResponse.json({ deleted, ran_at: new Date().toISOString() })
  } catch (err) {
    console.error('[log-cleanup]', err)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
