import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { JWT_SECRET } from '@/lib/auth-constants'

// GET /api/fees/upi-id?school_id=X — returns { upi_id, locked }
// `locked` is true once a UPI ID has been saved — the Setup tab renders the
// field read-only in that case, and PUT below refuses to change it without a
// fresh unlockToken from POST /api/fees/upi-id/verify.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { rows: [sc] } = await pool.query(`SELECT upi_id FROM schools WHERE id = $1`, [school_id])
    const upi_id = sc?.upi_id || ''
    return NextResponse.json({ upi_id, locked: !!upi_id })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/fees/upi-id  Body: { school_id, upi_id, unlockToken? }
//
// A school's UPI ID, once saved, is locked — changing it (including clearing
// it) requires a fresh unlockToken minted by POST /api/fees/upi-id/verify
// (which itself requires the caller's own current password). Setting it for
// the FIRST time (no existing value yet) needs no token — there's nothing to
// protect against yet. The token is single-purpose (checked against this
// exact school_id + the 'upi-id-unlock' claim) and short-lived (3 minutes,
// enforced by jwt.verify's own exp check), so it can't be replayed later or
// reused for a different school.
export async function PUT(req: NextRequest) {
  try {
    const { school_id, upi_id, unlockToken } = await req.json()
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [sc] } = await pool.query(`SELECT upi_id FROM schools WHERE id = $1`, [school_id])
    const alreadySet = !!sc?.upi_id

    if (alreadySet) {
      if (!unlockToken) {
        return NextResponse.json({ error: 'This field is locked. Verify your password to make changes.', locked: true }, { status: 423 })
      }
      try {
        const claims = jwt.verify(unlockToken, JWT_SECRET) as { purpose?: string; schoolId?: number }
        if (claims.purpose !== 'upi-id-unlock' || Number(claims.schoolId) !== Number(school_id)) {
          return NextResponse.json({ error: 'Invalid unlock token. Verify your password again.', locked: true }, { status: 423 })
        }
      } catch {
        return NextResponse.json({ error: 'Unlock expired. Verify your password again.', locked: true }, { status: 423 })
      }
    }

    const value = (upi_id || '').trim()
    // Allow clearing it, otherwise require a valid-looking VPA (must contain '@')
    if (value && !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(value)) {
      return NextResponse.json({ error: 'Enter a valid UPI ID, e.g. school@okhdfcbank' }, { status: 400 })
    }
    await pool.query(`UPDATE schools SET upi_id = $1 WHERE id = $2`, [value || null, school_id])
    // Re-locks immediately: any non-empty value saved from here on is only
    // ever changeable again via the same verify-then-unlock round trip.
    return NextResponse.json({ ok: true, upi_id: value, locked: !!value })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
