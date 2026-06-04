import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateResetToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { rollNumber, email } = await req.json()
    if (!rollNumber && !email) return NextResponse.json({ success: true })

    const q = rollNumber
      ? `SELECT id, name, email FROM students WHERE LOWER(roll_number) = LOWER($1) AND status = 'active' LIMIT 1`
      : `SELECT id, name, email FROM students WHERE LOWER(email) = LOWER($1) AND status = 'active' LIMIT 1`

    const result = await pool.query(q, [rollNumber || email])
    if (result.rows.length === 0 || !result.rows[0].email) return NextResponse.json({ success: true })

    const student = result.rows[0]
    const token = generateResetToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await pool.query(
      `INSERT INTO password_reset_tokens (token, expires_at, role, reference_id) VALUES ($1, $2, 'student', $3)`,
      [token, expiresAt, student.id]
    )

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/student/reset-password?token=${token}`
    await sendPasswordResetEmail({ to: student.email, name: student.name, resetUrl, role: 'student' }).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[student/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
