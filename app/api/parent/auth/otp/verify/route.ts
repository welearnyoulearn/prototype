import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { generateResetToken } from '@/lib/auth'
import { normalizePhone, INDIAN_MOBILE_ERROR } from '@/lib/phone'
import { OTP_LENGTH, verifyOtp } from '@/lib/otpCrypto'
import {
  OTP_MAX_ATTEMPTS, OTP_PURPOSE_PARENT_RESET, OTP_RESET_TOKEN_MINUTES, OTP_RESET_TOKEN_ROLE, otpSecret,
} from '@/lib/otp'

const bodySchema = z.object({
  phone: z.string().trim().min(6).max(25),
  code: z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`),
})

type Challenge = { id: string; code_hash: string; parent_ids: number[] }

// POST /api/parent/auth/otp/verify  { phone, code }
// Step 2. A correct code is consumed and traded for a short-lived reset ticket that
// only /api/parent/auth/otp/reset accepts.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    const phone = parsed.success ? normalizePhone(parsed.data.phone) : null
    if (!parsed.success || !phone) {
      return NextResponse.json({ error: parsed.success ? INDIAN_MOBILE_ERROR : parsed.error.issues[0].message }, { status: 400 })
    }

    const { rows: [challenge] } = await pool.query<Challenge>(
      `SELECT id, code_hash, parent_ids FROM otp_challenges
       WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, OTP_PURPOSE_PARENT_RESET]
    )
    if (!challenge) {
      return NextResponse.json({ error: 'That code has expired. Please request a new one.', reason: 'expired' }, { status: 400 })
    }

    // Count the attempt BEFORE comparing, atomically, so parallel guesses can't all
    // squeeze in under the limit.
    const { rows: [counted] } = await pool.query<{ attempts: number }>(
      `UPDATE otp_challenges SET attempts = attempts + 1
       WHERE id = $1 AND attempts < $2 RETURNING attempts`,
      [challenge.id, OTP_MAX_ATTEMPTS]
    )
    if (!counted) {
      return NextResponse.json({ error: 'Too many wrong attempts. Please request a new code.', reason: 'locked' }, { status: 400 })
    }

    // A challenge with no parents was never sent, so no code can match it.
    const matches = challenge.parent_ids.length > 0 && verifyOtp(parsed.data.code, phone, otpSecret(), challenge.code_hash)
    if (!matches) {
      const attemptsLeft = OTP_MAX_ATTEMPTS - counted.attempts
      return NextResponse.json({
        error: attemptsLeft > 0
          ? `Incorrect code. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
          : 'Too many wrong attempts. Please request a new code.',
        reason: attemptsLeft > 0 ? 'incorrect' : 'locked',
        attemptsLeft,
      }, { status: 400 })
    }

    // Single use: only one request can flip consumed_at.
    const { rowCount } = await pool.query(
      `UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL`,
      [challenge.id]
    )
    if (!rowCount) {
      return NextResponse.json({ error: 'That code has already been used. Please request a new one.', reason: 'expired' }, { status: 400 })
    }

    const resetToken = generateResetToken()
    await pool.query(
      `INSERT INTO password_reset_tokens (token, expires_at, role, reference_id)
       VALUES ($1, NOW() + make_interval(mins => $2), $3, $4)`,
      [resetToken, OTP_RESET_TOKEN_MINUTES, OTP_RESET_TOKEN_ROLE, challenge.parent_ids[0]]
    )

    return NextResponse.json({ ok: true, resetToken })
  } catch (error) {
    console.error('[parent/otp/verify]', error)
    return NextResponse.json({ error: 'Could not verify the code. Please try again.' }, { status: 500 })
  }
}
