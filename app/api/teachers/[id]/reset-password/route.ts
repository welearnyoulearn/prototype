import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getSession, hashPassword } from '@/lib/auth'

// School admin resets a teacher's password back to their employee_id
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {

    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const { rows: [teacher] } = await pool.query(
      'SELECT id, employee_id, school_id FROM teachers WHERE id = $1',
      [id]
    )
    if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

    // School admin can only reset teachers in their own school
    if (session.role === 'school_admin' && teacher.school_id !== session.schoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!teacher.employee_id) {
      return NextResponse.json({ error: 'Teacher has no employee ID set — cannot reset password' }, { status: 400 })
    }

    const hash = await hashPassword(teacher.employee_id)
    await pool.query(
      'UPDATE teachers SET password_hash = $1, password_changed = FALSE WHERE id = $2',
      [hash, teacher.id]
    )

    return NextResponse.json({ success: true, message: `Password reset to employee ID (${teacher.employee_id})` })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
