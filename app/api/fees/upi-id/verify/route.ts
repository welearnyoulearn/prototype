import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import pool from '@/lib/db'
import { requireFeeAccess, verifyPassword } from '@/lib/auth'
import { JWT_SECRET } from '@/lib/auth-constants'

// POST /api/fees/upi-id/verify  Body: { school_id, password }
//
// Once a school's UPI ID has been saved, PUT /api/fees/upi-id refuses to
// change it without a short-lived unlock token from here — the currently
// logged-in admin (school_admin/principal/vice_principal, or platform_admin
// acting on the school's behalf) re-enters THEIR OWN current password to
// prove it's really them, same "confirm it's you" pattern as a self-service
// change-password flow, not a separate admin account or a school-wide secret.
// The token is scoped to this exact user + school + purpose and expires in a
// few minutes — it is not a session, it does not grant anything beyond one
// UPI-ID save.
export async function POST(req: NextRequest) {
  try {
    const { school_id, password } = await req.json()
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [user] } = await pool.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [access.userId]
    )
    if (!user?.password_hash) {
      return NextResponse.json({ error: 'Unable to verify — account not found' }, { status: 403 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    const unlockToken = jwt.sign(
      { purpose: 'upi-id-unlock', userId: access.userId, schoolId: Number(school_id) },
      JWT_SECRET,
      { expiresIn: '3m' }
    )
    return NextResponse.json({ unlockToken, expiresInSeconds: 180 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
