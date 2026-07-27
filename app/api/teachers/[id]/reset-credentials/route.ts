import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSchoolAdmin, generateTempPassword, hashPassword } from '@/lib/auth'
import { sendTeacherWelcomeEmail } from '@/lib/email'

// POST /api/teachers/[id]/reset-credentials
//
// Generates a fresh random temp password and emails it to the teacher —
// mirrors POST /api/students/[id]/reset-credentials. Distinct from the older
// POST /api/teachers/[id]/reset-password, which resets to the teacher's
// (guessable) employee_id and sends no email; that route isn't wired to any
// UI. This one is what the school-admin Credentials tab calls.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureDB()
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const teacherId = parseInt(id, 10)
  if (isNaN(teacherId)) return NextResponse.json({ error: 'Invalid teacher ID' }, { status: 400 })

  const teacherRes = await pool.query(
    `SELECT t.id, t.name, t.email, t.school_id, t.status, s.name as school_name
     FROM teachers t JOIN schools s ON s.id = t.school_id
     WHERE t.id = $1`,
    [teacherId]
  )
  if (teacherRes.rows.length === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  const teacher = teacherRes.rows[0]
  if (teacher.school_id !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // A deactivated/removed teacher can't log in either way — resetting their
  // password would just email fresh credentials to an account nobody can use.
  if (teacher.status !== 'active') {
    return NextResponse.json({ error: 'This teacher is not active — reactivate them before resetting their password' }, { status: 400 })
  }

  if (!teacher.email) {
    return NextResponse.json({ error: 'This teacher has no email on file — add one before resetting their password' }, { status: 400 })
  }

  const tempPassword = generateTempPassword(10)
  const passwordHash = await hashPassword(tempPassword)

  await pool.query(
    `UPDATE teachers SET password_hash = $1, password_changed = FALSE WHERE id = $2`,
    [passwordHash, teacherId]
  )

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  sendTeacherWelcomeEmail({
    to: teacher.email, name: teacher.name, schoolName: teacher.school_name,
    tempPassword, loginUrl: `${appUrl}/teacher/login`,
  }).catch(console.error)

  return NextResponse.json({ temp_password: tempPassword })
}
