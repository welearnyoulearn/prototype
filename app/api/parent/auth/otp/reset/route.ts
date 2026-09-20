import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { phoneLast10, PARENT_PHONE_LAST10_SQL } from '@/lib/phone'
import { OTP_RESET_TOKEN_ROLE } from '@/lib/otp'

// bcrypt only looks at the first 72 bytes, so a longer limit would be misleading.
const bodySchema = z.object({
  token: z.string().min(20).max(100),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
  confirmPassword: z.string(),
}).refine(v => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

// POST /api/parent/auth/otp/reset  { token, newPassword, confirmPassword }
// Step 3. The token comes from /otp/verify; it works once and expires after 10 minutes.
// The phone number proves the person, so every parent account on that number is updated
// (the same person can have children at more than one school).
export async function POST(req: NextRequest) {
  try {
    await ensureDB()

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { token, newPassword } = parsed.data

    // Claim the token first (atomic) so two simultaneous submits can't both win.
    const { rows: [claimed] } = await pool.query<{ reference_id: number }>(
      `UPDATE password_reset_tokens SET used = TRUE
       WHERE token = $1 AND role = $2 AND used = FALSE AND expires_at > NOW()
       RETURNING reference_id`,
      [token, OTP_RESET_TOKEN_ROLE]
    )
    if (!claimed) {
      return NextResponse.json({ error: 'This reset session has expired. Please start again.', reason: 'expired' }, { status: 400 })
    }

    const { rows: [owner] } = await pool.query<{ phone: string | null }>(
      `SELECT phone FROM parents WHERE id = $1`,
      [claimed.reference_id]
    )
    const last10 = owner?.phone ? phoneLast10(owner.phone) : null
    if (!last10) {
      return NextResponse.json({ error: 'This reset session has expired. Please start again.', reason: 'expired' }, { status: 400 })
    }

    const hash = await hashPassword(newPassword)
    const { rows: updated } = await pool.query<{ id: number }>(
      `UPDATE parents p SET password_hash = $1, password_changed = TRUE
       WHERE p.password_hash IS NOT NULL AND ${PARENT_PHONE_LAST10_SQL} = $2
       RETURNING p.id`,
      [hash, last10]
    )

    // Retire anything still outstanding for these parents so an older ticket or
    // emailed link can't be used to undo the change.
    await pool.query(
      `UPDATE password_reset_tokens SET used = TRUE
       WHERE used = FALSE AND role IN ($1, 'parent') AND reference_id = ANY($2)`,
      [OTP_RESET_TOKEN_ROLE, updated.map(r => r.id)]
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[parent/otp/reset]', error)
    return NextResponse.json({ error: 'Could not update your password. Please try again.' }, { status: 500 })
  }
}
