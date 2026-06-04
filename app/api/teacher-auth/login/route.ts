import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { hashPassword, verifyPassword, setTeacherAuthCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {

  try {
    const { school_code, employee_id, password } = await req.json()

    if (!school_code?.trim() || !employee_id?.trim() || !password) {
      return NextResponse.json({ error: 'School code, employee ID and password are required' }, { status: 400 })
    }

    // Resolve school by code
    const { rows: [school] } = await pool.query(
      'SELECT id FROM schools WHERE LOWER(school_code) = $1 AND status = $2',
      [school_code.trim().toLowerCase(), 'active']
    )
    if (!school) {
      return NextResponse.json({ error: 'Invalid school code' }, { status: 401 })
    }

    // Find teacher by employee_id within this school
    const { rows: [teacher] } = await pool.query(
      `SELECT t.*, c.grade AS class_teacher_grade, c.section AS class_teacher_section
       FROM teachers t
       LEFT JOIN classes c ON c.class_teacher_id = t.id AND c.school_id = t.school_id
       WHERE t.school_id = $1 AND LOWER(t.employee_id) = $2 AND t.status = 'active'`,
      [school.id, employee_id.trim().toLowerCase()]
    )
    if (!teacher) {
      return NextResponse.json({ error: 'Invalid employee ID or password' }, { status: 401 })
    }

    // First-time login: no password set yet → default password is employee_id
    if (!teacher.password_hash) {
      const isDefaultPassword = password === teacher.employee_id
      if (!isDefaultPassword) {
        return NextResponse.json({ error: 'Invalid employee ID or password' }, { status: 401 })
      }
      // Auto-set the hash on first login attempt
      const hash = await hashPassword(password)
      await pool.query(
        'UPDATE teachers SET password_hash = $1, password_changed = FALSE WHERE id = $2',
        [hash, teacher.id]
      )

      // Issue token with passwordChanged=false to trigger forced change
      await setTeacherAuthCookie({ teacherId: teacher.id, schoolId: school.id, role: 'teacher', passwordChanged: false, name: teacher.name, email: teacher.email ?? '' })
      return NextResponse.json({ success: true, passwordChanged: false })
    }

    // Normal login
    const valid = await verifyPassword(password, teacher.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid employee ID or password' }, { status: 401 })
    }

    await setTeacherAuthCookie({
      teacherId: teacher.id,
      schoolId: school.id,
      role: 'teacher',
      passwordChanged: teacher.password_changed ?? false,
      name: teacher.name,
      email: teacher.email ?? '',
    })

    return NextResponse.json({
      success: true,
      passwordChanged: teacher.password_changed ?? false,
    })
  } catch (error) {
    console.error('[teacher-auth/login]', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
