import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { issueResetToken } from '@/lib/passwordReset'
import { forgotPasswordResponse, startForgotPassword } from '@/lib/forgotPassword'
import { maskEmail } from '@/lib/maskContact'

interface StaffRow { id: number; email: string | null; school_id: number | null; full_name: string | null; school_name: string | null }

// Serves both the school admin and platform admin portals.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const start = await startForgotPassword(req, 'staff-recovery')
    if ('response' in start) return start.response

    const id = start.identifier.toLowerCase()
    const result = await pool.query<StaffRow>(
      `SELECT u.id, u.email, u.school_id, up.full_name, s.name AS school_name
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE (LOWER(u.email) = $1 OR LOWER(u.school_code) = $1)
         AND COALESCE(u.status, 'active') <> 'inactive'`,
      [id],
    )
    // Deactivated accounts look the same as unknown ones: no link is issued.
    if (result.rows.length === 0) return forgotPasswordResponse({ status: 'not_found' })

    const user = result.rows[0]
    if (!user.email) return forgotPasswordResponse({ status: 'no_contact' })

    const token = await issueResetToken('user', user.id)
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`
    const name = user.full_name || user.school_name || 'User'
    // Awaited: on Vercel the function is frozen once the response is sent, which dropped the email.
    await sendPasswordResetEmail({ to: user.email, name, resetUrl, schoolId: user.school_id }).catch(console.error)
    return forgotPasswordResponse({ status: 'sent', sentTo: [maskEmail(user.email)] })
  } catch (error) {
    console.error('[auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
