import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { issueResetToken } from '@/lib/passwordReset'
import { classifyIdentifier, forgotPasswordResponse, phoneMatchSql, startForgotPassword } from '@/lib/forgotPassword'
import { maskEmail } from '@/lib/maskContact'

interface StudentRow { id: number; school_id: number; name: string; email: string | null; phone: string | null }

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const start = await startForgotPassword(req, 'student-recovery')
    if ('response' in start) return start.response

    // One field: Student ID, registered email or mobile number.
    const { kind, value } = classifyIdentifier(start.identifier)
    const where = kind === 'email' ? 'LOWER(email) = LOWER($1)'
      : kind === 'phone' ? phoneMatchSql('phone', '$1')
      : 'LOWER(roll_number) = LOWER($1)'
    const result = await pool.query<StudentRow>(
      `SELECT id, school_id, name, email, phone FROM students WHERE ${where} AND status = 'active'`, [value],
    )
    if (result.rows.length === 0) return forgotPasswordResponse({ status: 'not_found' })
    // Never choose an arbitrary account when legacy data contains a collision.
    if (result.rows.length > 1) return forgotPasswordResponse({ status: 'ambiguous' })

    const student = result.rows[0]
    // WhatsApp delivery is not live yet, so an account with only a phone has no working channel.
    if (!student.email) return forgotPasswordResponse({ status: 'no_contact' })

    const token = await issueResetToken('student', student.id)
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/student/reset-password?token=${token}`
    sendPasswordResetEmail({ to: student.email, name: student.name, resetUrl, role: 'student', schoolId: student.school_id }).catch(console.error)
    if (student.phone) {
      sendWhatsappMessage({
        schoolId: student.school_id, to: student.phone, templateName: 'password_reset', recipientName: student.name,
        templateParams: { name: student.name, reset_url: resetUrl },
      }).catch(console.error)
    }
    return forgotPasswordResponse({ status: 'sent', sentTo: [maskEmail(student.email)] })
  } catch (error) {
    console.error('[student/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
