import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession, verifyPassword, hashPassword, setStudentAuthCookie, StudentJWTPayload } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getStudentSession()
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  try {
    const { currentPassword, newPassword } = await req.json()

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    const result = await pool.query(
      'SELECT password_hash, password_changed FROM students WHERE id = $1',
      [session.studentId]
    )
    if (result.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const student = result.rows[0]
    const isFirstLogin = !session.passwordChanged && !student.password_changed

    if (!isFirstLogin) {
      if (!currentPassword) return NextResponse.json({ error: 'Current password required' }, { status: 400 })
      const valid = await verifyPassword(currentPassword, student.password_hash)
      if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    const newHash = await hashPassword(newPassword)
    await pool.query(
      'UPDATE students SET password_hash = $1, password_changed = TRUE WHERE id = $2',
      [newHash, session.studentId]
    )

    const newPayload: StudentJWTPayload = { ...session, passwordChanged: true }
    await setStudentAuthCookie(newPayload)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[student/auth/change-password]', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
