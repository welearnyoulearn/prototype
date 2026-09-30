import { NextRequest, NextResponse } from 'next/server'
import { isSchoolLocked, LOCKED_MESSAGE_PORTAL } from '@/lib/planAccess'
import pool, { ensureDB } from '@/lib/db'
import { verifyPasswordForLogin, setTeacherAuthCookie, TeacherJWTPayload, createPortalSession } from '@/lib/auth'
import { recordSessionStart } from '@/lib/usageTracking'
import { checkAuthRateLimit, clearAuthRateLimit, LOGIN_LIMIT } from '@/lib/authRateLimit'

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!await checkAuthRateLimit(req, 'teacher-login', normalizedEmail, LOGIN_LIMIT)) {
      return NextResponse.json({ error: 'Too many login attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': '900' } })
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
      [normalizedEmail]
    )

    if (result.rows.length === 0) {
      await verifyPasswordForLogin(password)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const teacher = result.rows[0]

    const valid = await verifyPasswordForLogin(password, teacher.password_hash)
    if (!valid || teacher.status !== 'active') {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }
    await clearAuthRateLimit(req, 'teacher-login', normalizedEmail)

    const payload: TeacherJWTPayload = {
      teacherId: teacher.id,
      schoolId: teacher.school_id,
      role: 'teacher',
      passwordChanged: teacher.password_changed,
      name: teacher.name,
      email: teacher.email,
    }

    // A school whose plan has ended is locked: no portal access for teachers, students or parents.

    if (await isSchoolLocked(teacher.school_id)) {

      return NextResponse.json({ error: LOCKED_MESSAGE_PORTAL, code: 'PLAN_EXPIRED' }, { status: 403 })

    }

    payload.sid = await createPortalSession('teacher', teacher.id, teacher.school_id)
    await setTeacherAuthCookie(payload)

    const usageSessionId = await recordSessionStart({
      schoolId: teacher.school_id,
      actorId: teacher.id,
      actorRole: 'teacher',
      actorName: teacher.name,
    })

    return NextResponse.json({
      success: true,
      passwordChanged: teacher.password_changed,
      name: teacher.name,
      schoolName: teacher.school_name,
      usageSessionId,
    })
  } catch (error) {
    console.error('[teacher/auth/login]', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
