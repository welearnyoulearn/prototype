import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { issueResetToken } from '@/lib/passwordReset'
import { forgotPasswordResponse, startForgotPassword } from '@/lib/forgotPassword'
import { maskEmail } from '@/lib/maskContact'

interface TeacherRow { id: number; school_id: number; name: string; email: string | null; phone: string | null }

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const start = await startForgotPassword(req, 'teacher-recovery')
    if ('response' in start) return start.response

    // Teacher login is email-only, so recovery is too.
    const result = await pool.query<TeacherRow>(
      `SELECT t.id, t.school_id, t.name, t.email, t.phone FROM teachers t
       WHERE LOWER(t.email) = LOWER($1) AND t.removed_at IS NULL LIMIT 1`,
      [start.identifier],
    )
    if (result.rows.length === 0) return forgotPasswordResponse({ status: 'not_found' })

    const teacher = result.rows[0]
    if (!teacher.email) return forgotPasswordResponse({ status: 'no_contact' })

    const token = await issueResetToken('teacher', teacher.id)
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/reset-password?token=${token}`
    sendPasswordResetEmail({ to: teacher.email, name: teacher.name, resetUrl, role: 'teacher', schoolId: teacher.school_id }).catch(console.error)
    // WhatsApp is a second channel when a phone is on file (scaffold: queued until live).
    if (teacher.phone) {
      sendWhatsappMessage({
        schoolId: teacher.school_id, to: teacher.phone, templateName: 'password_reset', recipientName: teacher.name,
        templateParams: { name: teacher.name, reset_url: resetUrl },
      }).catch(console.error)
    }
    return forgotPasswordResponse({ status: 'sent', sentTo: [maskEmail(teacher.email)] })
  } catch (error) {
    console.error('[teacher/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
