import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getTeacherSession, setTeacherAuthCookie, hashPassword, verifyPassword } from '@/lib/auth'

export async function POST(req: NextRequest) {

  const session = await getTeacherSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { current_password, new_password } = await req.json()

  if (!current_password || !new_password) {
    return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 })
  }
  if (new_password.length < 6) {
    return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
  }

  const { rows: [teacher] } = await pool.query(
    'SELECT password_hash, employee_id FROM teachers WHERE id = $1 AND school_id = $2',
    [session.teacherId, session.schoolId]
  )
  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  // Allow either current password hash OR employee_id (default password) as "current"
  const currentPasswordValid = teacher.password_hash
    ? await verifyPassword(current_password, teacher.password_hash)
    : current_password === teacher.employee_id

  if (!currentPasswordValid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  if (new_password === teacher.employee_id) {
    return NextResponse.json({ error: 'New password cannot be the same as your Employee ID' }, { status: 400 })
  }

  const newHash = await hashPassword(new_password)
  await pool.query(
    'UPDATE teachers SET password_hash = $1, password_changed = TRUE WHERE id = $2',
    [newHash, session.teacherId]
  )

  // Refresh cookie with passwordChanged=true
  await setTeacherAuthCookie({ ...session, passwordChanged: true })
  return NextResponse.json({ success: true })
}
