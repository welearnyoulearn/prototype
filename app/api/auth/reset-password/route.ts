import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, revokeUserSessions, validateNewPassword } from '@/lib/auth'
import { invalidateActorResetTokens, isResetTokenValid, lockResetToken } from '@/lib/passwordReset'
import { checkAuthRateLimit, LOGIN_LIMIT } from '@/lib/authRateLimit'

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json()
    if (!token || !newPassword) return NextResponse.json({ error: 'Token and new password required' }, { status: 400 })
    if (!await checkAuthRateLimit(req, 'staff-reset', String(token), LOGIN_LIMIT)) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    const policyError = validateNewPassword(newPassword)
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const resetRecord = await lockResetToken(client, token, 'user')
      if (!resetRecord) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
      }
      const newHash = await hashPassword(newPassword)
      await client.query('UPDATE users SET password_hash = $1, first_login = FALSE WHERE id = $2', [newHash, resetRecord.user_id])
      await invalidateActorResetTokens(client, 'user', resetRecord.user_id)
      await revokeUserSessions(resetRecord.user_id, undefined, client)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[auth/reset-password]', error)
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
  }
}

// GET — validate token before showing reset form
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ valid: false })

    return NextResponse.json({ valid: await isResetTokenValid(token, 'user') })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
