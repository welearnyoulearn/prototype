import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getCache, setCache, invalidateCache } from '@/lib/responseCache'
import { hashPassword, generateTempPassword, getAnySession, requireSchoolAdmin } from '@/lib/auth'
import { sendTeacherWelcomeEmail } from '@/lib/email'

export async function GET(req: NextRequest) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const { searchParams } = new URL(req.url)
      const school_id = searchParams.get('school_id')
      const staff_type = searchParams.get('staff_type')
      const department = searchParams.get('department')

      // getAnySession() only confirms SOME valid login exists — without
      // this, a teacher/student logged into School A could pass School B's
      // id and read School B's full staff directory including phone/email.
      if (school_id && session.schoolId !== parseInt(school_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      if (school_id && !department) {
        const cacheKey = `teachers:${school_id}:${staff_type ?? 'all'}`
        const cached = getCache(cacheKey)
        if (cached) return NextResponse.json(cached)

        const conditions: string[] = []
        const values: (string | number)[] = []
        values.push(school_id); conditions.push(`t.school_id = $${values.length}`)
        if (staff_type) { values.push(staff_type); conditions.push(`t.staff_type = $${values.length}`) }
        const where = `WHERE ${conditions.join(' AND ')}`

        const result = await pool.query(
          `SELECT DISTINCT ON (t.id)
                  t.id, t.school_id, t.name, t.email, t.subject, t.phone, t.employee_id,
                  t.department, t.qualification, t.date_of_joining, t.status, t.created_at,
                  t.staff_type, t.teaches_grades, t.password_changed, t.removed_at,
                  c.id AS class_id, c.grade AS class_grade, c.section AS class_section
           FROM teachers t
           LEFT JOIN classes c ON c.class_teacher_id = t.id AND c.school_id = t.school_id
           ${where}
           ORDER BY t.id, t.staff_type, t.department, t.name`,
          values
        )
        setCache(cacheKey, result.rows, 60_000)
        return NextResponse.json(result.rows)
      }

      const conditions: string[] = []
      const values: (string | number)[] = []

      if (school_id) { values.push(school_id); conditions.push(`t.school_id = $${values.length}`) }
      if (staff_type) { values.push(staff_type); conditions.push(`t.staff_type = $${values.length}`) }
      if (department) { values.push(department); conditions.push(`t.department = $${values.length}`) }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const result = await pool.query(
        `SELECT DISTINCT ON (t.id) t.*,
                c.id AS class_id, c.grade AS class_grade, c.section AS class_section
         FROM teachers t
         LEFT JOIN classes c ON c.class_teacher_id = t.id AND c.school_id = t.school_id
         ${where}
         ORDER BY t.id, t.staff_type, t.department, t.name`,
        values
      )
      return NextResponse.json(result.rows)
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { school_id, name, email, subject, phone, staff_type, department, qualification, date_of_joining, employee_id, teaches_grades, class_teacher_grade, class_teacher_section } = body
    if (!school_id || !name) return NextResponse.json({ error: 'school_id and name are required' }, { status: 400 })

    // Email is the teacher login identifier and must be unique across the
    // platform — an active teacher elsewhere has to be removed by their
    // current school before the same email can be reused here.
    if (email?.trim()) {
      const emailDup = await pool.query(
        `SELECT t.name, s.name AS school_name FROM teachers t
         JOIN schools s ON s.id = t.school_id
         WHERE LOWER(t.email) = LOWER($1) AND t.school_id != $2 AND t.removed_at IS NULL`,
        [email.trim(), school_id]
      )
      if (emailDup.rows.length > 0) {
        const existing = emailDup.rows[0]
        return NextResponse.json({
          error: `${email.trim()} is already registered to ${existing.name} at ${existing.school_name}. That school must remove them before this email can be reused here.`,
        }, { status: 409 })
      }
    }

    // Generate temp password if email provided
    const tempPassword = email ? generateTempPassword(10) : null
    const passwordHash = tempPassword ? await hashPassword(tempPassword) : null

    const result = await pool.query(
      `INSERT INTO teachers
         (school_id, name, email, subject, phone, staff_type, department, qualification,
          date_of_joining, employee_id, teaches_grades, class_teacher_grade, class_teacher_section,
          password_hash, password_changed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,FALSE)
       RETURNING id, school_id, name, email, subject, phone, staff_type, department, qualification,
                 date_of_joining, employee_id, teaches_grades, password_changed`,
      [school_id, name, email, subject, phone, staff_type || 'teaching', department, qualification,
       date_of_joining || null, employee_id, teaches_grades, class_teacher_grade, class_teacher_section,
       passwordHash]
    )

    const teacher = result.rows[0]

    // Send welcome email in background (don't block response)
    if (email && tempPassword) {
      const schoolResult = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
      const schoolName = schoolResult.rows[0]?.name || 'Your School'
      const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/login`
      sendTeacherWelcomeEmail({ to: email, name, schoolName, tempPassword, loginUrl }).catch(console.error)
    }

    invalidateCache(`teachers:${school_id}`)
    return NextResponse.json(teacher, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 })
  }
}
