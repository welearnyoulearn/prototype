// Points ledger helpers for the Daily Newspaper and the Rewards Marketplace.
//
// student_points is ONE ledger for every kind of reward: one row per award, the balance is the sum of the
// child's rows, a marketplace order spends with a negative row and a refund puts it back with a positive row.
// Quiz and doubt points (written by lib/quizRewards.ts on the quiz branch) are rows in the same table, so a
// child has one balance. This file adds its own unique indexes (uq_student_points_news / uq_student_points_market,
// created by lib/newspaperRewardsSchema.ts) and never touches the quiz's index.
//
// Money safety: spending reads the balance and then writes, so two requests at once (a double tap, or a parent
// and the child together) could spend the same points twice. Every spend and refund therefore takes a
// per-child advisory lock that lasts until the transaction ends. The lock only works inside a transaction:
// always call these helpers on a client from withLedgerTransaction().
import type { Pool, PoolClient } from 'pg'
import { MONTHLY_REDEEM_LIMIT, NEWS_REF, ORDER_REF, REDEEM_ACTION, REFUND_ACTION, withinMonthlyLimit, type NewsAction } from './rewardRules'

type Db = Pick<PoolClient, 'query'>

// Namespace for pg_advisory_xact_lock(int, int): (this, student id). Arbitrary but fixed.
const LOCK_NAMESPACE = 7203

/** Run `fn` in one transaction on its own client; commit on success, roll back on any error. */
export async function withLedgerTransaction<T>(pool: Pick<Pool, 'connect'>, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

/** Serialise everything that changes one child's balance until the surrounding transaction ends. */
export async function lockStudentPoints(db: Db, studentId: number): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [LOCK_NAMESPACE, studentId])
}

/** The child's spendable balance: the sum of every ledger row (earnings minus spending). */
export async function getBalance(db: Db, studentId: number, schoolId: number): Promise<number> {
  const { rows } = await db.query<{ balance: number }>(
    'SELECT COALESCE(SUM(points), 0)::int AS balance FROM student_points WHERE student_id = $1 AND school_id = $2',
    [studentId, schoolId],
  )
  return rows[0].balance
}

/**
 * Points' worth the child has ordered in the current IST calendar month, ignoring cancelled and refunded orders.
 * `excludeOrderId` leaves out the order being placed right now (it is already inserted when this is called).
 */
export async function monthlyOrderedPoints(db: Db, studentId: number, excludeOrderId: number): Promise<number> {
  const { rows } = await db.query<{ used: number }>(`
    SELECT COALESCE(SUM(points_cost), 0)::int AS used
    FROM reward_orders
    WHERE student_id = $1 AND id <> $2 AND status NOT IN ('cancelled', 'refunded')
      AND (placed_at AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
      AND (placed_at AT TIME ZONE 'Asia/Kolkata') <  date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 month'
  `, [studentId, excludeOrderId])
  return rows[0].used
}

/**
 * Pay newspaper points once. `reference` is the edition id, so answering and a correct answer are each paid at most
 * once per child per edition however many times this runs. Returns false when that award was already given.
 */
export async function awardNewsPoints(db: Db, studentId: number, schoolId: number, action: NewsAction, points: number, editionId: number): Promise<boolean> {
  if (!Number.isInteger(points) || points <= 0) return false
  const { rowCount } = await db.query(`
    INSERT INTO student_points (student_id, school_id, action_type, points, reference_id, reference_type, points_type)
    VALUES ($1, $2, $3, $4, $5, $6, 'academic')
    ON CONFLICT (student_id, action_type, reference_type, reference_id) WHERE reference_type = '${NEWS_REF}' DO NOTHING
  `, [studentId, schoolId, action, points, editionId, NEWS_REF])
  return (rowCount ?? 0) > 0
}

export type ReserveResult =
  | { ok: true; balance: number }
  | { ok: false; reason: 'insufficient' | 'monthly_limit' | 'already_spent'; balance: number }

/**
 * Hold `points` for an order: one negative ledger row, written only if the child can afford it and stays within
 * the monthly limit. Call inside withLedgerTransaction with the order row already inserted (status 'placed'),
 * so the monthly total can tell this order apart from the earlier ones.
 */
export async function reserveOrderPoints(
  db: Db,
  p: { studentId: number; schoolId: number; orderId: number; points: number; monthlyLimit?: number },
): Promise<ReserveResult> {
  if (!Number.isInteger(p.points) || p.points <= 0) throw new Error('points must be a positive integer')
  await lockStudentPoints(db, p.studentId)

  const balance = await getBalance(db, p.studentId, p.schoolId)
  const { rows: prior } = await db.query(
    'SELECT 1 FROM student_points WHERE student_id = $1 AND action_type = $2 AND reference_type = $3 AND reference_id = $4',
    [p.studentId, REDEEM_ACTION, ORDER_REF, p.orderId],
  )
  if (prior.length > 0) return { ok: false, reason: 'already_spent', balance }
  if (balance < p.points) return { ok: false, reason: 'insufficient', balance }

  const used = await monthlyOrderedPoints(db, p.studentId, p.orderId)
  if (!withinMonthlyLimit(used, p.points, p.monthlyLimit ?? MONTHLY_REDEEM_LIMIT)) return { ok: false, reason: 'monthly_limit', balance }

  const { rowCount } = await db.query(`
    INSERT INTO student_points (student_id, school_id, action_type, points, reference_id, reference_type, points_type)
    VALUES ($1, $2, $3, $4, $5, $6, 'academic')
    ON CONFLICT (student_id, action_type, reference_type, reference_id) WHERE reference_type = '${ORDER_REF}' DO NOTHING
  `, [p.studentId, p.schoolId, REDEEM_ACTION, -p.points, p.orderId, ORDER_REF])
  if ((rowCount ?? 0) === 0) return { ok: false, reason: 'already_spent', balance }
  return { ok: true, balance: balance - p.points }
}

/**
 * Give an order's points back (cancelled, refunded, or could not be delivered): one positive row for exactly the
 * amount that order spent. Returns false when the order never spent points or was already refunded. Call inside
 * withLedgerTransaction.
 */
export async function refundOrderPoints(db: Db, studentId: number, schoolId: number, orderId: number): Promise<boolean> {
  await lockStudentPoints(db, studentId)
  const { rowCount } = await db.query(`
    INSERT INTO student_points (student_id, school_id, action_type, points, reference_id, reference_type, points_type)
    SELECT student_id, school_id, $4, -points, reference_id, reference_type, 'academic'
    FROM student_points
    WHERE student_id = $1 AND school_id = $2 AND action_type = $5 AND reference_type = $6 AND reference_id = $3
    ON CONFLICT (student_id, action_type, reference_type, reference_id) WHERE reference_type = '${ORDER_REF}' DO NOTHING
  `, [studentId, schoolId, orderId, REFUND_ACTION, REDEEM_ACTION, ORDER_REF])
  return (rowCount ?? 0) > 0
}
