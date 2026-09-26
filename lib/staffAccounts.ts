import type { PoolClient } from 'pg'
import pool from '@/lib/db'

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
    const { rows: [sub] } = await pool.query<{ staff_limit: number | null }>(
      `SELECT pp.staff_limit
       FROM school_subscriptions ss
       LEFT JOIN plan_pricing pp ON pp.tier = ss.tier
       WHERE ss.school_id = $1`,
      [schoolId]
    )
    return sub?.staff_limit ?? null
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
