import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { ensureDB } from '@/lib/db'

// POST /api/auth/setup-admin
// Creates the first platform admin if none exists.
// Protected by SETUP_SECRET env var.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { email, password, secret } = await req.json()

    if (secret !== (process.env.SETUP_SECRET || 'wlyl-setup-2024')) {
      return NextResponse.json({ error: 'Invalid setup secret' }, { status: 403 })
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const existing = await pool.query(
      `SELECT id FROM users WHERE role = 'platform_admin' LIMIT 1`
    )
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Platform admin already exists' }, { status: 409 })
    }

    const hash = await hashPassword(password)
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, first_login, profile_completed)
       VALUES ($1, $2, 'platform_admin', FALSE, FALSE) RETURNING id, email, role`,
      [email.toLowerCase(), hash]
    )

    return NextResponse.json({ success: true, user: result.rows[0] }, { status: 201 })
  } catch (error) {
    console.error('[setup-admin]', error)
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 })
  }
}

// GET — check if platform admin exists
export async function GET() {
  try {
    await ensureDB()
    const result = await pool.query(`SELECT id FROM users WHERE role = 'platform_admin' LIMIT 1`)
    return NextResponse.json({ exists: result.rows.length > 0 })
  } catch {
    return NextResponse.json({ exists: false })
  }
}
