// Direct DB access for the parent OTP spec: the code is stored only as an HMAC hash (by
// design it can't be read back), so the spec plants a KNOWN code by writing the hash
// itself, using the very same functions the API uses. Also seeds a parent row and ages
// challenges to step around the resend cooldown.
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import { hashOtp } from '../../lib/otpCrypto'

let pool: Pool | null = null

function loadEnv() {
  try { process.loadEnvFile('.env') } catch { /* no .env — rely on the environment */ }
}

export function dbAvailable(): boolean {
  loadEnv()
  return !!(process.env.DATABASE_URL || process.env.PGHOST)
}

function db(): Pool {
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

// Same resolution as lib/otp.ts otpSecret(): OTP_SECRET, else JWT_SECRET (with the dev fallback).
export function otpSecretForTests(): string {
  loadEnv()
  return process.env.OTP_SECRET || process.env.JWT_SECRET || 'wlyl-dev-only-secret-not-for-production'
}

export async function enableParentPortal(schoolId: number) {
  await db().query(
    `INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES ($1, 'parent-portal', TRUE)
     ON CONFLICT (school_id, feature_key) DO UPDATE SET enabled = TRUE`,
    [schoolId]
  )
}

/** A parent whose phone is stored in a deliberately messy legacy format. */
export async function seedParent(schoolId: number, storedPhone: string, password: string): Promise<number> {
  const hash = await bcrypt.hash(password, 10)
  const { rows: [row] } = await db().query(
    `INSERT INTO parents (school_id, name, email, phone, password_hash, password_changed)
     VALUES ($1, 'OTP Test Parent', NULL, $2, $3, TRUE) RETURNING id`,
    [schoolId, storedPhone, hash]
  )
  return row.id
}

/** Replace the newest live challenge's code with a known one. `phone` is canonical (919876543210). */
export async function plantCode(phone: string, code: string) {
  const { rowCount } = await db().query(
    `UPDATE otp_challenges SET code_hash = $3
     WHERE id = (SELECT id FROM otp_challenges WHERE phone = $1 AND purpose = 'parent_password_reset'
                 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1)`,
    [phone, 'unused', hashOtp(code, phone, otpSecretForTests())]
  )
  if (!rowCount) throw new Error(`No challenge to plant a code into for ${phone}`)
}

/** Move a phone's challenges back in time — past the 30 s cooldown, the 1 h window, or their 5 min life. */
export async function ageChallenges(phone: string, seconds: number) {
  await db().query(
    `UPDATE otp_challenges SET created_at = created_at - make_interval(secs => $2),
                              expires_at = expires_at - make_interval(secs => $2)
     WHERE phone = $1`,
    [phone, seconds]
  )
}

export async function challengeCount(phone: string): Promise<number> {
  const { rows: [r] } = await db().query(`SELECT COUNT(*)::int AS n FROM otp_challenges WHERE phone = $1`, [phone])
  return r.n
}

export async function latestChallenge(phone: string) {
  const { rows: [r] } = await db().query(
    `SELECT parent_ids, attempts, consumed_at, code_hash FROM otp_challenges WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`,
    [phone]
  )
  return r as { parent_ids: number[]; attempts: number; consumed_at: string | null; code_hash: string } | undefined
}

export async function cleanup(phone: string) {
  await db().query(`DELETE FROM otp_challenges WHERE phone = $1`, [phone])
}
