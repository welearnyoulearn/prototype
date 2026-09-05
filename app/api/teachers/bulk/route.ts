import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, generateTempPassword, requireSchoolAdmin } from '@/lib/auth'
import { sendTeacherWelcomeEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { findAutoAssignableSubjects, type ClassSubjectRow } from '@/lib/matchTeacher'
import { invalidateCache } from '@/lib/responseCache'
import { isValidName, NAME_INVALID_MESSAGE } from '@/lib/nameValidation'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[\d\s\-()[\]]{7,15}$/

// Postgres unique-violation error code — raised by the partial unique indexes
// on (LOWER(email)) and (school_id, phone) added in lib/db.ts. Those indexes
// are the only thing that actually closes the TOCTOU race between the
// SELECT-based dup checks below and the INSERT (two near-simultaneous
// requests could both pass the SELECT); this catch turns that rare conflict
// into a normal per-row error instead of a 500.
const UNIQUE_VIOLATION = '23505'

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

    // Batch the dup lookups up front (one query per dimension) instead of
    // querying per-row inside the loop — for a 200-row import that was ~400
    // sequential round-trips. This also shrinks the window between "checked"
    // and "inserted" for every row, narrowing the TOCTOU race the DB unique
    // indexes now guard against anyway.
    const phones = Array.from(new Set(
      teachers.map(t => t.phone?.trim()).filter((p): p is string => !!p)
    ))
    const emails = Array.from(new Set(
      teachers.map(t => t.email?.trim().toLowerCase()).filter((e): e is string => !!e)
    ))

    const [phoneDupRes, emailDupRes] = await Promise.all([
      phones.length
        ? pool.query<{ name: string; phone: string }>(
            'SELECT name, phone FROM teachers WHERE school_id = $1 AND phone = ANY($2) AND removed_at IS NULL',
            [school_id, phones]
          )
        : Promise.resolve({ rows: [] as { name: string; phone: string }[] }),
      emails.length
        ? pool.query<{ name: string; email: string; school_name: string }>(
            `SELECT t.name, t.email, s.name AS school_name FROM teachers t
             JOIN schools s ON s.id = t.school_id
             WHERE LOWER(t.email) = ANY($1) AND t.removed_at IS NULL`,
            [emails]
          )
        : Promise.resolve({ rows: [] as { name: string; email: string; school_name: string }[] }),
    ])
    const phoneDupMap = new Map(phoneDupRes.rows.map(r => [r.phone, r.name]))
    const emailDupMap = new Map(emailDupRes.rows.map(r => [r.email.toLowerCase(), r]))

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const inserted = []
      const errors: { row: number; message: string }[] = []
      // Two rows in the SAME upload sharing an email/phone previously slipped
      // through — the batched lookups above only see rows already committed
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
        if (!isValidName(t.name)) {
          errors.push({ row: i + 1, message: `${t.name.trim()}: ${NAME_INVALID_MESSAGE}` })
          continue
        }
        if (!t.phone?.trim()) {
          errors.push({ row: i + 1, message: 'Phone is required' })
          continue
        }

        const normPhone = t.phone?.trim() || ''
        const normEmail = t.email?.trim().toLowerCase() || ''

        // Format re-validation server-side — the manual/CSV/xlsx onboarding
        // UI already enforces this, but a direct API call bypasses client
        // checks entirely. Without this, a malformed email would still get a
        // password generated and a send attempt made (which fails silently,
        // fire-and-forget), leaving a permanently unusable account.
        if (normEmail && !EMAIL_RE.test(normEmail)) {
          errors.push({ row: i + 1, message: `"${t.email}" is not a valid email address` })
          continue
        }
        if (normPhone && !PHONE_RE.test(normPhone)) {
          errors.push({ row: i + 1, message: `"${t.phone}" is not a valid phone number` })
          continue
        }

        if (normPhone && seenPhones.has(normPhone)) {
          errors.push({ row: i + 1, message: `Phone ${t.phone} is duplicated earlier in this same upload` })
          continue
        }
        if (normEmail && seenEmails.has(normEmail)) {
          errors.push({ row: i + 1, message: `${t.email.trim()} is duplicated earlier in this same upload` })
          continue
        }

        // Phone duplicate check within this school
        if (normPhone && phoneDupMap.has(normPhone)) {
          errors.push({ row: i + 1, message: `Phone ${t.phone} already exists (${phoneDupMap.get(normPhone)})` })
          continue
        }

        // Email is the teacher login identifier and must be unique across the
        // whole platform, not just this school — otherwise two schools' login
        // queries collide and one silently authenticates into the other's
        // account. An active teacher elsewhere has to be removed by their
        // current school before the same email can be reused here.
        if (normEmail && emailDupMap.has(normEmail)) {
          const existing = emailDupMap.get(normEmail)!
          errors.push({
            row: i + 1,
            message: `${t.email.trim()} is already registered to ${existing.name} at ${existing.school_name}. That school must remove them before this email can be reused here.`,
          })
          continue
        }

        const email = t.email?.trim() || null
        // Same activation model as the single-add route: a temp password is
        // only generated when there's an email to send it to. Without one,
        // the account stays unactivated until a school admin resets it.
        const tempPassword = email ? generateTempPassword(10) : null
        const passwordHash = tempPassword ? await hashPassword(tempPassword) : null

        // employee_id is a random 5-digit suffix with no natural uniqueness
        // guarantee — retry on collision against the DB unique index rather
        // than trusting the random draw not to repeat (birthday-paradox risk
        // grows fast once a school has a few hundred staff).
        let teacher: Record<string, unknown> | null = null
        for (let attempt = 0; attempt < 5 && !teacher; attempt++) {
          const employee_id = generateEmployeeId(schoolName)
          try {
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
                normPhone || null,
                employee_id,
                t.department?.trim() || null,
                t.qualification?.trim() || null,
                t.date_of_joining || null,
                t.staff_type?.toLowerCase() === 'non_teaching' ? 'non_teaching' : 'teaching',
                t.teaches_grades?.trim() || null,
                passwordHash,
              ]
            )
            teacher = res.rows[0]
          } catch (err: unknown) {
            const pgErr = err as { code?: string; constraint?: string }
            if (pgErr.code !== UNIQUE_VIOLATION) throw err
            // employee_id collision: loop and try a new random suffix.
            // email/phone collision here means a same-batch race the seen
            // sets above didn't already reject — treat as a normal dup error.
            if (pgErr.constraint === 'idx_teachers_school_employee_id_unique') continue
            errors.push({ row: i + 1, message: `${t.name.trim()}: duplicate email or phone (conflict detected on save)` })
            break
          }
        }
        if (!teacher) {
          if (!errors.some(e => e.row === i + 1)) {
            errors.push({ row: i + 1, message: `${t.name.trim()}: could not generate a unique employee ID, please retry` })
          }
          continue
        }

        inserted.push(teacher)
        if (normPhone) seenPhones.add(normPhone)
        if (normEmail) seenEmails.add(normEmail)

        // Auto-fill any class subjects at this school that were left
        // unassigned (no teacher matched at class-creation time) but whose
        // subject name matches this newly-onboarded teacher, within the
        // grades they're eligible to teach. Mirrors the same auto-assign
        // logic POST /api/classes runs at class-creation time — this is the
        // other direction: teacher arrives after the class already existed.
        if (teacher.staff_type === 'teaching' && teacher.subject) {
          const { rows: unfilled } = await client.query<ClassSubjectRow>(
            `SELECT cs.id, cs.class_id, cs.subject_name, c.grade
             FROM class_subjects cs
             JOIN classes c ON c.id = cs.class_id
             WHERE c.school_id = $1 AND c.deleted_at IS NULL AND cs.teacher_id IS NULL`,
            [school_id]
          )
          const matches = findAutoAssignableSubjects(
            { subject: teacher.subject as string, teaches_grades: teacher.teaches_grades as string | null },
            unfilled
          )
          for (const m of matches) {
            await client.query('UPDATE class_subjects SET teacher_id = $1 WHERE id = $2', [teacher.id, m.id])
            // Same conflict-safe propagation as POST /api/classes/[id]/subjects —
            // only fill an existing timetable slot for this subject if doing so
            // wouldn't double-book the teacher at the same day/period elsewhere.
            await client.query(
              `UPDATE class_timetable ct
               SET teacher_id = $1
               WHERE ct.class_id = $2 AND ct.subject_name = $3 AND ct.is_break = FALSE
                 AND ct.teacher_id IS DISTINCT FROM $1
                 AND NOT EXISTS (
                   SELECT 1 FROM class_timetable other
                   WHERE other.school_id = ct.school_id AND other.class_id != ct.class_id
                     AND other.day_of_week = ct.day_of_week AND other.period_number = ct.period_number
                     AND other.teacher_id = $1 AND other.is_break = FALSE
                 )`,
              [teacher.id, m.class_id, m.subject_name]
            )
            invalidateCache(`subjects:class:${m.class_id}`)
            invalidateCache(`timetable:class:${m.class_id}`)
          }
          if (matches.length > 0) invalidateCache(`health:${school_id}`)
        }

        // Teacher login is email-only today (/api/teacher/auth/login never
        // checks employee_id) — WhatsApp is only worth sending when there's
        // an actual email to log in with, same as why tempPassword itself is
        // only generated when email is present, a few lines up.
        if (tempPassword && email) {
          const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/login`
          sendTeacherWelcomeEmail({ to: email, name: teacher.name as string, schoolName, tempPassword, loginUrl }).catch(console.error)
          if (normPhone) {
            sendWhatsappMessage({
              schoolId: Number(school_id), to: normPhone, templateName: 'staff_credentials', recipientName: teacher.name as string,
              templateParams: {
                staff_name: teacher.name as string, school_name: schoolName,
                login: email, temp_password: tempPassword, login_url: loginUrl,
              },
            }).catch(console.error)
          }
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
