import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { verifyPassword, setParentAuthCookie, ParentJWTPayload } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const result = await pool.query(
      `SELECT p.id, p.name, p.email, p.school_id, p.password_hash, p.password_changed,
              s.name AS school_name
       FROM parents p
       LEFT JOIN schools s ON s.id = p.school_id
       WHERE LOWER(p.email) = LOWER($1) AND p.password_hash IS NOT NULL
       LIMIT 1`,
      [email.trim()]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const parent = result.rows[0]
    const valid = await verifyPassword(password, parent.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const payload: ParentJWTPayload = {
      parentId: parent.id,
      schoolId: parent.school_id,
      role: 'parent',
      passwordChanged: parent.password_changed,
      name: parent.name || email,
      email: parent.email,
    }

    await setParentAuthCookie(payload)

    return NextResponse.json({
      success: true,
      passwordChanged: parent.password_changed,
      name: parent.name,
      schoolName: parent.school_name,
    })
  } catch (error) {
    console.error('[parent/auth/login]', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
