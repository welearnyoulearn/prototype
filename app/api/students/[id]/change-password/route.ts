import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { getStudentSession } from '@/lib/auth'

// POST /api/students/[id]/change-password
// Body: { current_password, new_password } — the signed-in student, for their own account only.
// The student portal itself uses /api/student/auth/change-password; this route is kept for API callers.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (Number(id) !== session.studentId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const school_id = session.schoolId

    const body = await req.json()
    const { current_password, new_password } = body

    if (typeof current_password !== 'string' || typeof new_password !== 'string' || !current_password || !new_password) {
      return NextResponse.json({ error: 'current_password and new_password required' }, { status: 400 })
    }

    if (new_password.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    try {
      const { rows: [student] } = await pool.query(
        'SELECT id, password_hash FROM students WHERE id = $1 AND school_id = $2',
        [id, school_id]
      )
      if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

      // Always verify: a student with no password set must not be able to skip the check.
      if (!student.password_hash) return NextResponse.json({ error: 'No password set — contact the school' }, { status: 400 })
      const valid = await bcrypt.compare(current_password, student.password_hash)
      if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })

      const hash = await bcrypt.hash(new_password, 10)
      await pool.query(
        'UPDATE students SET password_hash = $1, password_changed = TRUE WHERE id = $2',
        [hash, id]
      )

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
