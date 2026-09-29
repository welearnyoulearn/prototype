import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'
import { validateBirthDate } from '@/lib/birthday'

// Self-service — deliberately separate from PUT /api/teachers/[id] (the
// school-admin staff-management endpoint, gated by requireFeeAccess). That
// route also controls status/staff_type/teaches_grades and reactivation, so
// a teacher session must never be allowed to call it for themselves. This
// endpoint can only ever write the teacher's OWN date_of_birth — nothing
// else — used by both the one-time onboarding prompt and the "edit later"
// section on their own profile page.
export async function PUT(req: NextRequest) {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { date_of_birth } = await req.json()
    const validationError = validateBirthDate(date_of_birth, 'adult')
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    await pool.query(`UPDATE teachers SET date_of_birth = $1 WHERE id = $2`, [date_of_birth, session.teacherId])
    return NextResponse.json({ success: true, date_of_birth })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
