import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getSession, verifyPassword, hashPassword, signToken } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  await ensureDB()
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  try {
    const { currentPassword, newPassword } = await req.json()
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }

    const result = await pool.query('SELECT password_hash, first_login FROM users WHERE id = $1', [session.userId])
    if (result.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const user = result.rows[0]

    // Use JWT session.firstLogin (server-signed, tamper-proof) to decide if current password is needed.
    // Also accept DB first_login=true as fallback.
    const isFirstLogin = session.firstLogin === true || user.first_login === true
    if (!isFirstLogin) {
      if (!currentPassword) return NextResponse.json({ error: 'Current password required' }, { status: 400 })
      const valid = await verifyPassword(currentPassword, user.password_hash)
      if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    const newHash = await hashPassword(newPassword)
    await pool.query(
      'UPDATE users SET password_hash = $1, first_login = FALSE WHERE id = $2',
      [newHash, session.userId]
    )

    // Re-issue token with firstLogin = false
    const newPayload = { ...session, firstLogin: false }
    const token = signToken(newPayload)
    const cookieStore = await cookies()
    cookieStore.set('wlyl-auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[auth/change-password]', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
