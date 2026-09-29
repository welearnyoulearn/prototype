import { NextResponse } from 'next/server'
import { getSession, getPlatformSession } from '@/lib/auth'
import pool from '@/lib/db'

export async function GET() {
  try {
    // School-side cookie first, then Platform Admin's own cookie — the two are
    // separate (see lib/auth.ts) so a Platform Admin session is otherwise invisible here.
    const session = (await getSession()) ?? (await getPlatformSession())
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const result = await pool.query(
      `SELECT u.id, u.email, u.school_code, u.role, u.school_id, u.first_login, u.profile_completed,
              COALESCE(up.full_name, u.full_name) AS full_name, up.phone, up.designation, up.bio,
              s.name AS school_name
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.id = $1`,
      [session.userId]
    )

    if (result.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
