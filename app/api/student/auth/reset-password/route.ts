import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json()
    if (!token || !newPassword) return NextResponse.json({ error: 'Token and password required' }, { status: 400 })
    if (newPassword.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

    const result = await pool.query(
      `SELECT * FROM password_reset_tokens WHERE token = $1 AND role = 'student' AND used = FALSE AND expires_at > NOW()`,
      [token]
    )
    if (result.rows.length === 0) return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })

    const rec = result.rows[0]
    const newHash = await hashPassword(newPassword)
    await pool.query('UPDATE students SET password_hash = $1, password_changed = TRUE WHERE id = $2', [newHash, rec.reference_id])
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [rec.id])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[student/auth/reset-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ valid: false })
  const result = await pool.query(
    `SELECT id FROM password_reset_tokens WHERE token = $1 AND role = 'student' AND used = FALSE AND expires_at > NOW()`,
    [token]
  )
  return NextResponse.json({ valid: result.rows.length > 0 })
}
