import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { issueResetToken } from '@/lib/passwordReset'
import { checkAuthRateLimit, RECOVERY_LIMIT } from '@/lib/authRateLimit'

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { email } = await req.json()
    if (!email) return NextResponse.json({ success: true }) // prevent enumeration
    if (!await checkAuthRateLimit(req, 'teacher-recovery', String(email), RECOVERY_LIMIT)) return NextResponse.json({ success: true })

    const result = await pool.query(
      `SELECT t.id, t.school_id, t.name, t.email, t.phone FROM teachers t
       WHERE LOWER(t.email) = LOWER($1) AND t.removed_at IS NULL LIMIT 1`,
      [email.trim()]
    )

    if (result.rows.length === 0) return NextResponse.json({ success: true })

    const teacher = result.rows[0]
    const token = await issueResetToken('teacher', teacher.id)

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/reset-password?token=${token}`
    sendPasswordResetEmail({ to: teacher.email, name: teacher.name, resetUrl, role: 'teacher', schoolId: teacher.school_id }).catch(console.error)
    // Login stays email-only (lookup above), but WhatsApp is still a useful
    // second channel for actually receiving the link if their inbox is
    // slow/unchecked — same reasoning as student/parent onboarding delivery.
    if (teacher.phone) {
      sendWhatsappMessage({
        schoolId: teacher.school_id, to: teacher.phone, templateName: 'password_reset', recipientName: teacher.name,
        templateParams: { name: teacher.name, reset_url: resetUrl },
      }).catch(console.error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[teacher/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
