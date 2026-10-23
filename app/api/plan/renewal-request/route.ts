import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendMail } from '@/lib/email'
import { escapeHtml as esc } from '@/lib/html'
import { planStatus } from '@/lib/planExpiry'
import { tierLabel } from '@/lib/staffAccounts'

// POST /api/plan/renewal-request — the school administrator asks WLYL to renew (or change) the plan.
// Allowed while locked (proxy.ts exempts /api/plan/), since an expired school must be able to ask.
// The request lands in Platform Admin → Renewals. A school has at most one waiting request
// (partial unique index); asking again returns 429 with a friendly message and sends nothing.
export async function POST() {
  try {
    const session = await getSession()
    if (!session || !session.schoolId || !['school_admin', 'principal'].includes(session.role)) {
      return NextResponse.json({ error: 'Only the school administrator or principal can request a renewal' }, { status: 403 })
    }
    const schoolId = Number(session.schoolId)

    const { rows: [school] } = await pool.query(
      `SELECT sc.name, sc.school_code, sc.plan_end_date::text AS plan_end_date, ss.tier,
              COALESCE(up.full_name, u.full_name) AS full_name, u.email AS requester_email
       FROM schools sc
       LEFT JOIN school_subscriptions ss ON ss.school_id = sc.id
       JOIN users u ON u.id = $1
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE sc.id = $2`, [session.userId, schoolId])
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    // ON CONFLICT on the partial unique index: a second request while one is waiting inserts nothing.
    const { rows: created } = await pool.query(
      `INSERT INTO plan_renewal_requests (school_id, requested_by, requested_by_name, requested_by_email, plan_tier, plan_end_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (school_id) WHERE status IN ('open', 'contacted') DO NOTHING
       RETURNING id`,
      [schoolId, session.userId, school.full_name ?? null, school.requester_email, school.tier ?? 'none', school.plan_end_date])
    if (created.length === 0) {
      return NextResponse.json({ error: 'A renewal request is already with us. We will contact you shortly.', code: 'ALREADY_REQUESTED' }, { status: 429 })
    }

    const state = planStatus(school.tier ?? 'none', school.plan_end_date)
    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, $2, 'plan_renewal_request', 'school', $3, $4, $5)`,
      [session.userId, school.requester_email, schoolId, school.name,
       JSON.stringify({ tier: school.tier, plan_end_date: school.plan_end_date, plan_status: state.status })]
    ).catch(err => console.error('[plan/renewal-request audit]', err))

    const { rows: admins } = await pool.query<{ email: string }>(
      `SELECT email FROM users WHERE role = 'platform_admin' AND status = 'active'`)
    const recipients = admins.length > 0 ? admins.map(a => a.email) : [process.env.SUPPORT_EMAIL || 'support@welearnyoulearn.com']
    const html = `<div style="font-family:sans-serif;max-width:520px;padding:24px">
      <h2 style="color:#7c3aed">Plan renewal request</h2>
      <p><strong>School:</strong> ${esc(school.name)} (${esc(school.school_code ?? '-')})</p>
      <p><strong>Plan:</strong> ${esc(tierLabel(school.tier ?? 'none'))} · ends ${esc(school.plan_end_date ?? 'no end date')} · status ${esc(state.status)}</p>
      <p><strong>Requested by:</strong> ${esc(school.full_name ?? '')} &lt;${esc(school.requester_email)}&gt;</p>
      <p>Open Platform Admin → Renewals to contact the school and set the next plan and end date.</p></div>`
    // Best effort: the request is already in the queue even if the mail fails.
    await Promise.allSettled(recipients.map(to => sendMail(to, `Plan renewal request — ${school.name}`, html)))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[plan/renewal-request]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
