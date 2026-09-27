import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendPlanActivationEmail } from '@/lib/email'
import { requirePlatformAdmin, getSession } from '@/lib/auth'
import {
  STAFF_ROLES, seatsOver, getPlanLimit, countActiveStaffForSchool, notifySeatOverage, tierLabel,
} from '@/lib/staffAccounts'

// A school's plan decides which features it gets and how many staff logins it can
// have, so reading it needs a login (the platform admin, or staff of THIS school) and
// changing it needs the platform admin. This route had no check at all, and /api/ is a
// public prefix in proxy.ts, so anyone could read or change any school's plan by id.
async function canReadPlan(schoolId: number): Promise<boolean> {
  if (await requirePlatformAdmin()) return true
  const session = await getSession()
  return !!session && STAFF_ROLES.includes(session.role) && Number(session.schoolId) === schoolId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
    if (!(await canReadPlan(Number(id)))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
      // Try to join staff_limit — column may not exist until migration runs
      let result
      try {
        result = await pool.query(
          `SELECT ss.*, pp.staff_limit
           FROM school_subscriptions ss
           LEFT JOIN plan_pricing pp ON pp.tier = ss.tier
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
      const limit: number | null = row.staff_limit ?? null
      const active = await countActiveStaffForSchool(Number(id))
      return NextResponse.json({ ...row, staff_limit: limit, active_staff: active, seats_over: seatsOver(active, limit) })
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
      const { tier, confirm_over_limit } = await req.json()
      if (!['none', 'basic', 'standard', 'premium'].includes(tier)) {
        return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
      }

      // What would this change do to the school's staff? A school on Standard with 5 active
      // accounts moved to Basic (limit 2) ends up 3 over. That is allowed — nobody is ever
      // switched off automatically — but the platform admin must see the numbers and confirm,
      // because from then on the school can't add or reactivate anyone until it deactivates
      // enough accounts or upgrades again.
      const { rows: [cur] } = await pool.query(`SELECT tier FROM school_subscriptions WHERE school_id = $1`, [schoolId])
      const fromTier: string = cur?.tier ?? 'none'
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

      // Every plan change is recorded with who made it and what it did to the seats.
      await pool.query(
        `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
         VALUES ($1, (SELECT email FROM users WHERE id = $1), 'update_subscription', 'subscription', $2, $3, $4)`,
        [session.userId, schoolId, school?.name ?? null,
         JSON.stringify({ from: fromTier, to: tier, staff_limit: newLimit, active_staff: active, over_by: over, confirmed_over_limit: over > 0 })]
      ).catch(err => console.error('[audit/subscription]', err))

      // The school's own administrators are told what happened and what to do — they would
      // otherwise only find out when an Add or Reactivate is refused.
      if (tier !== fromTier && over > 0 && newLimit !== null) {
        void notifySeatOverage(schoolId, { schoolName: school?.name ?? 'Your school', tier, limit: newLimit, active })
      }

      if (tier !== 'none') {
        const startDate = new Date()
        const endDate = new Date()
        endDate.setFullYear(endDate.getFullYear() + 1)
        await pool.query(
          `UPDATE schools SET plan_start_date = $1, plan_end_date = $2 WHERE id = $3`,
          [startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10), schoolId]
        )
        if (school?.email && school?.school_code) {
          const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
          sendPlanActivationEmail({
            to: school.email, schoolName: school.name, schoolCode: school.school_code,
            tier, startDate: fmt(startDate), endDate: fmt(endDate),
          }).catch(err => console.error('[email/plan]', err))
        }
      }

      return NextResponse.json({ ...result.rows[0], seats: { limit: newLimit, active, over } })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
