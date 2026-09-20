import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import pool from './db'
import { JWT_SECRET } from './auth-constants'
import { schoolHasFeature } from './auth'
import { PARENT_PHONE_LAST10_SQL } from './phone'

// One-time-code challenges for the parent portal's WhatsApp password reset.
// Crypto lives in lib/otpCrypto.ts; this file is the database + policy half.

export const OTP_PURPOSE_PARENT_RESET = 'parent_password_reset'
export const OTP_TTL_MINUTES = 5
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_SECONDS = 30
export const OTP_MAX_SENDS_PER_PHONE_PER_HOUR = 3
export const OTP_MAX_SENDS_PER_IP_PER_HOUR = 10
// Absolute ceiling on real WhatsApp sends per rolling 24 h — every send costs money.
export const OTP_DAILY_SEND_CAP = Number(process.env.OTP_DAILY_CAP) > 0 ? Number(process.env.OTP_DAILY_CAP) : 2000
// How long the reset ticket handed out after a correct code stays valid.
export const OTP_RESET_TOKEN_MINUTES = 10
export const OTP_RESET_TOKEN_ROLE = 'parent_otp'

export function otpSecret(): string {
  return process.env.OTP_SECRET || JWT_SECRET
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return (forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown').slice(0, 64)
}

export type SendLimit = { ok: true } | { ok: false; retryAfter: number; message: string }

// Every request creates a challenge row — for unregistered numbers too, just without a
// send — so these limits behave identically whether or not the number is registered.
export async function checkSendLimits(phone: string, ip: string): Promise<SendLimit> {
  const { rows: [last] } = await pool.query<{ age: number | null }>(
    `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS age
     FROM otp_challenges WHERE phone = $1 AND purpose = $2`,
    [phone, OTP_PURPOSE_PARENT_RESET]
  )
  if (last?.age != null && last.age < OTP_RESEND_COOLDOWN_SECONDS) {
    return { ok: false, retryAfter: OTP_RESEND_COOLDOWN_SECONDS - last.age, message: 'Please wait before requesting another code.' }
  }

  const { rows: [byPhone] } = await pool.query<{ c: number; wait: number | null }>(
    `SELECT COUNT(*)::int AS c,
            CEIL(EXTRACT(EPOCH FROM (MIN(created_at) + INTERVAL '1 hour' - NOW())))::int AS wait
     FROM otp_challenges
     WHERE phone = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [phone, OTP_PURPOSE_PARENT_RESET]
  )
  if (byPhone.c >= OTP_MAX_SENDS_PER_PHONE_PER_HOUR) {
    return { ok: false, retryAfter: Math.max(byPhone.wait ?? 3600, 1), message: 'Too many codes requested for this number. Please try again later.' }
  }

  const { rows: [byIp] } = await pool.query<{ c: number; wait: number | null }>(
    `SELECT COUNT(*)::int AS c,
            CEIL(EXTRACT(EPOCH FROM (MIN(created_at) + INTERVAL '1 hour' - NOW())))::int AS wait
     FROM otp_challenges
     WHERE ip = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [ip, OTP_PURPOSE_PARENT_RESET]
  )
  if (byIp.c >= OTP_MAX_SENDS_PER_IP_PER_HOUR) {
    return { ok: false, retryAfter: Math.max(byIp.wait ?? 3600, 1), message: 'Too many requests. Please try again later.' }
  }

  const { rows: [daily] } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM otp_challenges
     WHERE cardinality(parent_ids) > 0 AND created_at > NOW() - INTERVAL '24 hours'`
  )
  if (daily.c >= OTP_DAILY_SEND_CAP) {
    return { ok: false, retryAfter: 3600, message: 'Codes are temporarily unavailable. Please try again later or contact your school.' }
  }

  return { ok: true }
}

export type EligibleParent = { id: number; school_id: number; name: string | null }

// Parents who own this phone AND can actually sign in (school has the parent portal).
// No point spending a WhatsApp message on an account that could not log in anyway.
export async function eligibleParentsByLast10(last10: string): Promise<EligibleParent[]> {
  const { rows } = await pool.query<{ id: number; school_id: number | null; name: string | null }>(
    `SELECT p.id, p.school_id, p.name
     FROM parents p
     WHERE p.password_hash IS NOT NULL AND ${PARENT_PHONE_LAST10_SQL} = $1
     ORDER BY p.id`,
    [last10]
  )
  const eligible: EligibleParent[] = []
  for (const r of rows) {
    if (r.school_id && await schoolHasFeature(r.school_id, 'parent-portal')) {
      eligible.push({ id: r.id, school_id: r.school_id, name: r.name })
    }
  }
  return eligible
}

export async function createChallenge(params: {
  phone: string; codeHash: string; parentIds: number[]; ip: string
}): Promise<string> {
  const id = randomUUID()
  await pool.query(
    `INSERT INTO otp_challenges (id, purpose, phone, code_hash, parent_ids, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(mins => $7))`,
    [id, OTP_PURPOSE_PARENT_RESET, params.phone, params.codeHash, params.parentIds, params.ip, OTP_TTL_MINUTES]
  )
  return id
}

export async function recordSendResult(challengeId: string, status: 'sent' | 'failed', error?: string): Promise<void> {
  await pool.query(
    `UPDATE otp_challenges SET send_status = $2, send_error = $3 WHERE id = $1`,
    [challengeId, status, error ? error.slice(0, 300) : null]
  )
}
