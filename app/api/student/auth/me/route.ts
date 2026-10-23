import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature, clearStudentAuthCookie } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // Checked on every load (and periodically while the tab stays open, see
    // the access-revocation poll in app/student/page.tsx) so a school admin
    // turning off Student Portal Access logs out students who are already
    // signed in, not just new login attempts.
    if (!(await schoolHasFeature(session.schoolId, 'student-portal'))) {
      await clearStudentAuthCookie()
      return NextResponse.json(
        { error: 'access_revoked', message: "Your school has disabled student portal access. Please contact your school admin." },
        { status: 401 }
      )
    }

    const result = await pool.query(
      `SELECT s.id, s.name, s.email, s.phone, s.grade, s.section, s.roll_number,
              s.school_id, s.parent_name, s.parent_phone, s.parent_email,
              s.password_changed, s.date_of_birth,
              sc.name AS school_name, sc.city AS school_city
       FROM students s
       JOIN schools sc ON sc.id = s.school_id
       WHERE s.id = $1 AND s.status = 'active'`,
      [session.studentId]
    )

    if (result.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
