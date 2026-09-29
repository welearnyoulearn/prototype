import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import {
  verifyPassword, JWTPayload, setAuthCookie, setPlatformAuthCookie,
  createStaffSession, getSessionIdFromCookie, revokeSession,
} from '@/lib/auth'
import { recordSessionStart } from '@/lib/usageTracking'

export async function POST(req: NextRequest) {

  try {
    await ensureDB()
    const { email, password } = await req.json()
    if (typeof email !== 'string' || !email.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Every school-portal user (school admin, principal, VP) and platform admin logs in
    // with their own email — the School ID is no longer a credential, so every action
    // is attributable to one person.
    const result = await pool.query(
      `SELECT u.*, COALESCE(up.full_name, u.full_name) AS display_name
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE LOWER(u.email) = $1
       LIMIT 1`,
      [normalizedEmail]
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

    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'This account has been deactivated. Contact your school administrator.' }, { status: 403 })
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

    // Platform Admin gets its own cookie so logging into School Admin in the
    // same browser can't silently overwrite/invalidate the Platform Admin session.
    if (user.role === 'platform_admin') {
      await setPlatformAuthCookie(payload)
    } else {
      // One school-staff session per browser: logging in as someone else ends the
      // previous person's session on the server, not just in the cookie.
      const previousSid = await getSessionIdFromCookie()
      if (previousSid) await revokeSession(previousSid).catch(() => {})
      payload.sid = await createStaffSession(user.id)
      await setAuthCookie(payload)
    }

    const usageSessionId = await recordSessionStart({
      schoolId: user.school_id ?? null,
      actorId: user.id,
      actorRole: user.role,
      actorName: user.display_name || user.email,
    })

    return NextResponse.json({
      success: true,
      role: user.role,
      firstLogin: user.first_login,
      profileCompleted: user.profile_completed,
      schoolId: user.school_id,
      usageSessionId,
      // Shown on the login page as the "last used" account next time.
      account: { name: user.display_name || user.email, email: user.email, role: user.role },
    })
  } catch (error) {
    console.error('[auth/login]', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
