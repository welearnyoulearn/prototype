import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateResetToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ success: true })

    const result = await pool.query(
      `SELECT id, name, email FROM parents WHERE LOWER(email) = LOWER($1) AND password_hash IS NOT NULL LIMIT 1`,
      [email.trim()]
    )
    if (result.rows.length === 0) return NextResponse.json({ success: true })

    const parent = result.rows[0]
    const token = generateResetToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await pool.query(
      `INSERT INTO password_reset_tokens (token, expires_at, role, reference_id) VALUES ($1, $2, 'parent', $3)`,
      [token, expiresAt, parent.id]
    )

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/parent/reset-password?token=${token}`
    await sendPasswordResetEmail({ to: parent.email, name: parent.name || email, resetUrl, role: 'parent' }).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[parent/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
