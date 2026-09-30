import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession, hashPassword, verifyPassword, validateNewPassword, revokePortalSessions } from '@/lib/auth'

// POST /api/students/[id]/change-password
// Legacy body shape: { current_password, new_password, school_id }.
// The authenticated student identity, never those caller-controlled fields, owns the target.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { id } = await params
    if (Number(id) !== session.studentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await req.json()
    const { current_password, new_password } = body

    if (!current_password || !new_password) {
      return NextResponse.json({ error: 'current_password and new_password required' }, { status: 400 })
    }

    const policyError = validateNewPassword(new_password, session.rollNumber)
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })

    try {
      const { rows: [student] } = await pool.query(
        'SELECT id, password_hash FROM students WHERE id = $1 AND school_id = $2',
        [session.studentId, session.schoolId]
      )
      if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

      if (!student.password_hash) {
        return NextResponse.json({ error: 'No password set — contact the school' }, { status: 400 })
      }
      const valid = await verifyPassword(current_password, student.password_hash)
      if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })

      const hash = await hashPassword(new_password)
      await pool.query(
        'UPDATE students SET password_hash = $1, password_changed = TRUE WHERE id = $2',
        [hash, session.studentId]
      )
      await revokePortalSessions('student', session.studentId, session.sid)

      return NextResponse.json({ success: true })
    } catch (err) {
      console.error('Student change-password error:', err)
      return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
    }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
