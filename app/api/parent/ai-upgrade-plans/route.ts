import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getParentSession } from '@/lib/auth'

// GET /api/parent/ai-upgrade-plans?student_id=...
// Lists per-student upgrade plans (scope='student') for a parent's linked
// child — ONLY if that child's school has an active AI plan (a school must
// opt in before individual upgrades make sense). Same ownership check as
// doubt-digest: student_id must belong to the authenticated parent's session,
// never trusted on its own.
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const session = await getParentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const studentIdParam = req.nextUrl.searchParams.get('student_id')
    if (!studentIdParam) return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
    const studentId = Number(studentIdParam)

    const linkRes = await pool.query(
      `SELECT s.id, s.school_id FROM student_parents sp
       JOIN students s ON s.id = sp.student_id
       WHERE sp.parent_id = $1 AND sp.student_id = $2`,
      [session.parentId, studentId]
    )
    if (linkRes.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 403 })
    const schoolId = linkRes.rows[0].school_id

    const schoolPlanRes = await pool.query(
      `SELECT 1 FROM school_ai_subscriptions WHERE school_id = $1 AND active = TRUE`,
      [schoolId]
    )
    if (schoolPlanRes.rows.length === 0) {
      return NextResponse.json({ plans: [], schoolHasActivePlan: false, currentSubscription: null })
    }

    const plansRes = await pool.query(
      `SELECT id, name, queries_per_student_per_day, price
       FROM ai_plans WHERE scope = 'student' ORDER BY price ASC`
    )
    const currentRes = await pool.query(
      `SELECT tier, plan_id, active, daily_query_limit_override FROM student_subscriptions WHERE student_id = $1`,
      [studentId]
    )

    return NextResponse.json({
      plans: plansRes.rows,
      schoolHasActivePlan: true,
      currentSubscription: currentRes.rows[0] ?? null,
    })
  } catch (err: unknown) {
    console.error('[API] /api/parent/ai-upgrade-plans', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
