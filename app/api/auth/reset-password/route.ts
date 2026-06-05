import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json()
    if (!token || !newPassword) return NextResponse.json({ error: 'Token and new password required' }, { status: 400 })
    if (newPassword.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const result = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
    }

    const resetRecord = result.rows[0]
    const newHash = await hashPassword(newPassword)

    await pool.query('UPDATE users SET password_hash = $1, first_login = FALSE WHERE id = $2', [newHash, resetRecord.user_id])
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [resetRecord.id])

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

    const result = await pool.query(
      `SELECT id FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    )
    return NextResponse.json({ valid: result.rows.length > 0 })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
