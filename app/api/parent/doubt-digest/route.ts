import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getParentSession } from '@/lib/auth'
import { resolveLimitStatus } from '@/lib/ai/limits'

// GET /api/parent/doubt-digest?student_id=...
//
// AI Hub visibility for parents — chat_logs + screen_time_sessions, scoped
// STRICTLY to this parent's own linked children. student_id is never trusted
// on its own: it must show up in student_parents for the CURRENT SESSION's
// parent_id, or this returns 403 with no data at all. There is deliberately
// no way to query by parent_id from the URL (unlike the stage description's
// literal "/parent/{parent_id}/doubt-digest" path) — the parent is always
// the authenticated session, never a client-supplied id, which is what
// actually prevents cross-account access rather than just checking it.
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const session = await getParentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const studentIdParam = req.nextUrl.searchParams.get('student_id')
    if (!studentIdParam) return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
    const studentId = Number(studentIdParam)

    const linkRes = await pool.query(
      `SELECT s.id, s.name, s.grade, s.school_id
       FROM student_parents sp
       JOIN students s ON s.id = sp.student_id
       WHERE sp.parent_id = $1 AND sp.student_id = $2`,
      [session.parentId, studentId]
    )
    if (linkRes.rows.length === 0) {
      // Deliberately the same shape/status whether the student doesn't
      // exist or just isn't this parent's — never leak which case it is.
      return NextResponse.json({ error: 'Student not found' }, { status: 403 })
    }
    const student = linkRes.rows[0]
    const schoolId = student.school_id as number

    // Last 7 days of activity, for the daily-activity chart.
    const dailyRes = await pool.query(
      `SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
       FROM ai_hub_chat_logs
       WHERE student_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY created_at::date
       ORDER BY created_at::date`,
      [studentId]
    )
    const dailyMap = new Map<string, number>(dailyRes.rows.map((r: { date: string; count: number }) => [r.date, r.count]))
    const weekly: { date: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      weekly.push({ date: key, count: dailyMap.get(key) ?? 0 })
    }
    const weekTotal = weekly.reduce((sum, d) => sum + d.count, 0)

    const subjectRes = await pool.query(
      `SELECT subject, COUNT(*)::int AS count
       FROM ai_hub_chat_logs
       WHERE student_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY subject
       ORDER BY count DESC
       LIMIT 6`,
      [studentId]
    )

    const recentRes = await pool.query(
      `SELECT subject, chapter, question, flagged, created_at
       FROM ai_hub_chat_logs
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [studentId]
    )

    // Screen-time tracking (Stage 1's ai_hub_screen_time_sessions) has no
    // writer wired up yet — this will read as zero until that's built, kept
    // here so the digest picks it up automatically once it is.
    const screenTimeRes = await pool.query(
      `SELECT COALESCE(SUM(duration_minutes), 0)::int AS minutes
       FROM ai_hub_screen_time_sessions
       WHERE student_id = $1 AND date >= CURRENT_DATE - INTERVAL '6 days'`,
      [studentId]
    )

    let usage = { tier: 'free' as 'free' | 'paid', used: 0, limit: 3, blocked: false }
    let schoolHasActivePlan = false
    try {
      usage = await resolveLimitStatus(pool, studentId, schoolId)
      const planRes = await pool.query(
        `SELECT 1 FROM school_ai_subscriptions WHERE school_id = $1 AND active = TRUE`,
        [schoolId]
      )
      schoolHasActivePlan = planRes.rows.length > 0
    } catch (err) {
      console.error('[doubt-digest] usage/plan lookup failed (non-fatal):', err)
    }

    return NextResponse.json({
      student: { id: student.id, name: student.name, grade: student.grade },
      weekly,
      weekTotal,
      subjectBreakdown: subjectRes.rows,
      recentQuestions: recentRes.rows,
      screenTimeMinutes: screenTimeRes.rows[0]?.minutes ?? 0,
      today: { used: usage.used, limit: usage.limit, tier: usage.tier },
      schoolHasActivePlan,
    })
  } catch (err: unknown) {
    console.error('[API] /api/parent/doubt-digest', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
