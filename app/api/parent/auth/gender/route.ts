import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getParentSession } from '@/lib/auth'

const VALID = new Set(['male', 'female'])

// Self-service — a parent may only ever set their OWN gender, no other
// field. Used by both the one-time onboarding prompt and the "edit later"
// section on their own profile page.
export async function PUT(req: NextRequest) {
  try {
    const session = await getParentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { gender } = await req.json()
    if (gender !== null && !VALID.has(gender)) {
      return NextResponse.json({ error: 'gender must be "male", "female", or null' }, { status: 400 })
    }

    await pool.query(`UPDATE parents SET gender = $1 WHERE id = $2`, [gender, session.parentId])
    return NextResponse.json({ success: true, gender })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
