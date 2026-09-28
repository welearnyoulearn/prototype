import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin, hashPassword, generateTempPassword } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import { issueResetToken } from '@/lib/passwordReset'

// GET — list all platform admins
export async function GET() {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await pool.query(
      `SELECT id, full_name, email, status, created_at
       FROM users WHERE role = 'platform_admin' ORDER BY created_at ASC`
    )
    return NextResponse.json(result.rows)
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — create a new platform admin
export async function POST(req: NextRequest) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const { full_name, email } = await req.json()
      if (!full_name?.trim() || !email?.trim()) {
        return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
      }

      const existing = await pool.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]
      )
      if (existing.rows.length > 0) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
      }

      // Store an unknown bootstrap secret; the administrator receives only a
      // one-time set-password link, never a reusable plaintext password.
      const passwordHash = await hashPassword(generateTempPassword(32))

      const result = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role, first_login, profile_completed, status)
         VALUES ($1, $2, $3, 'platform_admin', TRUE, FALSE, 'active') RETURNING id, full_name, email, created_at`,
        [full_name.trim(), email.trim().toLowerCase(), passwordHash]
      )

      const token = await issueResetToken('user', result.rows[0].id)
      const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`
      sendPasswordResetEmail({ to: email.trim(), name: full_name.trim(), resetUrl }).catch(console.error)

      return NextResponse.json(result.rows[0], { status: 201 })
    } catch (error) {
      console.error('[platform/admins POST]', error)
      return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
