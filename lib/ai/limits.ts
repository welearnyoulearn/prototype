// Daily query-limit resolution for the AI Hub, shared between /api/student/ask
// (which enforces it) and /api/student/ai-usage (which just reports it for
// the chat UI's usage indicator) — one source of truth for the resolution
// order: per-student override -> school's active AI plan -> platform default.
import type { Pool } from 'pg'

export type LimitStatus = {
  tier: 'free' | 'paid'
  used: number
  limit: number
  blocked: boolean
}

// Ensures a student_subscriptions row exists (creating one with tier='free'
// on first use) and returns today's usage against the effective limit.
// Never throws internally-resolvable errors past this point except genuine
// DB failures — callers that need "fail open" behavior (like /ask) should
// still wrap this in their own try/catch, since a DB outage here is exactly
// the kind of bug that must never lock a student out.
export async function resolveLimitStatus(pool: Pool, studentId: number, schoolId: number): Promise<LimitStatus> {
  let subRow = (await pool.query(
    `INSERT INTO student_subscriptions (student_id, tier, active)
     VALUES ($1, 'free', TRUE)
     ON CONFLICT (student_id) DO NOTHING
     RETURNING tier, daily_query_limit_override`,
    [studentId]
  )).rows[0]
  if (!subRow) {
    subRow = (await pool.query(
      'SELECT tier, daily_query_limit_override FROM student_subscriptions WHERE student_id = $1',
      [studentId]
    )).rows[0]
  }
  const tier: 'free' | 'paid' = subRow?.tier ?? 'free'
  const override: number | null = subRow?.daily_query_limit_override ?? null

  let limit: number
  if (override != null) {
    limit = override
  } else {
    const planRes = await pool.query(
      `SELECT ap.queries_per_student_per_day
       FROM school_ai_subscriptions sas
       JOIN ai_plans ap ON ap.id = sas.ai_plan_id
       WHERE sas.school_id = $1 AND sas.active = TRUE`,
      [schoolId]
    )
    if (planRes.rows.length > 0) {
      limit = planRes.rows[0].queries_per_student_per_day
    } else {
      const cfgRes = await pool.query('SELECT default_free_tier_daily_limit FROM platform_ai_config WHERE id = 1')
      limit = cfgRes.rows[0]?.default_free_tier_daily_limit ?? 3
    }
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ai_hub_chat_logs WHERE student_id = $1 AND created_at::date = CURRENT_DATE`,
    [studentId]
  )
  const used = countRes.rows[0].count as number

  return { tier, used, limit, blocked: used >= limit }
}
