import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin, generateTempPassword, hashPassword } from '@/lib/auth'
import { sendStudentWelcomeEmail } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const studentId = parseInt(id, 10)
  if (isNaN(studentId)) return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 })

  const studentRes = await pool.query(
    `SELECT s.id, s.name, s.email, s.school_id, s.roll_number, sc.name as school_name
     FROM students s JOIN schools sc ON sc.id = s.school_id
     WHERE s.id = $1`,
    [studentId]
  )
  if (studentRes.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const student = studentRes.rows[0]
  if (student.school_id !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  return NextResponse.json({ temp_password: tempPassword })
}
