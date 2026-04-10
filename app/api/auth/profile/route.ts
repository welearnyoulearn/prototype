import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getSession, signToken } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function PUT(req: NextRequest) {

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  try {
    const { full_name, phone, designation, bio } = await req.json()
    if (!full_name) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })

    // Upsert profile
    await pool.query(
      `INSERT INTO user_profiles (user_id, full_name, phone, designation, bio, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         designation = EXCLUDED.designation,
         bio = EXCLUDED.bio,
         updated_at = NOW()`,
      [session.userId, full_name, phone || null, designation || null, bio || null]
    )

    // Mark profile as completed
    await pool.query('UPDATE users SET profile_completed = TRUE WHERE id = $1', [session.userId])

    // Re-issue token with profileCompleted = true
    const newPayload = { ...session, profileCompleted: true }
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
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[auth/profile]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
