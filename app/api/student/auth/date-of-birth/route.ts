import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { validateBirthDate } from '@/lib/birthday'

// Self-service — a student may only ever set their OWN date_of_birth, no
// other field. Used by both the one-time onboarding prompt and the
// "edit later" section on their own profile page.
export async function PUT(req: NextRequest) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { date_of_birth } = await req.json()
    const validationError = validateBirthDate(date_of_birth, 'student')
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    await pool.query(`UPDATE students SET date_of_birth = $1 WHERE id = $2`, [date_of_birth, session.studentId])
    return NextResponse.json({ success: true, date_of_birth })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
