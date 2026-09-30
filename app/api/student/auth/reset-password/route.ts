import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, revokePortalSessions, validateNewPassword } from '@/lib/auth'
import { invalidateActorResetTokens, isResetTokenValid, lockResetToken } from '@/lib/passwordReset'
import { checkAuthRateLimit, LOGIN_LIMIT } from '@/lib/authRateLimit'

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json()
    if (!token || !newPassword) return NextResponse.json({ error: 'Token and password required' }, { status: 400 })
    if (!await checkAuthRateLimit(req, 'student-reset', String(token), LOGIN_LIMIT)) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    const policyError = validateNewPassword(newPassword)
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const rec = await lockResetToken(client, token, 'student')
      if (!rec) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 }) }
      const newHash = await hashPassword(newPassword)
      await client.query('UPDATE students SET password_hash = $1, password_changed = TRUE WHERE id = $2', [newHash, rec.reference_id])
      await invalidateActorResetTokens(client, 'student', rec.reference_id)
      await revokePortalSessions('student', rec.reference_id, undefined, client)
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[student/auth/reset-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ valid: false })
    return NextResponse.json({ valid: await isResetTokenValid(token, 'student') })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
