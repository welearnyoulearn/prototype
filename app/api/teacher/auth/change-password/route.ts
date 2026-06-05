import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getTeacherSession, verifyPassword, hashPassword, setTeacherAuthCookie, TeacherJWTPayload } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    try {
      const { currentPassword, newPassword } = await req.json()

      if (!newPassword || newPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
      }

      const result = await pool.query(
        'SELECT password_hash, password_changed FROM teachers WHERE id = $1',
        [session.teacherId]
      )
      if (result.rows.length === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

      const teacher = result.rows[0]
      const isFirstLogin = !session.passwordChanged && !teacher.password_changed

      if (!isFirstLogin) {
        if (!currentPassword) return NextResponse.json({ error: 'Current password required' }, { status: 400 })
        const valid = await verifyPassword(currentPassword, teacher.password_hash)
        if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
      }

      const newHash = await hashPassword(newPassword)
      await pool.query(
        'UPDATE teachers SET password_hash = $1, password_changed = TRUE WHERE id = $2',
        [newHash, session.teacherId]
      )

      const newPayload: TeacherJWTPayload = { ...session, passwordChanged: true }
      await setTeacherAuthCookie(newPayload)

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('[teacher/auth/change-password]', error)
      return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
