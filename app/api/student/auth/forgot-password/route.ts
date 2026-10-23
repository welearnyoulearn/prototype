import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { issueResetToken } from '@/lib/passwordReset'
import { checkAuthRateLimit, RECOVERY_LIMIT } from '@/lib/authRateLimit'

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { rollNumber, email } = await req.json()
    if (!rollNumber && !email) return NextResponse.json({ success: true })
    const recoveryId = String(rollNumber || email)
    if (!await checkAuthRateLimit(req, 'student-recovery', recoveryId, RECOVERY_LIMIT)) return NextResponse.json({ success: true })

    const both = Boolean(rollNumber && email)
    const q = both
      ? `SELECT id, school_id, name, email, phone FROM students
         WHERE LOWER(roll_number) = LOWER($1) AND LOWER(email) = LOWER($2) AND status = 'active'`
      : rollNumber
        ? `SELECT id, school_id, name, email, phone FROM students WHERE LOWER(roll_number) = LOWER($1) AND status = 'active'`
        : `SELECT id, school_id, name, email, phone FROM students WHERE LOWER(email) = LOWER($1) AND status = 'active'`

    const result = await pool.query(q, both ? [rollNumber, email] : [rollNumber || email])
    // Never choose an arbitrary account when legacy data contains a collision.
    // Supplying both system id and registered email safely disambiguates it.
    if (result.rows.length !== 1) return NextResponse.json({ success: true })

    const student = result.rows[0]
    // A reset link is only useful if there's somewhere to send it — but that
    // no longer means "must have email". A student with only a phone on
    // file can still get the link via WhatsApp; only bail if neither exists.
    if (!student.email && !student.phone) return NextResponse.json({ success: true })

    const token = await issueResetToken('student', student.id)

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/student/reset-password?token=${token}`
    if (student.email) {
      sendPasswordResetEmail({ to: student.email, name: student.name, resetUrl, role: 'student', schoolId: student.school_id }).catch(console.error)
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
