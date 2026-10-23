import type { PoolClient } from 'pg'
import pool from './db'
import { generateResetToken, hashResetToken } from './auth'

export type ResetRole = 'user' | 'teacher' | 'student' | 'parent'

export function resetTokenValues(rawToken: string): [string, string] {
  return [hashResetToken(rawToken), rawToken]
}

export async function issueResetToken(role: ResetRole, actorId: number): Promise<string> {
  const rawToken = generateResetToken()
  const digest = hashResetToken(rawToken)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`password-reset:${role}:${actorId}`])
    if (role === 'user') {
      await client.query(`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [actorId])
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [actorId, digest],
      )
    } else {
      await client.query(
        `UPDATE password_reset_tokens SET used = TRUE WHERE role = $1 AND reference_id = $2 AND used = FALSE`,
        [role, actorId],
      )
      await client.query(
        `INSERT INTO password_reset_tokens (token, expires_at, role, reference_id)
         VALUES ($1, NOW() + INTERVAL '1 hour', $2, $3)`,
        [digest, role, actorId],
      )
    }
    await client.query('COMMIT')
    return rawToken
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function lockResetToken(client: PoolClient, rawToken: string, role: ResetRole) {
  const [digest, legacyPlaintext] = resetTokenValues(rawToken)
  if (role === 'user') {
    const result = await client.query(
      `SELECT t.* FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE (t.token = $1 OR t.token = $2) AND t.used = FALSE AND t.expires_at > NOW()
         AND COALESCE(u.status, 'active') = 'active'
       FOR UPDATE OF t`,
      [digest, legacyPlaintext],
    )
    return result.rows[0] ?? null
  }
  const table = role === 'teacher' ? 'teachers' : role === 'student' ? 'students' : 'parents'
  const activeClause = role === 'teacher'
    ? `AND a.status = 'active' AND a.removed_at IS NULL`
    : role === 'student' ? `AND a.status = 'active'` : ''
  const result = await client.query(
    `SELECT t.* FROM password_reset_tokens t
     JOIN ${table} a ON a.id = t.reference_id
     WHERE (t.token = $1 OR t.token = $2) AND t.role = $3 AND t.used = FALSE AND t.expires_at > NOW()
       ${activeClause}
     FOR UPDATE OF t`,
    [digest, legacyPlaintext, role],
  )
  return result.rows[0] ?? null
}

export async function invalidateActorResetTokens(client: PoolClient, role: ResetRole, actorId: number): Promise<void> {
  if (role === 'user') {
    await client.query(`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [actorId])
  } else {
    await client.query(
      `UPDATE password_reset_tokens SET used = TRUE WHERE role = $1 AND reference_id = $2 AND used = FALSE`,
      [role, actorId],
    )
  }
}

export async function isResetTokenValid(rawToken: string, role: ResetRole): Promise<boolean> {
  const [digest, legacyPlaintext] = resetTokenValues(rawToken)
  if (role === 'user') {
    const result = await pool.query(
      `SELECT 1 FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
       WHERE (t.token = $1 OR t.token = $2) AND t.used = FALSE AND t.expires_at > NOW()
         AND COALESCE(u.status, 'active') = 'active'`,
      [digest, legacyPlaintext],
    )
    return result.rows.length > 0
  }
  const table = role === 'teacher' ? 'teachers' : role === 'student' ? 'students' : 'parents'
  const activeClause = role === 'teacher'
    ? `AND a.status = 'active' AND a.removed_at IS NULL`
    : role === 'student' ? `AND a.status = 'active'` : ''
  const result = await pool.query(
    `SELECT 1 FROM password_reset_tokens t JOIN ${table} a ON a.id = t.reference_id
     WHERE (t.token = $1 OR t.token = $2) AND t.role = $3 AND t.used = FALSE AND t.expires_at > NOW()
       ${activeClause}`,
    [digest, legacyPlaintext, role],
  )
  return result.rows.length > 0
}
