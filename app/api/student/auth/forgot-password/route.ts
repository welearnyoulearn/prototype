import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateResetToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'

export async function POST(req: NextRequest) {
  try {
    const { rollNumber, email } = await req.json()
    if (!rollNumber && !email) return NextResponse.json({ success: true })

    const q = rollNumber
      ? `SELECT id, school_id, name, email, phone FROM students WHERE LOWER(roll_number) = LOWER($1) AND status = 'active' LIMIT 1`
      : `SELECT id, school_id, name, email, phone FROM students WHERE LOWER(email) = LOWER($1) AND status = 'active' LIMIT 1`

    const result = await pool.query(q, [rollNumber || email])
    if (result.rows.length === 0) return NextResponse.json({ success: true })

    const student = result.rows[0]
    // A reset link is only useful if there's somewhere to send it — but that
    // no longer means "must have email". A student with only a phone on
    // file can still get the link via WhatsApp; only bail if neither exists.
    if (!student.email && !student.phone) return NextResponse.json({ success: true })

    const token = generateResetToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await pool.query(
      `INSERT INTO password_reset_tokens (token, expires_at, role, reference_id) VALUES ($1, $2, 'student', $3)`,
      [token, expiresAt, student.id]
    )

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/student/reset-password?token=${token}`
    if (student.email) {
      sendPasswordResetEmail({ to: student.email, name: student.name, resetUrl, role: 'student' }).catch(console.error)
    }
    if (student.phone) {
      sendWhatsappMessage({
        schoolId: student.school_id, to: student.phone, templateName: 'password_reset', recipientName: student.name,
        templateParams: { name: student.name, reset_url: resetUrl },
      }).catch(console.error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[student/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
