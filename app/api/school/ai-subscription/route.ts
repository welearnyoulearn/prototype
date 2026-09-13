import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

// POST /api/school/ai-subscription
// body: { ai_plan_id, students_licensed? }
//
// Activates an AI Hub plan for the admin's own school. NO real payment
// processing yet (prototype/free-tier phase) — this activates the
// subscription record directly.
//
// TODO(real payments): before marking `active: true`, this is where a real
// checkout/payment confirmation would go (e.g. redirect to a payment
// provider, verify a webhook, THEN activate). For now activation is
// immediate on submit.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const session = await requireSchoolAdmin()
    if (!session || !session.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { ai_plan_id, students_licensed } = await req.json()
    if (!ai_plan_id) return NextResponse.json({ error: 'ai_plan_id is required' }, { status: 400 })

    const planRes = await pool.query(
      `SELECT id, students_included FROM ai_plans WHERE id = $1 AND scope = 'school'`,
      [ai_plan_id]
    )
    if (planRes.rows.length === 0) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    const licensed = students_licensed ?? planRes.rows[0].students_included

    const result = await pool.query(
      `INSERT INTO school_ai_subscriptions (school_id, ai_plan_id, active, students_licensed, start_date)
       VALUES ($1, $2, TRUE, $3, CURRENT_DATE)
       ON CONFLICT (school_id) DO UPDATE SET
         ai_plan_id = $2, active = TRUE, students_licensed = $3, updated_at = NOW()
       RETURNING *`,
      [session.schoolId, ai_plan_id, licensed]
    )

    return NextResponse.json({ subscription: result.rows[0] })
  } catch (err: unknown) {
    console.error('[API] /api/school/ai-subscription', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
