import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateResetToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { identifier } = await req.json()
    if (!identifier) return NextResponse.json({ error: 'Email or School ID required' }, { status: 400 })

    const id = identifier.trim().toLowerCase()
    const result = await pool.query(
      `SELECT u.id, u.email, up.full_name, s.name AS school_name
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE LOWER(u.email) = $1 OR LOWER(u.school_code) = $1`,
      [id]
    )

    // Always return success to prevent user enumeration
    if (result.rows.length === 0) return NextResponse.json({ success: true })

    const user = result.rows[0]
    const token = generateResetToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [user.id, token, expiresAt]
    )

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`
    const name = user.full_name || user.school_name || 'User'
    const emailTo = user.email

    if (emailTo) {
      await sendPasswordResetEmail({ to: emailTo, name, resetUrl }).catch(console.error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
