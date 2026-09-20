import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateResetToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    // Email-link reset only. Phone-based resets go through the WhatsApp one-time code
    // flow (/api/parent/auth/otp/*), so this route no longer matches on phone.
    const body = await req.json()
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : (typeof body.email === 'string' ? body.email.trim() : '')
    if (!identifier) return NextResponse.json({ success: true })

    const result = await pool.query(
      `SELECT id, school_id, name, email FROM parents
       WHERE password_hash IS NOT NULL AND LOWER(email) = LOWER($1)`,
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
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[parent/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
