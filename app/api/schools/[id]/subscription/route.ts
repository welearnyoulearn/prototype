import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendPlanActivationEmail } from '@/lib/email'
import { requirePlatformAdmin, getSession } from '@/lib/auth'
import { STAFF_ROLES } from '@/lib/staffAccounts'

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
      if (result.rows.length === 0) {
        return NextResponse.json({ school_id: parseInt(id), tier: 'none', staff_limit: null })
      }
      return NextResponse.json(result.rows[0])
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
    if (!(await requirePlatformAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })
    try {
      const { tier } = await req.json()
      if (!['none', 'basic', 'standard', 'premium'].includes(tier)) {
        return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
      }

      const result = await pool.query(
        `INSERT INTO school_subscriptions (school_id, tier, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (school_id) DO UPDATE SET tier = $2, updated_at = NOW()
         RETURNING *`,
        [id, tier]
      )

      if (tier !== 'none') {
        const startDate = new Date()
        const endDate = new Date()
        endDate.setFullYear(endDate.getFullYear() + 1)
        await pool.query(
          `UPDATE schools SET plan_start_date = $1, plan_end_date = $2 WHERE id = $3`,
          [startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10), id]
        )
        const schoolRes = await pool.query('SELECT name, email, school_code FROM schools WHERE id = $1', [id])
        const school = schoolRes.rows[0]
        if (school?.email && school?.school_code) {
          const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
          sendPlanActivationEmail({
            to: school.email, schoolName: school.name, schoolCode: school.school_code,
            tier, startDate: fmt(startDate), endDate: fmt(endDate),
          }).catch(err => console.error('[email/plan]', err))
        }
      }

      return NextResponse.json(result.rows[0])
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
