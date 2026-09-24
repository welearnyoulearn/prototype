// Direct DB access for specs that must observe or age server state the API deliberately
// doesn't expose — e.g. the one-time invite token that is only ever emailed, or a
// session's idle clock. Uses the same env vars as the app (PGHOST/… or DATABASE_URL).
import { Pool } from 'pg'

let pool: Pool | null = null

function loadEnv() {
  try { process.loadEnvFile('.env') } catch { /* no .env — rely on the environment */ }
}

export function dbAvailable(): boolean {
  loadEnv()
  return !!(process.env.DATABASE_URL || process.env.PGHOST)
}

export function db(): Pool {
  if (!pool) {
    loadEnv()
    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } })
      : new Pool({ max: 1, ssl: { rejectUnauthorized: false } })
  }
  return pool
}

export async function closeDb() {
  await pool?.end()
  pool = null
}

/** The newest unused set-password token for an email (what the invite email links to). */
export async function latestInviteToken(email: string): Promise<{ token: string; hoursLeft: number }> {
  const { rows } = await db().query(
    `SELECT t.token, EXTRACT(EPOCH FROM (t.expires_at - NOW())) / 3600 AS hours_left
     FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
     WHERE LOWER(u.email) = LOWER($1) AND t.used = FALSE
     ORDER BY t.id DESC LIMIT 1`,
    [email]
  )
  if (!rows[0]) throw new Error(`No unused invite token for ${email}`)
  return { token: rows[0].token, hoursLeft: Number(rows[0].hours_left) }
}

/** Pretend the user's last activity was `minutes` ago (to exercise the idle timeout). */
export async function ageSessions(email: string, minutes: number) {
  await db().query(
    `UPDATE user_sessions SET last_seen_at = NOW() - make_interval(mins => $2)
     WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE LOWER(email) = LOWER($1))`,
    [email, minutes]
  )
}

/** Minutes since the user's most recently active session was last seen. */
export async function minutesSinceSeen(email: string): Promise<number> {
  const { rows } = await db().query(
    `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(last_seen_at))) / 60 AS mins
     FROM user_sessions
     WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE LOWER(email) = LOWER($1))`,
    [email]
  )
  return Number(rows[0]?.mins)
}
