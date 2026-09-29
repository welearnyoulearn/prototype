import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getParentSession } from '@/lib/auth'
import { validateBirthDate } from '@/lib/birthday'

// Self-service — a parent may only ever set their OWN date_of_birth, no
// other field. Used by both the one-time onboarding prompt and the
// "edit later" section on their own profile page.
export async function PUT(req: NextRequest) {
  try {
    const session = await getParentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { date_of_birth } = await req.json()
    const validationError = validateBirthDate(date_of_birth, 'adult')
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    await pool.query(`UPDATE parents SET date_of_birth = $1 WHERE id = $2`, [date_of_birth, session.parentId])
    return NextResponse.json({ success: true, date_of_birth })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
