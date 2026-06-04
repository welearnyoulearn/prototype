import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { verifyPassword, setStudentAuthCookie, StudentJWTPayload } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { rollNumber, password } = await req.json()
    if (!rollNumber || !password) {
      return NextResponse.json({ error: 'Roll number and password are required' }, { status: 400 })
    }

    const result = await pool.query(
      `SELECT s.id, s.name, s.email, s.grade, s.section, s.roll_number,
              s.school_id, s.password_hash, s.password_changed, s.status,
              sc.name AS school_name
       FROM students s
       JOIN schools sc ON sc.id = s.school_id
       WHERE LOWER(s.roll_number) = LOWER($1)
       LIMIT 1`,
      [rollNumber.trim()]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid roll number or password' }, { status: 401 })
    }

    const student = result.rows[0]

    if (!student.password_hash) {
      return NextResponse.json({ error: 'Account not activated. Please contact your school admin.' }, { status: 401 })
    }

    if (student.status !== 'active') {
      return NextResponse.json({ error: 'Your account is inactive. Contact your school admin.' }, { status: 403 })
    }

    const valid = await verifyPassword(password, student.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid roll number or password' }, { status: 401 })
    }

    const payload: StudentJWTPayload = {
      studentId: student.id,
      schoolId: student.school_id,
      role: 'student',
      passwordChanged: student.password_changed,
      name: student.name,
      grade: student.grade,
      section: student.section,
      rollNumber: student.roll_number,
    }

    await setStudentAuthCookie(payload)

    return NextResponse.json({
      success: true,
      passwordChanged: student.password_changed,
      name: student.name,
      grade: student.grade,
      section: student.section,
      schoolName: student.school_name,
    })
  } catch (error) {
    console.error('[student/auth/login]', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
