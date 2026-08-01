import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, generateTempPassword, requireSchoolAdmin } from '@/lib/auth'
import { sendTeacherWelcomeEmail } from '@/lib/email'

function generateEmployeeId(schoolName: string): string {
  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10)
  const num = Math.floor(10000 + Math.random() * 90000)
  return `wlyl-tea-${slug}-${num}`
}

export async function POST(req: NextRequest) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { school_id, teachers } = await req.json()
    if (!school_id || !Array.isArray(teachers) || teachers.length === 0) {
      return NextResponse.json({ error: 'school_id and teachers array required' }, { status: 400 })
    }
    if (admin.schoolId !== Number(school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
    if (schoolRes.rows.length === 0) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }
    const schoolName = schoolRes.rows[0].name

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const inserted = []
      const errors: { row: number; message: string }[] = []
      // Two rows in the SAME upload sharing an email/phone previously slipped
      // through — the DB-lookup checks below only see rows already committed
      // from an EARLIER request, never siblings still being inserted in this
      // loop, so both would insert successfully. Track what's been accepted
      // so far in this batch and reject repeats the same way a real duplicate
      // would be rejected.
      const seenEmails = new Set<string>()
      const seenPhones = new Set<string>()

      for (let i = 0; i < teachers.length; i++) {
        const t = teachers[i]
        if (!t.name?.trim()) {
          errors.push({ row: i + 1, message: 'Name is required' })
          continue
        }

        const normPhone = t.phone?.trim() || ''
        const normEmail = t.email?.trim().toLowerCase() || ''

        if (normPhone && seenPhones.has(normPhone)) {
          errors.push({ row: i + 1, message: `Phone ${t.phone} is duplicated earlier in this same upload` })
          continue
        }
        if (normEmail && seenEmails.has(normEmail)) {
          errors.push({ row: i + 1, message: `${t.email.trim()} is duplicated earlier in this same upload` })
          continue
        }

        // Phone duplicate check within this school
        if (normPhone) {
          const dup = await client.query(
            'SELECT id, name FROM teachers WHERE school_id = $1 AND phone = $2',
            [school_id, normPhone]
          )
          if (dup.rows.length > 0) {
            errors.push({ row: i + 1, message: `Phone ${t.phone} already exists (${dup.rows[0].name})` })
            continue
          }
        }

        // Email is the teacher login identifier and must be unique across the
        // whole platform, not just this school — otherwise two schools' login
        // queries collide and one silently authenticates into the other's
        // account. An active teacher elsewhere has to be removed by their
        // current school before the same email can be reused here.
        if (normEmail) {
          const emailDup = await client.query(
            `SELECT t.id, t.name, s.name AS school_name FROM teachers t
             JOIN schools s ON s.id = t.school_id
             WHERE LOWER(t.email) = $1 AND t.removed_at IS NULL`,
            [normEmail]
          )
          if (emailDup.rows.length > 0) {
            const existing = emailDup.rows[0]
            errors.push({
              row: i + 1,
              message: `${t.email.trim()} is already registered to ${existing.name} at ${existing.school_name}. That school must remove them before this email can be reused here.`,
            })
            continue
          }
        }

        const employee_id = generateEmployeeId(schoolName)
        const email = t.email?.trim() || null
        // Same activation model as the single-add route: a temp password is
        // only generated when there's an email to send it to. Without one,
        // the account stays unactivated until a school admin resets it.
        const tempPassword = email ? generateTempPassword(10) : null
        const passwordHash = tempPassword ? await hashPassword(tempPassword) : null

        if (normPhone) seenPhones.add(normPhone)
        if (normEmail) seenEmails.add(normEmail)

        const res = await client.query(
          `INSERT INTO teachers
             (school_id, name, email, subject, phone, employee_id, department, qualification, date_of_joining, staff_type, teaches_grades, password_hash, password_changed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE)
           RETURNING id, school_id, name, email, subject, phone, employee_id, department,
                     qualification, date_of_joining, staff_type, teaches_grades, password_changed`,
          [
            school_id,
            t.name.trim(),
            email,
            t.subject?.trim() || null,
            t.phone?.trim() || null,
            employee_id,
            t.department?.trim() || null,
            t.qualification?.trim() || null,
            t.date_of_joining || null,
            t.staff_type?.toLowerCase() === 'non_teaching' ? 'non_teaching' : 'teaching',
            t.teaches_grades?.trim() || null,
            passwordHash,
          ]
        )
        const teacher = res.rows[0]
        inserted.push(teacher)

        if (email && tempPassword) {
          const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/login`
          sendTeacherWelcomeEmail({ to: email, name: teacher.name, schoolName, tempPassword, loginUrl }).catch(console.error)
        }
      }

      await client.query('COMMIT')
      return NextResponse.json({ inserted: inserted.length, teachers: inserted, errors }, { status: 201 })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Bulk insert failed' }, { status: 500 })
  }
}
