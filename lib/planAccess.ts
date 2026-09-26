import pool from '@/lib/db'
import { planStatus, planExpiryEnforced } from '@/lib/planExpiry'

// Shown wherever a locked school's user is turned away.
export const LOCKED_MESSAGE_PORTAL = "Portal access is paused because your school's plan has ended. Please contact your school."

// Ids of the schools whose plan has expired past grace, i.e. the schools that are locked right
// now. Empty unless PLAN_EXPIRY_ENFORCED=true. proxy.ts (Edge — no database) reads this through
// /api/internal/plan-locked and caches it for a few seconds.
export async function lockedSchoolIds(): Promise<number[]> {
  if (!planExpiryEnforced()) return []
  const { rows } = await pool.query<{ school_id: number; tier: string; plan_end_date: string | null }>(
    `SELECT ss.school_id, ss.tier, sc.plan_end_date::text AS plan_end_date
     FROM school_subscriptions ss JOIN schools sc ON sc.id = ss.school_id
     WHERE ss.tier <> 'none' AND sc.plan_end_date IS NOT NULL AND sc.plan_end_date < CURRENT_DATE - 10`
  )
  return rows.filter(r => planStatus(r.tier, r.plan_end_date).status === 'expired').map(r => r.school_id)
}

// Is this one school locked right now? Used by the teacher / student / parent sign-in routes so
// a locked school's users are told why, instead of getting a session that proxy.ts then refuses.
export async function isSchoolLocked(schoolId: number): Promise<boolean> {
  if (!planExpiryEnforced()) return false
  const { rows: [r] } = await pool.query<{ tier: string | null; plan_end_date: string | null }>(
    `SELECT ss.tier, sc.plan_end_date::text AS plan_end_date
     FROM schools sc LEFT JOIN school_subscriptions ss ON ss.school_id = sc.id WHERE sc.id = $1`, [schoolId])
  return !!r && planStatus(r.tier ?? 'none', r.plan_end_date).status === 'expired'
}
