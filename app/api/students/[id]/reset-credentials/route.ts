import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSchoolAdmin, generateTempPassword, hashPassword } from '@/lib/auth'
import { sendStudentWelcomeEmail, sendChildCredentialsToParentEmail } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureDB()
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const studentId = parseInt(id, 10)
  if (isNaN(studentId)) return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 })

  const studentRes = await pool.query(
    `SELECT s.id, s.name, s.email, s.school_id, s.roll_number, s.status, sc.name as school_name
     FROM students s JOIN schools sc ON sc.id = s.school_id
     WHERE s.id = $1`,
    [studentId]
  )
  if (studentRes.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const student = studentRes.rows[0]
  if (student.school_id !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // A deactivated student can't log in either way — resetting their password
  // would just email fresh credentials to an account nobody can use.
  if (student.status && student.status !== 'active') {
    return NextResponse.json({ error: 'This student is not active — restore them before resetting their password' }, { status: 400 })
  }

  const tempPassword = generateTempPassword(8)
  const passwordHash = await hashPassword(tempPassword)

  await pool.query(
    `UPDATE students SET password_hash = $1, password_changed = FALSE WHERE id = $2`,
    [passwordHash, studentId]
  )

  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  // Send new credentials via email if student has one
  if (student.email) {
    sendStudentWelcomeEmail({
      to: student.email, name: student.name, schoolName: student.school_name,
      rollNumber: student.roll_number, tempPassword,
      loginUrl: `${appUrl}/student/login`,
    }).catch(console.error)
  }

  // Parent always gets a copy too — looked up via student_parents (the real
  // link table), not the students.parent_email display column, since that
  // column can silently diverge from the parent's actual login email.
  const parentRes = await pool.query(
    `SELECT p.email, p.name FROM student_parents sp
     JOIN parents p ON p.id = sp.parent_id
     WHERE sp.student_id = $1 AND p.email IS NOT NULL`,
    [studentId]
  )
  for (const parent of parentRes.rows) {
    sendChildCredentialsToParentEmail({
      to: parent.email, parentName: parent.name || parent.email,
      studentName: student.name, schoolName: student.school_name,
      rollNumber: student.roll_number, tempPassword,
      loginUrl: `${appUrl}/student/login`,
    }).catch(console.error)
  }

  return NextResponse.json({ temp_password: tempPassword })
}
