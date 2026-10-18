import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendMail } from '@/lib/email'
import { escapeHtml } from '@/lib/html'
import { todayIST } from '@/lib/istDate'
import { planStatus, planExpiryEnforced, GRACE_DAYS } from '@/lib/planExpiry'
import { tierLabel } from '@/lib/staffAccounts'
import { checkCronAuth } from '@/lib/backup'

// Daily (vercel.json). Emails each school's administrators about a plan that is about to end,
// has ended, or whose grace period is over. Auth: Authorization: Bearer <CRON_SECRET>; a plain
// POST works for manual triggering.
//
// Each reminder is sent once per (school, end date) — plan_expiry_notices — and a renewal
// (new end date) starts a fresh set. If the cron missed days, only the most urgent reminder
// that has been reached is sent, not a burst. Schools whose grace ended more than a week ago
// (old dates from before renewals were tracked) are skipped, so turning this on never mails
// hundreds of stale schools.

type Kind = 'd30' | 'd7' | 'd1' | 'expired' | 'grace_end'
type Row = { school_id: number; name: string; email: string | null; tier: string; end: string }

function reachedKinds(daysLeft: number, graceEnds: string, today: string): Kind[] {
  const k: Kind[] = []
  if (daysLeft <= 30) k.push('d30')
  if (daysLeft <= 7) k.push('d7')
  if (daysLeft <= 1) k.push('d1')
  if (daysLeft < 0) k.push('expired')
  if (today > graceEnds) k.push('grace_end')
  return k
}

function message(kind: Kind, r: Row, daysLeft: number): { subject: string; body: string } {
  const plan = `<strong>${escapeHtml(tierLabel(r.tier))}</strong> plan for <strong>${escapeHtml(r.name)}</strong>`
  const enforced = planExpiryEnforced()
  switch (kind) {
    case 'expired':
      return { subject: `Your WLYL plan ended on ${r.end}`, body:
        `<p>The ${plan} ended on <strong>${r.end}</strong>. Everything keeps working for a ${GRACE_DAYS}-day grace period — please renew now, before access is paused.</p>` }
    case 'grace_end':
      return { subject: 'Your WLYL plan has expired', body:
        `<p>The grace period for the ${plan} is over.${enforced ? ' Portal access for teachers, students and parents is now paused, and administrators can only export data and request a renewal' : ' Access may be paused soon'}.
         <strong>None of your data has been deleted</strong> — everything returns as soon as the plan is renewed.</p>` }
    default:
      return { subject: `Your WLYL plan ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, body:
        `<p>The ${plan} ends on <strong>${r.end}</strong> (${daysLeft} day${daysLeft === 1 ? '' : 's'} from now). Contact us to renew and keep every feature without a break.</p>` }
  }
}

async function run() {
  const today = todayIST()
  const { rows } = await pool.query<Row>(
    `SELECT sc.id AS school_id, sc.name, sc.email, ss.tier, sc.plan_end_date::text AS "end"
     FROM schools sc JOIN school_subscriptions ss ON ss.school_id = sc.id
     WHERE ss.tier <> 'none' AND sc.plan_end_date IS NOT NULL`
  )
  const summary = { checked: rows.length, sent: 0, skipped: 0, failed: 0 }
  for (const r of rows) {
    try {
      const st = planStatus(r.tier, r.end, today)
      if (st.days_left === null || !st.grace_ends) continue
      if (today > st.grace_ends && (Date.parse(today) - Date.parse(st.grace_ends)) / 86_400_000 > 7) { summary.skipped++; continue }
      const reached = reachedKinds(st.days_left, st.grace_ends, today)
      if (reached.length === 0) continue
      const { rows: sent } = await pool.query<{ kind: string }>(
        `SELECT kind FROM plan_expiry_notices WHERE school_id = $1 AND plan_end_date = $2`, [r.school_id, r.end])
      const done = new Set(sent.map(s => s.kind))
      const latest = reached[reached.length - 1]
      if (done.has(latest)) continue

      const { rows: admins } = await pool.query<{ email: string }>(
        `SELECT email FROM users WHERE school_id = $1 AND role = 'school_admin'
           AND COALESCE(status, 'active') = 'active' AND email IS NOT NULL`, [r.school_id])
      const to = Array.from(new Set([...admins.map(a => a.email), ...(r.email ? [r.email] : [])]))
      const { subject, body } = message(latest, r, st.days_left)
      const html = `<div style="font-family:sans-serif;max-width:520px;padding:24px"><h2 style="color:#7c3aed">Plan reminder</h2>${body}</div>`
      const results = await Promise.allSettled(to.map(addr => sendMail(addr, subject, html, { schoolId: r.school_id, source: 'email.plan_expiry' })))
      // Record only if at least one mail went out; otherwise the next run retries.
      if (to.length > 0 && results.some(x => x.status === 'fulfilled')) {
        for (const k of reached) {
          await pool.query(
            `INSERT INTO plan_expiry_notices (school_id, plan_end_date, kind) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [r.school_id, r.end, k])
        }
        summary.sent++
      } else summary.failed++
    } catch (e) {
      console.error('[cron/plan-expiry] school', r.school_id, e)
      summary.failed++
    }
  }
  return summary
}

export async function GET(req: NextRequest) {
  const unauthorized = checkCronAuth(req)
  if (unauthorized) {
    return NextResponse.json(
      { error: unauthorized === 503 ? 'Cron authentication is not configured' : 'Unauthorized' },
      { status: unauthorized },
    )
  }
  try {
    return NextResponse.json({ ok: true, ...(await run()) })
  } catch (err) {
    console.error('[cron/plan-expiry]', err)
    return NextResponse.json({ error: 'Plan expiry sweep failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
