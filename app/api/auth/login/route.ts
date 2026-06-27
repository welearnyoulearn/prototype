import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { verifyPassword, signToken, JWTPayload } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {

  try {
    await ensureDB()
    const { identifier, password } = await req.json()
    // identifier = email (platform admin) OR school_code (school admin)
    if (!identifier || !password) {
      return NextResponse.json({ error: 'Identifier and password are required' }, { status: 400 })
    }

    const id = identifier.trim().toLowerCase()

    // Look up user by email or school_code
    const result = await pool.query(
      `SELECT u.*, up.full_name
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE LOWER(u.email) = $1 OR LOWER(u.school_code) = $1
       LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const user = result.rows[0]

    // This endpoint is for school portal only — reject other roles
    const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal', 'platform_admin']
    if (!SCHOOL_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Track last login timestamp
    pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {})

    const payload: JWTPayload = {
      userId: user.id,
      role: user.role,
      schoolId: user.school_id,
      schoolCode: user.school_code,
      firstLogin: user.first_login,
      profileCompleted: user.profile_completed,
    }

    const token = signToken(payload)
    const cookieStore = await cookies()
    cookieStore.set('wlyl-auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return NextResponse.json({
      success: true,
      role: user.role,
      firstLogin: user.first_login,
      profileCompleted: user.profile_completed,
      schoolId: user.school_id,
    })
  } catch (error) {
    console.error('[auth/login]', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
