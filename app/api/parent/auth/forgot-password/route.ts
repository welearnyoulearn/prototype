import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { issueResetToken } from '@/lib/passwordReset'
import { classifyIdentifier, forgotPasswordResponse, phoneMatchSql, startForgotPassword } from '@/lib/forgotPassword'
import { maskEmail } from '@/lib/maskContact'

interface ParentRow { id: number; school_id: number; name: string | null; email: string | null; phone: string | null }

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const start = await startForgotPassword(req, 'parent-recovery')
    if ('response' in start) return start.response

    // Email or mobile number, matching the login route (§01).
    const { kind, value } = classifyIdentifier(start.identifier)
    const where = kind === 'phone' ? phoneMatchSql('phone', '$1') : 'LOWER(email) = LOWER($1)'
    const result = await pool.query<ParentRow>(
      `SELECT id, school_id, name, email, phone FROM parents WHERE password_hash IS NOT NULL AND ${where}`, [value],
    )
    if (result.rows.length === 0) return forgotPasswordResponse({ status: 'not_found' })

    // The DB prevents duplicate phone/email matches in practice; if several do
    // match, notify each one that has an email rather than silently picking one.
    // WhatsApp is not live, so a parent with only a phone has no working channel.
    const reachable = result.rows.filter((p): p is ParentRow & { email: string } => Boolean(p.email))
    if (reachable.length === 0) return forgotPasswordResponse({ status: 'no_contact' })

    for (const parent of reachable) {
      const token = await issueResetToken('parent', parent.id)
      const url = `${process.env.APP_URL || 'http://localhost:3000'}/parent/reset-password?token=${token}`
      const name = parent.name || start.identifier
      sendPasswordResetEmail({ to: parent.email, name, resetUrl: url, role: 'parent', schoolId: parent.school_id }).catch(console.error)
      if (parent.phone) {
        sendWhatsappMessage({
          schoolId: parent.school_id, to: parent.phone, templateName: 'password_reset', recipientName: name,
          templateParams: { name, reset_url: url },
        }).catch(console.error)
      }
    }
    return forgotPasswordResponse({ status: 'sent', sentTo: reachable.map(p => maskEmail(p.email)) })
  } catch (error) {
    console.error('[parent/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
