import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateTempPassword, hashPortalPassword, requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'
import { sendTeacherWelcomeEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { findAutoAssignableSubjects, type ClassSubjectRow } from '@/lib/matchTeacher'
import { invalidateCache } from '@/lib/responseCache'
import { MAX_STAFF_BATCH, normalizeStaffInput, type NormalizedStaffInput } from '@/lib/staffValidation'
import { canonicalStaffSubject, getStaffSubjectOptions } from '@/lib/staffSubjectOptions'

const UNIQUE_VIOLATION = '23505'

function generateEmployeeId(schoolName: string): string {
  const slug = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'school'
  return `wlyl-tea-${slug}-${Math.floor(10000 + Math.random() * 90000)}`
}

type Credential = { employee_id: string; email: string; temp_password: string }

export async function POST(req: NextRequest) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { school_id?: unknown; teachers?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const schoolId = Number(body.school_id)
  if (!Number.isInteger(schoolId) || schoolId <= 0 || !Array.isArray(body.teachers) || body.teachers.length === 0) {
    return NextResponse.json({ error: 'A valid school_id and non-empty teachers array are required' }, { status: 400 })
  }
  if (admin.schoolId !== schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await schoolHasFeature(schoolId, 'staff'))) {
    return NextResponse.json({ error: 'Staff Management is not enabled for this school', code: 'FEATURE_DISABLED', feature: 'staff' }, { status: 403 })
  }
  if (body.teachers.length > MAX_STAFF_BATCH) {
    return NextResponse.json({ error: `A maximum of ${MAX_STAFF_BATCH} staff rows can be onboarded at once` }, { status: 413 })
  }

  const normalized: NormalizedStaffInput[] = []
  const validationErrors: { row: number; message: string }[] = []
  for (let i = 0; i < body.teachers.length; i++) {
    const result = normalizeStaffInput((body.teachers[i] ?? {}) as Record<string, unknown>)
    if (!result.data) validationErrors.push({ row: i + 1, message: result.errors.join('; ') })
    else normalized.push(result.data)
  }
  if (validationErrors.length) {
    return NextResponse.json({ error: 'Fix all invalid rows before onboarding', inserted: 0, teachers: [], credentials: [], errors: validationErrors }, { status: 422 })
  }

  const subjectOptions = await getStaffSubjectOptions(schoolId)
  normalized.forEach((row, i) => {
    if (row.staff_type !== 'teaching' || !row.subject) return
    const canonical = canonicalStaffSubject(row.subject, subjectOptions)
    if (!canonical) validationErrors.push({ row: i + 1, message: 'Subject must be selected from the master syllabus or this school’s custom subjects' })
    else row.subject = canonical
  })
  if (validationErrors.length) {
    return NextResponse.json({ error: 'Fix all invalid rows before onboarding', inserted: 0, teachers: [], credentials: [], errors: validationErrors }, { status: 422 })
  }

  const seenEmails = new Map<string, number>()
  const seenPhones = new Map<string, number>()
  normalized.forEach((row, i) => {
    const priorEmail = seenEmails.get(row.email)
    const priorPhone = seenPhones.get(row.phone)
    if (priorEmail) validationErrors.push({ row: i + 1, message: `Email duplicates row ${priorEmail}` })
    if (priorPhone) validationErrors.push({ row: i + 1, message: `Phone duplicates row ${priorPhone}` })
    seenEmails.set(row.email, i + 1)
    seenPhones.set(row.phone, i + 1)
  })
  if (validationErrors.length) {
    return NextResponse.json({ error: 'Duplicate values found in the upload', inserted: 0, teachers: [], credentials: [], errors: validationErrors }, { status: 422 })
  }

  const schoolRes = await pool.query<{ name: string }>('SELECT name FROM schools WHERE id = $1', [schoolId])
  if (!schoolRes.rows[0]) return NextResponse.json({ error: 'School not found' }, { status: 404 })
  const schoolName = schoolRes.rows[0].name

  const [phoneDupRes, emailDupRes] = await Promise.all([
    pool.query<{ name: string; phone: string }>(
      'SELECT name, phone FROM teachers WHERE school_id = $1 AND phone = ANY($2) AND removed_at IS NULL',
      [schoolId, normalized.map(t => t.phone)],
    ),
    pool.query<{ name: string; email: string; school_name: string }>(
      `SELECT t.name, t.email, s.name AS school_name FROM teachers t JOIN schools s ON s.id = t.school_id
       WHERE LOWER(t.email) = ANY($1) AND t.removed_at IS NULL`,
      [normalized.map(t => t.email)],
    ),
  ])
  const phoneDupMap = new Map(phoneDupRes.rows.map(r => [r.phone, r.name]))
  const emailDupMap = new Map(emailDupRes.rows.map(r => [r.email.toLowerCase(), r]))
  const duplicateErrors: { row: number; message: string }[] = []
  normalized.forEach((t, i) => {
    if (phoneDupMap.has(t.phone)) duplicateErrors.push({ row: i + 1, message: `Phone already belongs to ${phoneDupMap.get(t.phone)}` })
    const existing = emailDupMap.get(t.email)
    if (existing) duplicateErrors.push({ row: i + 1, message: `Email is already registered to ${existing.name} at ${existing.school_name}` })
  })
  if (duplicateErrors.length) {
    return NextResponse.json({ error: 'No staff were onboarded because duplicate records exist', inserted: 0, teachers: [], credentials: [], errors: duplicateErrors }, { status: 409 })
  }

  const tempPasswords = normalized.map(() => generateTempPassword(10))
  const passwordHashes = await Promise.all(tempPasswords.map(password => hashPortalPassword(password)))
  const client = await pool.connect()
  const inserted: Record<string, unknown>[] = []
  const credentials: Credential[] = []
  try {
    await client.query('BEGIN')
    for (let i = 0; i < normalized.length; i++) {
      const t = normalized[i]
      let teacher: Record<string, unknown> | null = null
      for (let attempt = 0; attempt < 20 && !teacher; attempt++) {
        const employeeId = generateEmployeeId(schoolName)
        await client.query('SAVEPOINT employee_id_retry')
        try {
          const result = await client.query(
            `INSERT INTO teachers
               (school_id, name, email, subject, phone, employee_id, department, qualification,
                date_of_joining, staff_type, teaches_grades, password_hash, password_changed)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE)
             RETURNING id, school_id, name, email, subject, phone, employee_id, department,
                       qualification, date_of_joining, staff_type, teaches_grades, status,
                       password_changed, removed_at, created_at`,
            [schoolId, t.name, t.email, t.subject, t.phone, employeeId, t.department, t.qualification,
              t.date_of_joining, t.staff_type, t.teaches_grades, passwordHashes[i]],
          )
          teacher = result.rows[0]
          await client.query('RELEASE SAVEPOINT employee_id_retry')
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT employee_id_retry')
          const pgError = error as { code?: string; constraint?: string }
          if (pgError.code === UNIQUE_VIOLATION && pgError.constraint === 'idx_teachers_school_employee_id_unique') continue
          throw error
        }
      }
      if (!teacher) throw new Error('Could not generate a unique employee ID')
      inserted.push(teacher)
      credentials.push({ employee_id: String(teacher.employee_id), email: t.email, temp_password: tempPasswords[i] })

      if (t.staff_type === 'teaching' && t.subject) {
        const { rows: unfilled } = await client.query<ClassSubjectRow>(
          `SELECT cs.id, cs.class_id, cs.subject_name, c.grade
           FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
           WHERE c.school_id = $1 AND c.deleted_at IS NULL AND cs.teacher_id IS NULL`,
          [schoolId],
        )
        const matches = findAutoAssignableSubjects({ subject: t.subject, teaches_grades: t.teaches_grades }, unfilled)
        for (const match of matches) {
          await client.query('UPDATE class_subjects SET teacher_id = $1 WHERE id = $2 AND teacher_id IS NULL', [teacher.id, match.id])
          invalidateCache(`subjects:class:${match.class_id}`)
        }
        if (matches.length) invalidateCache(`health:${schoolId}`)
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    const pgError = error as { code?: string }
    if (pgError.code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: 'Another request created a staff record with the same email, phone or employee ID. No rows were saved.', inserted: 0, teachers: [], credentials: [], errors: [] }, { status: 409 })
    }
    console.error('[teachers/bulk]', error)
    return NextResponse.json({ error: 'Staff onboarding failed. No rows were saved.' }, { status: 500 })
  } finally {
    client.release()
  }

  invalidateCache(`teachers:${schoolId}:all`)
  invalidateCache(`teachers:${schoolId}:teaching`)
  invalidateCache(`teachers:${schoolId}:non_teaching`)
  const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/login`
  inserted.forEach((teacher, i) => {
    const row = normalized[i]
    sendTeacherWelcomeEmail({ to: row.email, name: String(teacher.name), schoolName, tempPassword: tempPasswords[i], loginUrl }).catch(console.error)
    sendWhatsappMessage({
      schoolId, to: row.phone, templateName: 'staff_credentials', recipientName: String(teacher.name),
      templateParams: { staff_name: String(teacher.name), school_name: schoolName, login: row.email, temp_password: tempPasswords[i], login_url: loginUrl },
    }).catch(console.error)
  })

  return NextResponse.json({ inserted: inserted.length, teachers: inserted, credentials, errors: [] }, { status: 201 })
}
