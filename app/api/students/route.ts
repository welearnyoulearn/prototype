import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'
import { hashPassword, generateTempPassword, getAnySession, requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'
import { sendStudentWelcomeEmail, sendParentWelcomeEmail } from '@/lib/email'
import { findOrCreateParent, linkStudentParent } from '@/lib/studentOnboarding'
import { gradeOrderSql } from '@/lib/grades'

export async function GET(req: NextRequest) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const { searchParams } = new URL(req.url)
      const school_id = searchParams.get('school_id')
      const grade = searchParams.get('grade')
      const section = searchParams.get('section')

      if (session.role !== 'platform_admin' && school_id && Number(school_id) !== Number(session.schoolId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Lightweight mode: just the distinct grades with active students, for screens
      // that need to know which grades are actually in use (e.g. fee setup validation)
      // without paying for a full SELECT * roster fetch.
      if (searchParams.get('grades_only') === '1' && school_id) {
        const { rows } = await pool.query(
          `SELECT DISTINCT grade FROM students WHERE school_id = $1 AND (status IS NULL OR status = 'active')`,
          [school_id]
        )
        return NextResponse.json(rows.map(r => r.grade))
      }

      const conditions: string[] = []
      const values: (string | number)[] = []

      if (school_id) { values.push(school_id); conditions.push(`school_id = $${values.length}`) }
      if (grade) { values.push(grade); conditions.push(`grade = $${values.length}`) }
      if (section) { values.push(section); conditions.push(`section = $${values.length}`) }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const result = await pool.query(
        `SELECT * FROM students ${where} ORDER BY ${gradeOrderSql('grade')}, section, name`,
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
    const { school_id, name, email, grade, section, phone, parent_name, parent_phone, parent_email, roll_number, school_roll_number } = body
    if (!school_id || !name) return NextResponse.json({ error: 'school_id and name are required' }, { status: 400 })
    if (admin.schoolId !== school_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!section?.trim()) return NextResponse.json({ error: 'Section is required' }, { status: 400 })
    if (!parent_name?.trim()) return NextResponse.json({ error: 'Parent name is required' }, { status: 400 })
    if (!parent_phone?.trim()) return NextResponse.json({ error: 'Parent phone is required' }, { status: 400 })
    if (school_roll_number == null || school_roll_number === '') return NextResponse.json({ error: 'Roll number is required' }, { status: 400 })

    if (phone?.trim()) {
      const dupPhone = await pool.query(
        `SELECT id, name FROM students WHERE school_id = $1 AND phone = $2 AND status = 'active'`,
        [school_id, phone.trim()]
      )
      if (dupPhone.rows.length > 0) {
        return NextResponse.json({ error: `Phone ${phone} already exists (${dupPhone.rows[0].name})` }, { status: 409 })
      }
    }

    if (email?.trim()) {
      const dupEmail = await pool.query(
        `SELECT id, name FROM students WHERE school_id = $1 AND LOWER(email) = LOWER($2) AND status = 'active'`,
        [school_id, email.trim()]
      )
      if (dupEmail.rows.length > 0) {
        return NextResponse.json({ error: `Email ${email} already exists (${dupEmail.rows[0].name})` }, { status: 409 })
      }
    }

    if (school_roll_number != null && grade && section) {
      const dupRoll = await pool.query(
        `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND school_roll_number = $4 AND status = 'active'`,
        [school_id, grade, section, school_roll_number]
      )
      if (dupRoll.rows.length > 0) {
        return NextResponse.json({ error: `Roll number ${school_roll_number} already exists in Grade ${grade} Section ${section}` }, { status: 409 })
      }
    }

    // Auto-create class if it doesn't exist
    if (grade && section) {
      await pool.query(
        `INSERT INTO classes (school_id, grade, section) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [school_id, grade, section]
      )
    }

    const [studentPortalEnabled, parentPortalEnabled] = await Promise.all([
      schoolHasFeature(school_id, 'student-portal'),
      schoolHasFeature(school_id, 'parent-portal'),
    ])

    // Generate student temp password (only if the portal is enabled for this school)
    const tempPassword = studentPortalEnabled ? generateTempPassword(8) : null
    const passwordHash = tempPassword ? await hashPassword(tempPassword) : null

    const result = await pool.query(
      `INSERT INTO students
         (school_id, name, email, grade, section, phone, parent_name, parent_phone, parent_email,
          roll_number, school_roll_number, status, password_hash, password_changed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,FALSE)
       RETURNING *`,
      [school_id, name, email, grade, section, phone, parent_name, parent_phone, parent_email,
       roll_number, school_roll_number ?? null, passwordHash]
    )

    const student = result.rows[0]
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    // Send student welcome email (if student email provided)
    if (studentPortalEnabled && email && roll_number && tempPassword) {
      const schoolResult = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
      const schoolName = schoolResult.rows[0]?.name || 'Your School'
      sendStudentWelcomeEmail({
        to: email, name, schoolName, rollNumber: roll_number,
        tempPassword, loginUrl: `${appUrl}/student/login`,
      }).catch(console.error)
    }

    // Create/link parent account + send parent welcome email if parent_email provided.
    // Even when parent-portal is disabled, still link to an existing parent (e.g. a
    // sibling onboarded earlier while the flag was on) — only suppress creating a new one.
    if (parent_email || parent_phone) {
      await provisionParentAccount({
        parentEmail: parent_email, parentPhone: parent_phone, parentName: parent_name,
        studentId: student.id, schoolId: school_id, studentName: name, appUrl,
        allowCreate: parentPortalEnabled,
      })
    }

    invalidateCache(`classes:${school_id}`)
    return NextResponse.json(student, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create student' }, { status: 500 })
  }
}

// Create or link a parent account, sending welcome email only on first creation.
// allowCreate=false only links to an existing parent and never inserts a new row —
// used when parent-portal is disabled for the school.
async function provisionParentAccount({
  parentEmail, parentPhone, parentName, studentId, schoolId, studentName, appUrl, allowCreate
}: {
  parentEmail: string | null; parentPhone: string | null; parentName: string | null
  studentId: number; schoolId: number; studentName: string; appUrl: string; allowCreate: boolean
}) {
  try {
    const batchCache = new Map<string, number>()
    let parentHash: string | null = null
    let tempPassword: string | null = null
    if (allowCreate) {
      tempPassword = generateTempPassword(10)
      parentHash = await hashPassword(tempPassword)
    }

    const client = await pool.connect()
    let match: Awaited<ReturnType<typeof findOrCreateParent>>
    try {
      match = await findOrCreateParent(
        client, schoolId, { name: parentName, email: parentEmail, phone: parentPhone },
        parentHash, batchCache, allowCreate
      )
      if (match) await linkStudentParent(client, studentId, match.parentId)
    } finally {
      client.release()
    }

    if (match?.wasCreated && parentEmail && tempPassword) {
      const schoolResult = await pool.query('SELECT name FROM schools WHERE id = $1', [schoolId])
      const schoolName = schoolResult.rows[0]?.name || 'Your School'
      sendParentWelcomeEmail({
        to: parentEmail,
        parentName: parentName || parentEmail,
        studentName,
        schoolName,
        tempPassword,
        loginUrl: `${appUrl}/parent/login`,
      }).catch(console.error)
    }
  } catch (err) {
    console.error('[provisionParentAccount]', err)
  }
}
