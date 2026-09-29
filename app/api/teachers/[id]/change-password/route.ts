import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { hashPassword, verifyPassword, getTeacherSession } from '@/lib/auth'

// Teacher self-service password change
// POST /api/teachers/[id]/change-password { current_password, new_password }
// Only the signed-in teacher, for their own account; the school comes from the session.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (Number(id) !== session.teacherId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const school_id = session.schoolId

    const body = await req.json()
    const { current_password, new_password } = body

    if (typeof current_password !== 'string' || typeof new_password !== 'string' || !current_password || !new_password) {
      return NextResponse.json({ error: 'current_password and new_password required' }, { status: 400 })
    }
    if (new_password.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }

    const { rows: [teacher] } = await pool.query(
      'SELECT id, school_id, password_hash FROM teachers WHERE id = $1 AND school_id = $2',
      [id, school_id]
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
      [newHash, id]
    )

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
