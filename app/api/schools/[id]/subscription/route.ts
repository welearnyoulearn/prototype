import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { createPlanBill } from '@/lib/bills'
import type { PlanTerm } from '@/lib/billingTypes'
import { sendPlanActivationEmail } from '@/lib/email'
import { requirePlatformAdmin, getSession } from '@/lib/auth'
import { planStatus, nextTerm, renewedEnd, isDateString, daysBetween, addDays, addYears } from '@/lib/planExpiry'
import { todayIST } from '@/lib/istDate'
import {
  STAFF_ROLES, seatsOver, getPlanLimit, countActiveStaffForSchool, notifySeatOverage, tierLabel,
} from '@/lib/staffAccounts'

// A school's plan decides which features it gets and how many staff logins it can
// have, so reading it needs a login (the platform admin, or staff of THIS school) and
// changing it needs the platform admin. This route had no check at all, and /api/ is a
// public prefix in proxy.ts, so anyone could read or change any school's plan by id.
// Optional plan-price fields (#358). With billingPeriod, a school_plan_terms row records the agreed price.
const billingSchema = z.object({
  billingPeriod: z.enum(['monthly', 'yearly']).optional(),
  agreedPrice: z.number().min(0, 'Agreed price can’t be negative').max(10_000_000, 'Agreed price is too high').optional(),
  discountReason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(200, 'Reason is too long (200 characters at most)').optional(),
}).refine(b => !b.billingPeriod || b.agreedPrice !== undefined, { message: 'Enter the agreed price' })

const TERM_COLS = `id, tier, start_date::text AS "startDate", end_date::text AS "endDate", billing_period AS "billingPeriod",
  list_price::float8 AS "listPrice", agreed_price::float8 AS "agreedPrice", discount_reason AS "discountReason"`
const TIER_RANK: Record<string, number> = { none: 0, basic: 1, standard: 2, premium: 3 }
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// '2026-11-01'..'2027-10-31' → '2026–27'
const yearsLabel = (start: string, end: string) => start.slice(0, 4) === end.slice(0, 4) ? start.slice(0, 4) : `${start.slice(0, 4)}–${end.slice(2, 4)}`
const longDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

async function canReadPlan(schoolId: number): Promise<boolean> {
  if (await requirePlatformAdmin()) return true
  const session = await getSession()
  return !!session && STAFF_ROLES.includes(session.role) && Number(session.schoolId) === schoolId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
    const platformAdmin = !!(await requirePlatformAdmin())
    if (!platformAdmin && !(await canReadPlan(Number(id)))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
      // Try to join staff_limit — column may not exist until migration runs
      let result
      try {
        result = await pool.query(
          `SELECT ss.*, pp.staff_limit,
                  sc.plan_start_date::text AS plan_start_date, sc.plan_end_date::text AS plan_end_date
           FROM school_subscriptions ss
           LEFT JOIN plan_pricing pp ON pp.tier = ss.tier
           LEFT JOIN schools sc ON sc.id = ss.school_id
           WHERE ss.school_id = $1`,
          [id]
        )
      } catch {
        result = await pool.query(`SELECT * FROM school_subscriptions WHERE school_id = $1`, [id])
      }
      const row = result.rows.length > 0
        ? result.rows[0]
        : { school_id: parseInt(id), tier: 'none', staff_limit: null }

      // Seat usage travels with the plan so every screen shows the same numbers:
      // active_staff = accounts currently using a seat, seats_over = how many exceed the
      // limit (0 unless the school was downgraded, or the plan's limit was lowered, below
      // what it already has).
      // Plan dates travel with it too: status (active / expiring / grace / expired) and days left.
      if (result.rows.length === 0 || !('plan_end_date' in row)) {
        const { rows: [d] } = await pool.query(`SELECT plan_start_date::text AS s, plan_end_date::text AS e FROM schools WHERE id = $1`, [id])
        row.plan_start_date = d?.s ?? null
        row.plan_end_date = d?.e ?? null
      }
      const state = planStatus(row.tier, row.plan_end_date ?? null)
      const limit: number | null = row.staff_limit ?? null
      const active = await countActiveStaffForSchool(Number(id))
      // The agreed price in force today (#358): platform admin only (school staff see it via /api/billing/plan).
      const planTerm = platformAdmin ? (await pool.query<PlanTerm>(
        `SELECT ${TERM_COLS} FROM school_plan_terms WHERE school_id = $1 AND start_date <= $2::date AND end_date >= $2::date
         ORDER BY start_date DESC, id DESC LIMIT 1`, [id, todayIST()])).rows[0] : undefined
      return NextResponse.json({
        ...row, staff_limit: limit, active_staff: active, seats_over: seatsOver(active, limit), ...(platformAdmin ? { term: planTerm ?? null } : {}),
        plan_status: state.status, days_left: state.days_left, grace_ends: state.grace_ends,
      })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
    const schoolId = Number(id)
    try {
      const body = await req.json()
      const { tier, confirm_over_limit, renew, plan_end_date, no_expiry } = body
      const billing = billingSchema.safeParse(body)
      if (!billing.success) return NextResponse.json({ error: billing.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
      let { billingPeriod, agreedPrice, discountReason } = billing.data
      // A renewal without billing details continues the school's last deal on the same plan, so the
      // quick "Renew" buttons still create the next term and its plan bill.
      if (renew === true && !billingPeriod && typeof tier === 'string' && tier !== 'none') {
        const { rows: [last] } = await pool.query<{ billing_period: 'monthly' | 'yearly'; agreed_price: number; discount_reason: string | null }>(
          `SELECT billing_period, agreed_price::float8 AS agreed_price, discount_reason FROM school_plan_terms
           WHERE school_id = $1 AND tier = $2 ORDER BY start_date DESC, id DESC LIMIT 1`, [schoolId, tier])
        if (last) {
          billingPeriod = last.billing_period
          agreedPrice = last.agreed_price
          discountReason = last.discount_reason ?? undefined
        }
      }
      if (!['none', 'basic', 'standard', 'premium'].includes(tier)) {
        return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
      }
      if (plan_end_date != null && !isDateString(plan_end_date)) {
        return NextResponse.json({ error: 'plan_end_date must be a valid YYYY-MM-DD date' }, { status: 400 })
      }
      if ((renew === true || plan_end_date || no_expiry === true) && tier === 'none') {
        return NextResponse.json({ error: 'A school with no plan has no end date to renew or set' }, { status: 400 })
      }
      if (no_expiry === true && (renew === true || plan_end_date)) {
        return NextResponse.json({ error: 'Choose either "no expiry" or an end date, not both' }, { status: 400 })
      }

      // What would this change do to the school's staff? A school on Standard with 5 active
      // accounts moved to Basic (limit 2) ends up 3 over. That is allowed — nobody is ever
      // switched off automatically — but the platform admin must see the numbers and confirm,
      // because from then on the school can't add or reactivate anyone until it deactivates
      // enough accounts or upgrades again.
      const { rows: [cur] } = await pool.query(`SELECT tier FROM school_subscriptions WHERE school_id = $1`, [schoolId])
      const fromTier: string = cur?.tier ?? 'none'
      const { rows: [dates] } = await pool.query(
        `SELECT plan_start_date::text AS s, plan_end_date::text AS e FROM schools WHERE id = $1`, [schoolId])
      const today = todayIST()
      // The term only starts or moves on first activation, an expired plan, or an explicit
      // renew / end date. Re-saving the same plan, or changing tier mid-term, keeps the dates.
      const explicitEnd: string | null = plan_end_date ?? (renew === true ? renewedEnd(dates?.e ?? null, today) : null)
      const term = nextTerm(fromTier, { start: dates?.s ?? null, end: dates?.e ?? null }, tier, explicitEnd, today, no_expiry === true)
      if (term && term.end && daysBetween(term.start, term.end) < 0) {
        return NextResponse.json({ error: 'The end date cannot be before the plan start date' }, { status: 400 })
      }

      // Plan price for this term: checked before anything is written.
      let priced: { listPrice: number; agreed: number; planName: string; cur: PlanTerm | null } | null = null
      if (billingPeriod && tier !== 'none' && term) {
        if (!term.end) return NextResponse.json({ error: 'A billed plan needs an end date' }, { status: 400 })
        const { rows: [pp] } = await pool.query<{ name: string; monthly: number | null; yearly: number | null }>(
          `SELECT display_name AS name, monthly_price::float8 AS monthly, yearly_price::float8 AS yearly FROM plan_pricing WHERE tier = $1`, [tier])
        const listPrice = billingPeriod === 'yearly' ? pp?.yearly : pp?.monthly
        if (listPrice == null) return NextResponse.json({ error: `Set a price for ${tierLabel(tier)} first` }, { status: 400 })
        const agreed = agreedPrice ?? listPrice
        if ((agreed < listPrice || agreed === 0) && !discountReason) {
          return NextResponse.json({ error: 'Give a reason for a price below the list price' }, { status: 400 })
        }
        const { rows: [cur] } = await pool.query<PlanTerm>(
          `SELECT ${TERM_COLS} FROM school_plan_terms
           WHERE school_id = $1 AND billing_period = 'yearly' AND start_date <= $2::date AND end_date >= $2::date
           ORDER BY start_date DESC, id DESC LIMIT 1`, [schoolId, today])
        priced = { listPrice, agreed, planName: pp?.name ?? tierLabel(tier), cur: cur ?? null }

        // Downgrade in the middle of a paid yearly term: the school keeps its plan until the term
        // ends; the cheaper term is stored to start the day after. Nothing changes or is billed now.
        if (cur && renew !== true && !term.started && TIER_RANK[tier] < (TIER_RANK[cur.tier] ?? 0)) {
          const start = addDays(cur.endDate, 1)
          const { rows: [next] } = await pool.query<PlanTerm>(
            `INSERT INTO school_plan_terms (school_id, tier, start_date, end_date, billing_period, list_price, agreed_price, discount_reason, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${TERM_COLS}`,
            [schoolId, tier, start, addDays(addYears(start, 1), -1), billingPeriod, listPrice, agreed, discountReason ?? null, session.displayName ?? `user #${session.userId}`])
          const { rows: [sub] } = await pool.query(`SELECT * FROM school_subscriptions WHERE school_id = $1`, [schoolId])
          await pool.query(
            `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
             VALUES ($1, (SELECT email FROM users WHERE id = $1), 'update_subscription', 'subscription', $2, (SELECT name FROM schools WHERE id = $2), $3)`,
            [session.userId, schoolId, JSON.stringify({ from: fromTier, to: tier, downgrade_at_renewal: true, plan_term: next })]
          ).catch(err => console.error('[audit/subscription]', err))
          return NextResponse.json({
            ...sub, tier: fromTier, plan_start_date: dates?.s ?? null, plan_end_date: dates?.e ?? null,
            plan_status: planStatus(fromTier, dates?.e ?? null, today).status, no_expiry: !dates?.e,
            term: next, message: `Downgrade to ${priced.planName} starts on ${longDate(start)}, when the current term ends. No bill now.`,
          })
        }
      }

      const newLimit = await getPlanLimit(tier)
      const active = await countActiveStaffForSchool(schoolId)
      const over = seatsOver(active, newLimit)

      if (tier !== fromTier && over > 0 && confirm_over_limit !== true) {
        return NextResponse.json({
          error: `This school has ${active} active staff accounts but ${tierLabel(tier)} allows ${newLimit}.`,
          code: 'OVER_SEAT_LIMIT', from: fromTier, tier, limit: newLimit, active, excess: over,
        }, { status: 409 })
      }

      const result = await pool.query(
        `INSERT INTO school_subscriptions (school_id, tier, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (school_id) DO UPDATE SET tier = $2, updated_at = NOW()
         RETURNING *`,
        [schoolId, tier]
      )

      const { rows: [school] } = await pool.query('SELECT name, email, school_code FROM schools WHERE id = $1', [schoolId])

      // Record the agreed price, and bill a yearly term (monthly terms are billed by the monthly run).
      let planTerm: PlanTerm | null = null
      let billId: number | undefined
      let message: string | undefined
      if (priced && term?.end && billingPeriod) {
        const { listPrice, agreed, planName, cur } = priced
        const { rows: [row] } = await pool.query<PlanTerm>(
          `INSERT INTO school_plan_terms (school_id, tier, start_date, end_date, billing_period, list_price, agreed_price, discount_reason, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${TERM_COLS}`,
          [schoolId, tier, term.start, term.end, billingPeriod, listPrice, agreed, discountReason ?? null, session.displayName ?? `user #${session.userId}`])
        planTerm = row
        let amount = 0
        let title = ''
        if (billingPeriod === 'monthly') message = 'No bill: billed monthly'
        else if (cur && renew !== true && !term.started) {
          // Mid-term change: only a dearer price is billed, pro rata for the days left (today included).
          const remaining = daysBetween(today, cur.endDate) + 1
          amount = Math.round((agreed - cur.agreedPrice) * remaining / (daysBetween(cur.startDate, cur.endDate) + 1) * 100) / 100
          title = `Plan upgrade · ${planName} (remaining ${remaining} days)`
          if (amount <= 0) message = 'No bill: this term is already billed'
        } else {
          amount = agreed
          title = `Plan · ${planName} ${yearsLabel(term.start, term.end)}`
          if (amount === 0) message = 'No bill: complimentary'
        }
        if (!message) {
          const total = amount + Math.round(amount * 18) / 100
          try {
            billId = await createPlanBill({ schoolId, termId: row.id, title, amount, billDate: today, createdBy: session.displayName ?? `user #${session.userId}` })
            message = `Plan bill for ${inr(total)} created and emailed`
          } catch (err) {
            console.error('[subscription/plan-bill]', err)
            message = `Plan saved, but the plan bill for ${inr(total)} could not be created. Check the server log and try again.`
          }
        }
      }

      // Every plan change is recorded with who made it and what it did to the seats.
      await pool.query(
        `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
         VALUES ($1, (SELECT email FROM users WHERE id = $1), 'update_subscription', 'subscription', $2, $3, $4)`,
        [session.userId, schoolId, school?.name ?? null,
         JSON.stringify({ from: fromTier, to: tier, staff_limit: newLimit, active_staff: active, over_by: over, confirmed_over_limit: over > 0,
           plan_start_date: term?.start ?? null, plan_end_date: term?.end ?? null, renewed: renew === true, term_started: term?.started ?? false,
           plan_term: planTerm, bill_id: billId ?? null })]
      ).catch(err => console.error('[audit/subscription]', err))

      // The school's own administrators are told what happened and what to do — they would
      // otherwise only find out when an Add or Reactivate is refused.
      if (tier !== fromTier && over > 0 && newLimit !== null) {
        void notifySeatOverage(schoolId, { schoolName: school?.name ?? 'Your school', tier, limit: newLimit, active })
      }

      if (term) {
        await pool.query(
          `UPDATE schools SET plan_start_date = $1, plan_end_date = $2 WHERE id = $3`,
          [term.start, term.end, schoolId]
        )
        // Mail the school only when something it should know about happened: a term began, it
        // was renewed / its end date changed, or the tier changed. A no-op re-save sends nothing.
        const endChanged = term.end !== (dates?.e ?? null)
        if ((term.started || endChanged || tier !== fromTier) && school?.email && school?.school_code) {
          const fmt = (d: string | null) => !d ? 'No end date' : new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
          sendPlanActivationEmail({
            to: school.email, schoolName: school.name, schoolCode: school.school_code,
            tier, startDate: fmt(term.start), endDate: fmt(term.end), schoolId,
          }).catch(err => console.error('[email/plan]', err))
        }

        // A renewal request that was waiting for this school is now answered: record what was agreed
        // (the next plan and end date) so the Renewals queue shows it.
        if ((term.end === null || term.end >= today) && (term.started || endChanged || tier !== fromTier)) {
          await pool.query(
            `UPDATE plan_renewal_requests
             SET status = 'renewed', next_tier = $2, next_end_date = $3,
                 handled_by_email = (SELECT email FROM users WHERE id = $4), handled_at = NOW()
             WHERE school_id = $1 AND status IN ('open', 'contacted')`,
            [schoolId, tier, term.end, session.userId]
          ).catch(err => console.error('[subscription/renewal-request]', err))
        }
      }

      return NextResponse.json({
        ...result.rows[0], seats: { limit: newLimit, active, over },
        plan_start_date: term?.start ?? null, plan_end_date: term?.end ?? null,
        plan_status: planStatus(tier, term?.end ?? null, today).status,
        no_expiry: !!term && term.end === null,
        ...(planTerm ? { term: planTerm, billId, message } : {}),
      })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
