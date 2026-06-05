import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getParentSession, verifyPassword, hashPassword, setParentAuthCookie, ParentJWTPayload } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await getParentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    try {
      const { currentPassword, newPassword } = await req.json()
      if (!newPassword || newPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
      }

      const result = await pool.query('SELECT password_hash, password_changed FROM parents WHERE id = $1', [session.parentId])
      if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const parent = result.rows[0]
      const isFirstLogin = !session.passwordChanged && !parent.password_changed

      if (!isFirstLogin) {
        if (!currentPassword) return NextResponse.json({ error: 'Current password required' }, { status: 400 })
        const valid = await verifyPassword(currentPassword, parent.password_hash)
        if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
      }

      const newHash = await hashPassword(newPassword)
      await pool.query('UPDATE parents SET password_hash = $1, password_changed = TRUE WHERE id = $2', [newHash, session.parentId])

      const newPayload: ParentJWTPayload = { ...session, passwordChanged: true }
      await setParentAuthCookie(newPayload)

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('[parent/auth/change-password]', error)
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
