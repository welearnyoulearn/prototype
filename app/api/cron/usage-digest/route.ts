// GET /api/cron/usage-digest
// Weekly usage summary emailed to the platform team every Monday morning —
// top movers (biggest week-over-week login change), schools that went quiet,
// and headline feature-adoption numbers. Same auth convention as
// cron/weekly-test: Vercel Cron calls GET with Authorization: Bearer
// <CRON_SECRET>; a plain POST works for manual triggering.
//
// Deliberately queries the DB directly rather than calling the dashboard's
// own API routes over HTTP — this runs server-side already, so an internal
// self-fetch would just add latency and a pointless auth round-trip for no
// benefit.
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendMail } from '@/lib/email'
import { ALL_FEATURES } from '@/lib/features'

const DIGEST_RECIPIENT = 'kowsik@welearnyoulearn.com'
const AT_RISK_HEALTH_THRESHOLD = 30
const RECENCY_DECAY_DAYS = 30
const RECENCY_WEIGHT = 0.6
const BREADTH_WEIGHT = 0.4

async function buildDigest() {
  const [thisWeek, lastWeek, lastLogin, entitlement, opens, totalSchools] = await Promise.all([
    pool.query(`
      SELECT school_id, SUM(login_count) AS login_count
      FROM usage_daily_rollup
      WHERE day >= CURRENT_DATE - 7 AND day < CURRENT_DATE
      GROUP BY school_id
    `),
    pool.query(`
      SELECT school_id, SUM(login_count) AS login_count
      FROM usage_daily_rollup
      WHERE day >= CURRENT_DATE - 14 AND day < CURRENT_DATE - 7
      GROUP BY school_id
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
      FROM feature_usage_daily_rollup
      WHERE portal = 'school-admin' AND day >= CURRENT_DATE - 7
      GROUP BY school_id, nav_key
    `),
    pool.query(`
      SELECT s.id, s.name
      FROM schools s
      WHERE s.deleted_at IS NULL AND s.status = 'active'
    `),
  ])

  const thisWeekBySchool = new Map<number, number>()
  for (const r of thisWeek.rows) thisWeekBySchool.set(r.school_id, Number(r.login_count))
  const lastWeekBySchool = new Map<number, number>()
  for (const r of lastWeek.rows) lastWeekBySchool.set(r.school_id, Number(r.login_count))
  const lastLoginBySchool = new Map<number, string>()
  for (const r of lastLogin.rows) lastLoginBySchool.set(r.school_id, r.last_login_at)

  const entitledBySchool = new Map<number, Set<string>>()
  for (const r of entitlement.rows) {
    if (!r.entitled) continue
    if (!entitledBySchool.has(r.school_id)) entitledBySchool.set(r.school_id, new Set())
    entitledBySchool.get(r.school_id)!.add(r.feature_key)
  }
  const usedBySchool = new Map<number, Set<string>>()
  for (const r of opens.rows) {
    if (!usedBySchool.has(r.school_id)) usedBySchool.set(r.school_id, new Set())
    usedBySchool.get(r.school_id)!.add(r.nav_key)
  }

  const now = Date.now()
  const scored = totalSchools.rows.map(s => {
    const thisW = thisWeekBySchool.get(s.id) || 0
    const lastW = lastWeekBySchool.get(s.id) || 0
    const change = thisW - lastW
    const lastLoginAt = lastLoginBySchool.get(s.id)
    const daysSinceLogin = lastLoginAt ? (now - new Date(lastLoginAt).getTime()) / 86_400_000 : null
    const recencyScore = daysSinceLogin == null ? 0 : Math.max(0, 100 - (daysSinceLogin / RECENCY_DECAY_DAYS) * 100)
    const entitled = entitledBySchool.get(s.id) || new Set()
    const used = usedBySchool.get(s.id) || new Set()
    const usedEntitled = [...used].filter(k => entitled.has(k)).length
    const breadthScore = entitled.size > 0 ? (usedEntitled / entitled.size) * 100 : 0
    const healthScore = Math.round(recencyScore * RECENCY_WEIGHT + breadthScore * BREADTH_WEIGHT)
    return { school_id: s.id, school_name: s.name, this_week: thisW, last_week: lastW, change, health_score: healthScore, days_since_login: daysSinceLogin == null ? null : Math.floor(daysSinceLogin) }
  })

  const topMovers = [...scored].filter(s => s.change !== 0).sort((a, b) => b.change - a.change).slice(0, 5)
  const wentQuiet = [...scored].filter(s => s.last_week > 0 && s.this_week === 0).sort((a, b) => b.last_week - a.last_week).slice(0, 5)
  const atRisk = scored.filter(s => s.health_score < AT_RISK_HEALTH_THRESHOLD).sort((a, b) => a.health_score - b.health_score).slice(0, 10)

  const totalLoginsThisWeek = [...thisWeekBySchool.values()].reduce((a, b) => a + b, 0)
  const totalLoginsLastWeek = [...lastWeekBySchool.values()].reduce((a, b) => a + b, 0)
  const activeSchoolsThisWeek = thisWeekBySchool.size

  return { topMovers, wentQuiet, atRisk, totalLoginsThisWeek, totalLoginsLastWeek, activeSchoolsThisWeek, totalSchools: totalSchools.rows.length }
}

function fmt(n: number) { return n.toLocaleString('en-IN') }

function buildHtml(d: Awaited<ReturnType<typeof buildDigest>>) {
  const loginDelta = d.totalLoginsThisWeek - d.totalLoginsLastWeek
  const deltaColor = loginDelta > 0 ? '#059669' : loginDelta < 0 ? '#dc2626' : '#6b7280'
  const deltaSign = loginDelta > 0 ? '+' : ''

  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 14px;font-size:13px;color:#374151;border:1px solid #e5e7eb">${label}</td><td style="text-align:right;padding:8px 14px;font-size:13px;font-weight:600;color:#111827;border:1px solid #e5e7eb">${value}</td></tr>`

  const moversRows = d.topMovers.length
    ? d.topMovers.map(m => row(m.school_name, `${m.change > 0 ? '+' : ''}${m.change} logins (${m.last_week} → ${m.this_week})`)).join('')
    : `<tr><td colspan="2" style="padding:12px 14px;font-size:13px;color:#9ca3af;text-align:center;border:1px solid #e5e7eb">No week-over-week change yet</td></tr>`

  const quietRows = d.wentQuiet.length
    ? d.wentQuiet.map(m => row(m.school_name, `was ${m.last_week} logins, now 0`)).join('')
    : `<tr><td colspan="2" style="padding:12px 14px;font-size:13px;color:#9ca3af;text-align:center;border:1px solid #e5e7eb">No schools went quiet this week</td></tr>`

  const riskRows = d.atRisk.length
    ? d.atRisk.map(m => row(m.school_name, `score ${m.health_score} · ${m.days_since_login == null ? 'never logged in' : `${m.days_since_login}d since login`}`)).join('')
    : `<tr><td colspan="2" style="padding:12px 14px;font-size:13px;color:#9ca3af;text-align:center;border:1px solid #e5e7eb">No at-risk schools this week</td></tr>`

  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;padding:24px;color:#1f2937;background:#f9fafb">
<div style="max-width:600px;margin:0 auto">
<h2 style="margin:0 0 4px">📊 Weekly Usage Digest</h2>
<p style="color:#6b7280;font-size:13px;margin:0 0 20px">${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>

<table style="border-collapse:collapse;width:100%;margin-bottom:24px">
  <tr>
    <td style="padding:14px;background:#fff;border:1px solid #e5e7eb;border-radius:8px 0 0 8px">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">Logins this week</p>
      <p style="font-size:22px;font-weight:700;margin:0">${fmt(d.totalLoginsThisWeek)}</p>
      <p style="font-size:12px;color:${deltaColor};margin:2px 0 0">${deltaSign}${fmt(loginDelta)} vs last week</p>
    </td>
    <td style="padding:14px;background:#fff;border:1px solid #e5e7eb;border-left:none;border-radius:0 8px 8px 0">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">Active schools</p>
      <p style="font-size:22px;font-weight:700;margin:0">${fmt(d.activeSchoolsThisWeek)}</p>
      <p style="font-size:12px;color:#6b7280;margin:2px 0 0">of ${fmt(d.totalSchools)} total</p>
    </td>
  </tr>
</table>

<h3 style="font-size:14px;margin:0 0 8px">📈 Top movers this week</h3>
<table style="border-collapse:collapse;width:100%;margin-bottom:24px">${moversRows}</table>

<h3 style="font-size:14px;margin:0 0 8px">🔇 Went quiet this week</h3>
<table style="border-collapse:collapse;width:100%;margin-bottom:24px">${quietRows}</table>

<h3 style="font-size:14px;margin:0 0 8px">🚨 At-risk schools (health score &lt; ${AT_RISK_HEALTH_THRESHOLD})</h3>
<table style="border-collapse:collapse;width:100%;margin-bottom:24px">${riskRows}</table>

<p style="font-size:13px;color:#374151">
  Full dashboard: <a href="${process.env.APP_URL || 'https://welearnyoulearn.com'}/platform-admin/usage-analytics">Usage Analytics</a>
</p>
</div>
</body></html>`
}

async function run() {
  const digest = await buildDigest()
  await sendMail(DIGEST_RECIPIENT, '📊 Weekly Usage Digest — WLYL Platform', buildHtml(digest))
  return digest
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth.replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    const digest = await run()
    return NextResponse.json({ ok: true, sent_at: new Date().toISOString(), summary: digest })
  } catch (err) {
    console.error('[cron/usage-digest]', err)
    return NextResponse.json({ error: 'Digest failed', details: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
