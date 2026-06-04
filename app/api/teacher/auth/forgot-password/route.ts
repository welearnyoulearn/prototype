import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateResetToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ success: true }) // prevent enumeration

    const result = await pool.query(
      `SELECT t.id, t.name, t.email FROM teachers t
       WHERE LOWER(t.email) = LOWER($1) AND t.removed_at IS NULL LIMIT 1`,
      [email.trim()]
    )

    if (result.rows.length === 0) return NextResponse.json({ success: true })

    const teacher = result.rows[0]
    const token = generateResetToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await pool.query(
      `INSERT INTO password_reset_tokens (token, expires_at, role, reference_id)
       VALUES ($1, $2, 'teacher', $3)`,
      [token, expiresAt, teacher.id]
    )

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/reset-password?token=${token}`
    await sendPasswordResetEmail({ to: teacher.email, name: teacher.name, resetUrl, role: 'teacher' }).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[teacher/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
