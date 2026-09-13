import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getParentSession } from '@/lib/auth'

// POST /api/parent/ai-upgrade
// body: { student_id, plan_id }
//
// Upgrades a parent's own linked child to a paid AI Hub plan. NO real
// payment processing yet — activates the subscription record directly.
//
// TODO(real payments): before setting tier='paid'/active=true, this is
// where a real checkout/payment confirmation would go. For now activation
// is immediate on submit.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const session = await getParentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { student_id, plan_id } = await req.json()
    if (!student_id || !plan_id) return NextResponse.json({ error: 'student_id and plan_id are required' }, { status: 400 })

    const linkRes = await pool.query(
      `SELECT s.id, s.school_id FROM student_parents sp
       JOIN students s ON s.id = sp.student_id
       WHERE sp.parent_id = $1 AND sp.student_id = $2`,
      [session.parentId, student_id]
    )
    if (linkRes.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 403 })
    const schoolId = linkRes.rows[0].school_id

    const schoolPlanRes = await pool.query(
      `SELECT 1 FROM school_ai_subscriptions WHERE school_id = $1 AND active = TRUE`,
      [schoolId]
    )
    if (schoolPlanRes.rows.length === 0) {
      return NextResponse.json({ error: "This school doesn't have an active AI plan yet" }, { status: 400 })
    }

    const planRes = await pool.query(
      `SELECT id, queries_per_student_per_day FROM ai_plans WHERE id = $1 AND scope = 'student'`,
      [plan_id]
    )
    if (planRes.rows.length === 0) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    const dailyLimit = planRes.rows[0].queries_per_student_per_day

    const result = await pool.query(
      `INSERT INTO student_subscriptions (student_id, tier, plan_id, active, started_at, daily_query_limit_override)
       VALUES ($1, 'paid', $2, TRUE, NOW(), $3)
       ON CONFLICT (student_id) DO UPDATE SET
         tier = 'paid', plan_id = $2, active = TRUE, started_at = NOW(), daily_query_limit_override = $3
       RETURNING *`,
      [student_id, plan_id, dailyLimit]
    )

    return NextResponse.json({ subscription: result.rows[0] })
  } catch (err: unknown) {
    console.error('[API] /api/parent/ai-upgrade', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
