import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { verifyPassword, signTeacherToken, setTeacherAuthCookie, TeacherJWTPayload } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Legacy/seed data can have more than one active teacher sharing an email
    // across schools (onboarding now blocks new collisions, but old rows can
    // still exist) — order deterministically by most-recently-created so a
    // stale duplicate never silently wins over the account someone actually
    // meant to log into.
    const result = await pool.query(
      `SELECT t.id, t.name, t.email, t.school_id, t.password_hash, t.password_changed, t.status, s.name AS school_name
       FROM teachers t
       JOIN schools s ON s.id = t.school_id
       WHERE LOWER(t.email) = LOWER($1) AND t.removed_at IS NULL
       ORDER BY t.id DESC
       LIMIT 1`,
      [email.trim()]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const teacher = result.rows[0]

    if (!teacher.password_hash) {
      return NextResponse.json({ error: 'Account not activated. Please contact your school admin.' }, { status: 401 })
    }

    if (teacher.status !== 'active') {
      return NextResponse.json({ error: 'Your account has been deactivated. Contact your school admin.' }, { status: 403 })
    }

    const valid = await verifyPassword(password, teacher.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const payload: TeacherJWTPayload = {
      teacherId: teacher.id,
      schoolId: teacher.school_id,
      role: 'teacher',
      passwordChanged: teacher.password_changed,
      name: teacher.name,
      email: teacher.email,
    }

    await setTeacherAuthCookie(payload)

    return NextResponse.json({
      success: true,
      passwordChanged: teacher.password_changed,
      name: teacher.name,
      schoolName: teacher.school_name,
    })
  } catch (error) {
    console.error('[teacher/auth/login]', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
