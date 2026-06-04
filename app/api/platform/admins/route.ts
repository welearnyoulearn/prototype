import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, hashPassword, generateTempPassword } from '@/lib/auth'
import { sendMail } from '@/lib/email'

async function requirePlatformAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'platform_admin') return null
  return session
}

// GET — list all platform admins
export async function GET() {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await pool.query(
    `SELECT id, full_name, email, status, created_at
     FROM users WHERE role = 'platform_admin' ORDER BY created_at ASC`
  )
  return NextResponse.json(result.rows)
}

// POST — create a new platform admin
export async function POST(req: NextRequest) {
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

    const tempPassword = generateTempPassword(12)
    const passwordHash = await hashPassword(tempPassword)

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, first_login, profile_completed, status)
       VALUES ($1, $2, $3, 'platform_admin', TRUE, FALSE, 'active') RETURNING id, full_name, email, created_at`,
      [full_name.trim(), email.trim().toLowerCase(), passwordHash]
    )

    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    sendMail(
      email.trim(),
      'Your WLYL Platform Admin Access',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#7c3aed">Welcome to WLYL Platform Admin</h2>
        <p>Hi <strong>${full_name}</strong>,</p>
        <p>You've been added as a Platform Administrator by ${session.role}.</p>
        <div style="background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:10px;padding:18px;margin:20px 0">
          <p style="margin:0 0 8px;font-size:13px;color:#6d28d9;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Login Credentials</p>
          <p style="margin:4px 0;font-size:13px"><strong>URL:</strong> <a href="${appUrl}/login?role=platform">${appUrl}/login?role=platform</a></p>
          <p style="margin:4px 0;font-size:13px"><strong>Email:</strong> ${email.trim().toLowerCase()}</p>
          <p style="margin:4px 0;font-size:13px"><strong>Password:</strong> <code style="background:#ede9fe;padding:2px 6px;border-radius:4px">${tempPassword}</code></p>
        </div>
        <p style="color:#dc2626;font-size:13px">⚠ Please change your password after first login.</p>
        <a href="${appUrl}/login?role=platform" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px">Login Now</a>
      </div>`
    ).catch(console.error)

    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('[platform/admins POST]', error)
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 })
  }
}
