import type { PoolClient } from 'pg'
import pool from '@/lib/db'
import { sendMail } from '@/lib/email'
import { escapeHtml } from '@/lib/html'
import { effectiveTier } from '@/lib/planExpiry'

// The school-level logins: School Administrator, Principal, Vice Principal.
// (Teachers, students and parents have their own tables and are not "staff seats".)
export const STAFF_ROLES: string[] = ['school_admin', 'principal', 'vice_principal']

// Serialises every seat-changing operation (add, reactivate, deactivate) for one
// school. Without it two requests can both read "1 seat free" and both take it, or
// two admins can deactivate each other at the same moment and leave the school with
// nobody able to sign in. Held until COMMIT/ROLLBACK.
export async function lockStaffSeats(client: PoolClient, schoolId: number): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`staff-seats:${schoolId}`])
}

// Seat limit for the school's current plan, or null for unlimited.
// Must be called BEFORE pool.connect() — on Vercel's max:1 pool a query issued while
// the caller already holds a client waits forever for a connection it is itself holding.
// Only "the staff_limit column does not exist yet" (42703) is treated as no limit; any
// other error propagates, so a database problem can no longer silently allow an add.
export async function getStaffLimit(schoolId: number): Promise<number | null> {
  try {
    // The limit follows the EFFECTIVE tier: an expired plan (enforcement on) is 'none'.
    const { rows: [sub] } = await pool.query<{ tier: string; plan_end_date: string | null }>(
      `SELECT ss.tier, sc.plan_end_date::text AS plan_end_date
       FROM school_subscriptions ss LEFT JOIN schools sc ON sc.id = ss.school_id
       WHERE ss.school_id = $1`,
      [schoolId]
    )
    if (!sub) return null
    return await getPlanLimit(effectiveTier(sub.tier, sub.plan_end_date))
  } catch (e) {
    if ((e as { code?: string }).code === '42703') return null
    throw e
  }
}

export async function countActiveStaff(client: PoolClient, schoolId: number): Promise<number> {
  const { rows: [r] } = await client.query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM users
     WHERE school_id = $1 AND role = ANY($2) AND COALESCE(status, 'active') = 'active'`,
    [schoolId, STAFF_ROLES]
  )
  return r.cnt
}

// ── Plan changes and seats ─────────────────────────────────────────────────────
// A school is "over its limit" when it has more active staff than its plan allows —
// after a downgrade, or after the platform admin lowers a plan's limit. That state is
// allowed and never disables anybody: everyone keeps working, but adding and
// reactivating stay blocked (they need a free seat) until the school deactivates enough
// accounts or moves to a bigger plan. Upgrading frees seats; it never reactivates anyone.

/** How many active staff exceed the limit (0 when there is no limit or nothing exceeds it). */
export function seatsOver(active: number, limit: number | null): number {
  return limit === null ? 0 : Math.max(0, active - limit)
}

/** Seat limit of a plan tier (null = unlimited). Same "column not migrated yet" tolerance as getStaffLimit. */
export async function getPlanLimit(tier: string): Promise<number | null> {
  try {
    const { rows: [r] } = await pool.query<{ staff_limit: number | null }>(
      `SELECT staff_limit FROM plan_pricing WHERE tier = $1`, [tier]
    )
    return r?.staff_limit ?? null
  } catch (e) {
    if ((e as { code?: string }).code === '42703') return null
    throw e
  }
}

/** Active staff accounts of one school (uses the shared pool — call before pool.connect()). */
export async function countActiveStaffForSchool(schoolId: number): Promise<number> {
  const { rows: [r] } = await pool.query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM users
     WHERE school_id = $1 AND role = ANY($2) AND COALESCE(status, 'active') = 'active'`,
    [schoolId, STAFF_ROLES]
  )
  return r.cnt
}

export type OverLimitSchool = { id: number; name: string; active: number }

/** Schools currently on `tier` that have more active staff than `limit`. */
export async function schoolsOverLimit(tier: string, limit: number): Promise<OverLimitSchool[]> {
  const { rows } = await pool.query<OverLimitSchool>(
    `SELECT s.id, s.name, COUNT(u.id)::int AS active
     FROM school_subscriptions ss
     JOIN schools s ON s.id = ss.school_id
     JOIN users u ON u.school_id = s.id AND u.role = ANY($2) AND COALESCE(u.status, 'active') = 'active'
     WHERE ss.tier = $1
     GROUP BY s.id, s.name
     HAVING COUNT(u.id) > $3
     ORDER BY COUNT(u.id) DESC, s.name`,
    [tier, STAFF_ROLES, limit]
  )
  return rows
}

const TIER_LABELS: Record<string, string> = { none: 'No plan', basic: 'Basic', standard: 'Standard', premium: 'Premium' }
export const tierLabel = (tier: string) => TIER_LABELS[tier] ?? tier

/**
 * Tells a school's active administrators that they are over their seat limit and what to
 * do about it. Best effort and fire-and-forget — a mail problem must never fail the plan change.
 */
export async function notifySeatOverage(
  schoolId: number,
  info: { schoolName: string; tier: string; limit: number; active: number },
): Promise<void> {
  try {
    const { rows } = await pool.query<{ email: string }>(
      `SELECT email FROM users
       WHERE school_id = $1 AND role = 'school_admin' AND COALESCE(status, 'active') = 'active' AND email IS NOT NULL`,
      [schoolId]
    )
    const excess = info.active - info.limit
    const html = `<div style="font-family:sans-serif;max-width:520px;padding:24px">
      <h2 style="color:#b45309">Staff account limit</h2>
      <p><strong>${escapeHtml(info.schoolName)}</strong> is now on the <strong>${escapeHtml(tierLabel(info.tier))}</strong> plan,
      which allows <strong>${info.limit}</strong> staff account${info.limit === 1 ? '' : 's'}.
      You currently have <strong>${info.active}</strong> active.</p>
      <p>Nobody has been switched off — everyone can keep working. Until ${excess} account${excess === 1 ? ' is' : 's are'}
      deactivated, or the school moves to a larger plan, you can't add new staff accounts or reactivate deactivated ones.</p>
      <p>Go to <strong>Settings → Staff Accounts</strong> to choose which accounts to deactivate. Deactivated accounts are kept and can be reactivated later when there is room.</p>
    </div>`
    await Promise.all(rows.map(r =>
      sendMail(r.email, `Your ${tierLabel(info.tier)} plan allows ${info.limit} staff accounts`, html)
    ))
  } catch (e) {
    console.error('[staffAccounts] seat overage email failed', e)
  }
}

export type StaffAction = 'created' | 'deactivated' | 'reactivated'

// Who did what to which staff account, and when. Written inside the same transaction
// as the change so the history can never disagree with the account's real state.
export async function logStaffEvent(
  client: PoolClient,
  e: { schoolId: number; userId: number; action: StaffAction; actorUserId: number; detail?: Record<string, unknown> },
): Promise<void> {
  await client.query(
    `INSERT INTO staff_account_events (school_id, user_id, action, actor_user_id, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [e.schoolId, e.userId, e.action, e.actorUserId, JSON.stringify(e.detail ?? {})]
  )
}
