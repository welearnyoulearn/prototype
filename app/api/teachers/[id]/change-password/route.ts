import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getTeacherSession, hashPassword, verifyPassword, validateNewPassword, revokePortalSessions } from '@/lib/auth'

// Teacher self-service password change
// POST /api/teachers/[id]/change-password { current_password, new_password, school_id }
// school_id remains accepted for backwards compatibility but is never trusted for authorization.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { id } = await params
    if (Number(id) !== session.teacherId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await req.json()
    const { current_password, new_password } = body

    if (!current_password || !new_password) {
      return NextResponse.json({ error: 'current_password and new_password required' }, { status: 400 })
    }
    const policyError = validateNewPassword(new_password, session.email)
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })

    const { rows: [teacher] } = await pool.query(
      'SELECT id, school_id, password_hash FROM teachers WHERE id = $1 AND school_id = $2',
      [session.teacherId, session.schoolId]
    )
    if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    if (!teacher.password_hash) {
      return NextResponse.json({ error: 'No password set — contact admin' }, { status: 400 })
    }

    const valid = await verifyPassword(current_password, teacher.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
    }

    const newHash = await hashPassword(new_password)
    await pool.query(
      'UPDATE teachers SET password_hash = $1, password_changed = TRUE WHERE id = $2',
      [newHash, session.teacherId]
    )
    await revokePortalSessions('teacher', session.teacherId, session.sid)

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
