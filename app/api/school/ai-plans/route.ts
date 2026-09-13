import { NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

// GET /api/school/ai-plans
// Lists school-wide AI Hub plans (scope='school') plus this school's current
// subscription, so the admin screen can render plan cards with a "current
// plan" state. school_id always comes from the session, never the client.
export async function GET() {
  try {
    await ensureDB()
    const session = await requireSchoolAdmin()
    if (!session || !session.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const plansRes = await pool.query(
      `SELECT id, name, students_included, queries_per_student_per_day, price
       FROM ai_plans WHERE scope = 'school' ORDER BY price ASC`
    )
    const subRes = await pool.query(
      `SELECT sas.ai_plan_id, sas.active, sas.students_licensed, sas.start_date
       FROM school_ai_subscriptions sas
       WHERE sas.school_id = $1`,
      [session.schoolId]
    )

    return NextResponse.json({
      plans: plansRes.rows,
      currentSubscription: subRes.rows[0] ?? null,
    })
  } catch (err: unknown) {
    console.error('[API] /api/school/ai-plans', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
