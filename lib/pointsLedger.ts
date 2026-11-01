// Points ledger helpers for the Daily Newspaper.
//
// student_points is ONE ledger for every kind of reward: one row per award and the balance is the sum of the
// child's rows. Quiz and doubt points (lib/quizRewards.ts) are rows in the same table, so a child has one balance.
// Newspaper points use their own unique index (uq_student_points_news, created by lib/newspaperSchema.ts) and never
// touch the quiz's.
import type { Pool, PoolClient } from 'pg'
import { NEWS_REF, type NewsAction } from './rewardRules'

type Db = Pick<PoolClient, 'query'>

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

/** The child's balance: the sum of every ledger row. */
export async function getBalance(db: Db, studentId: number, schoolId: number): Promise<number> {
  const { rows } = await db.query<{ balance: number }>(
    'SELECT COALESCE(SUM(points), 0)::int AS balance FROM student_points WHERE student_id = $1 AND school_id = $2',
    [studentId, schoolId],
  )
  return rows[0].balance
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
