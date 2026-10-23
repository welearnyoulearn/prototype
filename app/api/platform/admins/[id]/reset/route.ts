import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin, revokeUserSessions } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import { issueResetToken } from '@/lib/passwordReset'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePlatformAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userRes = await pool.query(
      `SELECT id, full_name, email, role FROM users WHERE id = $1 AND role = 'platform_admin'`,
      [id]
    )
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
    }
    const user = userRes.rows[0]

    await pool.query(`UPDATE users SET first_login = TRUE, status = 'active' WHERE id = $1`, [id])
    await revokeUserSessions(user.id)
    const token = await issueResetToken('user', user.id)

    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    let emailSent = false
    let emailError = ''
    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.full_name || 'Platform Administrator',
        resetUrl: `${appUrl}/reset-password?token=${token}`,
      })
      emailSent = true
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err)
      console.error('[platform/admins/reset] Email failed:', emailError)
    }

    return NextResponse.json({ success: true, emailSent, emailError, email: user.email, name: user.full_name })
  } catch (error) {
    console.error('[platform/admins/reset]', error)
    return NextResponse.json({ error: 'Failed to reset credentials' }, { status: 500 })
  }
}
