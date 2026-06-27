import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { sendPlanActivationEmail } from '@/lib/email'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      const result = await pool.query(
        `SELECT ss.*, pp.staff_limit
         FROM school_subscriptions ss
         LEFT JOIN plan_pricing pp ON pp.tier = ss.tier
         WHERE ss.school_id = $1`,
        [id]
      )
      if (result.rows.length === 0) {
        const pp = await pool.query(`SELECT staff_limit FROM plan_pricing WHERE tier = 'none'`)
        return NextResponse.json({ school_id: parseInt(id), tier: 'none', staff_limit: pp.rows[0]?.staff_limit ?? 1 })
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
    const { id } = await params
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
