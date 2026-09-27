import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, getTeacherSession, getStudentSession, getParentSession } from '@/lib/auth'
import { planStatus, isLockedStatus, GRACE_DAYS } from '@/lib/planExpiry'
import { STAFF_ROLES } from '@/lib/staffAccounts'

// GET /api/plan/status — the signed-in user's school plan state, for the banner and the
// login reminder shown in every portal. Works for staff, teachers, students and parents.
// `locked` is what the server actually enforces (expired AND PLAN_EXPIRY_ENFORCED), so the
// screens never claim a lock that isn't there. `can_manage` = may ask for a renewal / export data.
// `renewal_requested_at` is set while a renewal request is waiting for the platform admin.
export async function GET() {
  try {
    let schoolId: number | null = null
    let role = ''
    const staff = await getSession({ passive: true })
    if (staff && STAFF_ROLES.includes(staff.role) && staff.schoolId) { schoolId = Number(staff.schoolId); role = staff.role }
    else {
      const t = await getTeacherSession(); const st = t ? null : await getStudentSession(); const p = t || st ? null : await getParentSession()
      const who = t ?? st ?? p
      if (who) { schoolId = Number(who.schoolId); role = who.role }
    }
    if (!schoolId || !role) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { rows: [r] } = await pool.query<{ tier: string | null; plan_end_date: string | null }>(
      `SELECT ss.tier, sc.plan_end_date::text AS plan_end_date
       FROM schools sc LEFT JOIN school_subscriptions ss ON ss.school_id = sc.id WHERE sc.id = $1`, [schoolId])
    const { rows: [req] } = await pool.query<{ created_at: string }>(
      `SELECT created_at FROM plan_renewal_requests WHERE school_id = $1 AND status IN ('open', 'contacted') LIMIT 1`, [schoolId])
    const state = planStatus(r?.tier ?? 'none', r?.plan_end_date ?? null)
    return NextResponse.json({
      role, school_id: schoolId, tier: r?.tier ?? 'none',
      plan_status: state.status, days_left: state.days_left, plan_end_date: r?.plan_end_date ?? null,
      grace_ends: state.grace_ends, grace_days: GRACE_DAYS,
      locked: isLockedStatus(state.status),
      renewal_requested_at: req?.created_at ?? null,
      can_manage: role === 'school_admin' || role === 'principal',
    })
  } catch (err) {
    console.error('[plan/status]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
