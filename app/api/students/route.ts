import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'
import { hashPassword, generateTempPassword, getAnySession, requireSchoolAdmin } from '@/lib/auth'
import { sendStudentWelcomeEmail, sendParentWelcomeEmail } from '@/lib/email'

export async function GET(req: NextRequest) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const { searchParams } = new URL(req.url)
      const school_id = searchParams.get('school_id')
      const grade = searchParams.get('grade')
      const section = searchParams.get('section')

      const conditions: string[] = []
      const values: (string | number)[] = []

      if (school_id) { values.push(school_id); conditions.push(`school_id = $${values.length}`) }
      if (grade) { values.push(grade); conditions.push(`grade = $${values.length}`) }
      if (section) { values.push(section); conditions.push(`section = $${values.length}`) }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const result = await pool.query(
        `SELECT * FROM students ${where} ORDER BY (NULLIF(regexp_replace(grade,'[^0-9]','','g'),''))::int NULLS LAST, section, name`,
        values
      )
      return NextResponse.json(result.rows)
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
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
    const { school_id, name, email, grade, section, phone, parent_name, parent_phone, parent_email, roll_number } = body
    if (!school_id || !name) return NextResponse.json({ error: 'school_id and name are required' }, { status: 400 })

    // Auto-create class if it doesn't exist
    if (grade && section) {
      await pool.query(
        `INSERT INTO classes (school_id, grade, section) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [school_id, grade, section]
      )
    }

    // Generate student temp password
    const tempPassword = generateTempPassword(8)
    const passwordHash = await hashPassword(tempPassword)

    const result = await pool.query(
      `INSERT INTO students
         (school_id, name, email, grade, section, phone, parent_name, parent_phone, parent_email,
          roll_number, status, password_hash, password_changed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,FALSE)
       RETURNING *`,
      [school_id, name, email, grade, section, phone, parent_name, parent_phone, parent_email,
       roll_number, passwordHash]
    )

    const student = result.rows[0]
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    // Send student welcome email (if student email provided)
    if (email && roll_number) {
      const schoolResult = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
      const schoolName = schoolResult.rows[0]?.name || 'Your School'
      sendStudentWelcomeEmail({
        to: email, name, schoolName, rollNumber: roll_number,
        tempPassword, loginUrl: `${appUrl}/student/login`,
      }).catch(console.error)
    }

    // Create parent account + send parent welcome email if parent_email provided
    if (parent_email) {
      const schoolResult = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
      const schoolName = schoolResult.rows[0]?.name || 'Your School'
      await provisionParentAccount({ parentEmail: parent_email, parentName: parent_name, studentId: student.id, schoolId: school_id, schoolName, studentName: name, appUrl })
    }

    invalidateCache(`classes:${school_id}`)
    return NextResponse.json(student, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create student' }, { status: 500 })
  }
}

// Create or link a parent account, sending welcome email only on first creation
async function provisionParentAccount({
  parentEmail, parentName, studentId, schoolId, schoolName, studentName, appUrl
}: {
  parentEmail: string; parentName: string | null; studentId: number; schoolId: number
  schoolName: string; studentName: string; appUrl: string
}) {
  try {
    // Check if parent account already exists
    const existing = await pool.query(
      'SELECT id, name FROM parents WHERE LOWER(email) = LOWER($1)',
      [parentEmail]
    )

    let parentId: number
    let isNew = false

    if (existing.rows.length > 0) {
      parentId = existing.rows[0].id
    } else {
      isNew = true
      const tempPassword = generateTempPassword(10)
      const passwordHash = await hashPassword(tempPassword)
      const parentResult = await pool.query(
        `INSERT INTO parents (name, email, school_id, password_hash, password_changed)
         VALUES ($1, $2, $3, $4, FALSE) RETURNING id`,
        [parentName || parentEmail, parentEmail, schoolId, passwordHash]
      )
      parentId = parentResult.rows[0].id

      // Send welcome email
      sendParentWelcomeEmail({
        to: parentEmail,
        parentName: parentName || parentEmail,
        studentName,
        schoolName,
        tempPassword,
        loginUrl: `${appUrl}/parent/login`,
      }).catch(console.error)
    }

    // Link student to parent (idempotent)
    await pool.query(
      `INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [studentId, parentId]
    )
  } catch (err) {
    console.error('[provisionParentAccount]', err)
  }
}
