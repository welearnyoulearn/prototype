import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateResetToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'

export async function POST(req: NextRequest) {
  try {
    // Accepts either email or phone in one field, matching the login route
    // (§01) — a parent who signs in with their phone number needs a way to
    // trigger a reset too, not just parents who use email.
    const body = await req.json()
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : (typeof body.email === 'string' ? body.email.trim() : '')
    if (!identifier) return NextResponse.json({ success: true })

    const result = await pool.query(
      `SELECT id, school_id, name, email, phone FROM parents
       WHERE password_hash IS NOT NULL AND (LOWER(email) = LOWER($1) OR phone = $1)`,
      [identifier]
    )
    if (result.rows.length === 0) return NextResponse.json({ success: true })
    // Same-school duplicate merge as login (§01) is a DB-level impossibility
    // now (idx_parents_school_phone_unique + the global email unique index),
    // so at most one row can match here in practice — but if more than one
    // somehow does, notify every match rather than silently picking one.
    const parents = result.rows

    const resetUrl = (token: string) => `${process.env.APP_URL || 'http://localhost:3000'}/parent/reset-password?token=${token}`

    for (const parent of parents) {
      const token = generateResetToken()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
      await pool.query(
        `INSERT INTO password_reset_tokens (token, expires_at, role, reference_id) VALUES ($1, $2, 'parent', $3)`,
        [token, expiresAt, parent.id]
      )
      const url = resetUrl(token)
      const name = parent.name || identifier
      if (parent.email) {
        sendPasswordResetEmail({ to: parent.email, name, resetUrl: url, role: 'parent' }).catch(console.error)
      }
      if (parent.phone) {
        sendWhatsappMessage({
          schoolId: parent.school_id, to: parent.phone, templateName: 'password_reset', recipientName: name,
          templateParams: { name, reset_url: url },
        }).catch(console.error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[parent/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
