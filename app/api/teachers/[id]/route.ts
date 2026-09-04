import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, generateTempPassword, requireFeeAccess } from '@/lib/auth'
import {
  sendStaffRemovedEmail, sendStaffReactivatedEmail, sendStaffContactChangedEmail,
} from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { findAutoAssignableSubjects, type ClassSubjectRow } from '@/lib/matchTeacher'
import { isValidName, NAME_INVALID_MESSAGE } from '@/lib/nameValidation'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      // Fetch the teacher's own school first so the tenant check can run
      // before any data (including password_hash, excluded below) leaves
      // the server — a teacher record is sensitive PII, not public data.
      const ownerRes = await pool.query('SELECT school_id FROM teachers WHERE id = $1', [id])
      if (ownerRes.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
      const access = await requireFeeAccess(ownerRes.rows[0].school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const result = await pool.query(
        `SELECT id, school_id, name, email, phone, subject, department, qualification, date_of_joining,
                staff_type, status, teaches_grades, employee_id, password_changed, removed_at, created_at
         FROM teachers WHERE id = $1`,
        [id]
      )
      if (result.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
      return NextResponse.json(result.rows[0])
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch teacher' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      const existingRes = await pool.query('SELECT email, phone, school_id, status, subject, teaches_grades, staff_type FROM teachers WHERE id = $1', [id])
      if (existingRes.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
      const existing = existingRes.rows[0]
      const access = await requireFeeAccess(existing.school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const body = await req.json()
      const { name, email, subject, phone, department, qualification, date_of_joining, staff_type, status, teaches_grades } = body
      if (typeof name === 'string' && name.trim() && !isValidName(name)) {
        return NextResponse.json({ error: `Name: ${NAME_INVALID_MESSAGE}` }, { status: 400 })
      }
      const becomingInactive = status === 'inactive' && existing.status !== 'inactive'
      // Restoring from EITHER the lighter inactive↔active pause or a full
      // removal — both count as "was logged out, needs a fresh credential to
      // get back in", per the same rule applied to reactivation after removal.
      const becomingActive = status === 'active' && existing.status !== 'active'

      const trimmedEmail = typeof email === 'string' ? email.trim() : email
      const emailChanged = !becomingActive && trimmedEmail && trimmedEmail.toLowerCase() !== (existing.email || '').toLowerCase()
      const trimmedPhone = typeof phone === 'string' ? phone.trim() : phone
      const phoneChanged = !becomingActive && trimmedPhone && trimmedPhone !== (existing.phone || '')

      if (emailChanged) {
        // Email is the teacher login identifier and must be globally unique —
        // checked with NO school_id filter (a same-school duplicate is just
        // as broken as a cross-school one: the login query picks one row by
        // recency and the other becomes permanently unreachable).
        const emailDup = await pool.query(
          `SELECT t.name, s.name AS school_name, t.school_id = $2 AS same_school FROM teachers t
           JOIN schools s ON s.id = t.school_id
           WHERE LOWER(t.email) = LOWER($1) AND t.id != $3 AND t.removed_at IS NULL`,
          [trimmedEmail, existing.school_id, id]
        )
        if (emailDup.rows.length > 0) {
          const dup = emailDup.rows[0]
          const error = dup.same_school
            ? `${trimmedEmail} is already used by ${dup.name} at this school.`
            : `${trimmedEmail} is already registered to ${dup.name} at ${dup.school_name}. That school must remove them before this email can be reused here.`
          return NextResponse.json({ error }, { status: 409 })
        }
      }

      if (phoneChanged) {
        const phoneDup = await pool.query(
          `SELECT name FROM teachers WHERE school_id = $1 AND phone = $2 AND id != $3 AND removed_at IS NULL`,
          [existing.school_id, trimmedPhone, id]
        )
        if (phoneDup.rows.length > 0) {
          return NextResponse.json({ error: `Phone ${trimmedPhone} already exists (${phoneDup.rows[0].name})` }, { status: 409 })
        }
      }

      // A new password is only issued on reactivation (login was actually
      // revoked) — a routine email/phone correction keeps the existing
      // password working and just notifies both people that the login
      // identifier changed, matching the same decision made for parents.
      const tempPassword = becomingActive ? generateTempPassword(10) : null
      const passwordHash = tempPassword ? await hashPassword(tempPassword) : null

      const result = await pool.query(
        `UPDATE teachers SET
          name          = COALESCE($1,  name),
          email         = COALESCE($2,  email),
          subject       = COALESCE($3,  subject),
          phone         = COALESCE($4,  phone),
          department    = COALESCE($5,  department),
          qualification = COALESCE($6,  qualification),
          date_of_joining = COALESCE($7, date_of_joining),
          staff_type    = COALESCE($8,  staff_type),
          status        = COALESCE($9,  status),
          teaches_grades = COALESCE($10, teaches_grades),
          password_hash   = COALESCE($12, password_hash),
          password_changed = CASE WHEN $12 IS NOT NULL THEN FALSE ELSE password_changed END,
          removed_at = CASE WHEN $9 = 'active' THEN NULL ELSE removed_at END
         WHERE id = $11
         RETURNING id, school_id, name, email, phone, subject, department, qualification,
                   date_of_joining, staff_type, status, teaches_grades, employee_id,
                   password_changed, removed_at, created_at`,
        [name, email, subject, phone, department, qualification, date_of_joining, staff_type, status, teaches_grades ?? null, id, passwordHash]
      )
      if (result.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

      const teacher = result.rows[0]
      const subjectChanged = subject !== undefined && (subject?.trim() || null) !== (existing.subject || null)
      const teachesGradesChanged = teaches_grades !== undefined && (teaches_grades?.trim() || null) !== (existing.teaches_grades || null)
      const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/login`

      // A deactivated teacher can't log in, so Class Management showing them
      // as still "assigned" to a subject is misleading — unlink them the same
      // way removal already does, so the subject correctly shows as needing a
      // teacher again. Reversible: Reactivate just flips status back; the
      // school admin re-assigns the subject explicitly.
      if (becomingInactive) {
        await pool.query('UPDATE class_subjects SET teacher_id = NULL WHERE teacher_id = $1', [id])
        await pool.query('UPDATE class_timetable SET teacher_id = NULL, is_manual = FALSE WHERE teacher_id = $1', [id])
        await pool.query('UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = $1', [id])
      }

      let cachedSchoolName = ''
      const getSchoolName = async (): Promise<string> => {
        if (cachedSchoolName) return cachedSchoolName
        const r = await pool.query('SELECT name FROM schools WHERE id = $1', [teacher.school_id])
        cachedSchoolName = (r.rows[0]?.name as string | undefined) || 'Your School'
        return cachedSchoolName
      }

      if (becomingActive && tempPassword) {
        if (teacher.email) {
          const name_ = await getSchoolName()
          sendStaffReactivatedEmail({ to: teacher.email, name: teacher.name, schoolName: name_, tempPassword, loginUrl }).catch(console.error)
        }
        if (teacher.phone) {
          const name_ = await getSchoolName()
          sendWhatsappMessage({
            schoolId: teacher.school_id, to: teacher.phone, templateName: 'staff_reactivated', recipientName: teacher.name,
            templateParams: { staff_name: teacher.name, school_name: name_, login: teacher.email || teacher.phone, temp_password: tempPassword, login_url: loginUrl },
          }).catch(console.error)
        }
      } else {
        // Routine contact-info correction — notify, don't reset. Sent to
        // BOTH the old and new address/number when changing that field, same
        // pattern as the parent contact-edit flow, since a login-identifier
        // change is security-relevant even without a password reset.
        if (emailChanged) {
          const name_ = await getSchoolName()
          const notify = (addr: string) =>
            sendStaffContactChangedEmail({ to: addr, name: teacher.name, schoolName: name_, field: 'email', newValue: teacher.email }).catch(console.error)
          notify(teacher.email)
          if (existing.email && existing.email.toLowerCase() !== teacher.email.toLowerCase()) notify(existing.email)
        }
        if (phoneChanged) {
          const name_ = await getSchoolName()
          const notifyPhone = (num: string) =>
            sendWhatsappMessage({
              schoolId: teacher.school_id, to: num, templateName: 'contact_info_changed', recipientName: teacher.name,
              templateParams: { name: teacher.name, school_name: name_, field: 'phone', new_value: teacher.phone },
            }).catch(console.error)
          notifyPhone(teacher.phone)
          if (existing.phone && existing.phone !== teacher.phone) notifyPhone(existing.phone)
        }
      }

      // Invalidate teacher list cache for this school
      const { invalidateCache } = await import('@/lib/responseCache')
      const schoolId = teacher.school_id
      invalidateCache(`teachers:${schoolId}:all`)
      invalidateCache(`teachers:${schoolId}:teaching`)
      invalidateCache(`teachers:${schoolId}:non_teaching`)

      // Re-run the same auto-assign scan onboarding does whenever the field
      // it matches on actually changed — a corrected subject spelling or a
      // widened grade range can newly match class subjects that sat
      // unassigned since class creation, same as a brand-new teacher would.
      if ((subjectChanged || teachesGradesChanged) && teacher.staff_type === 'teaching' && teacher.status === 'active' && teacher.subject) {
        const { rows: unfilled } = await pool.query<ClassSubjectRow>(
          `SELECT cs.id, cs.class_id, cs.subject_name, c.grade
           FROM class_subjects cs
           JOIN classes c ON c.id = cs.class_id
           WHERE c.school_id = $1 AND c.deleted_at IS NULL AND cs.teacher_id IS NULL`,
          [schoolId]
        )
        const matches = findAutoAssignableSubjects(
          { subject: teacher.subject, teaches_grades: teacher.teaches_grades },
          unfilled
        )
        for (const m of matches) {
          await pool.query('UPDATE class_subjects SET teacher_id = $1 WHERE id = $2', [teacher.id, m.id])
          await pool.query(
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
        if (matches.length > 0) invalidateCache(`health:${schoolId}`)
      }

      return NextResponse.json(teacher)
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update teacher' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/teachers/[id]?consequences=true  → preview impact before removal
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ownerRes = await pool.query('SELECT school_id FROM teachers WHERE id = $1', [id])
    if (ownerRes.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    const access = await requireFeeAccess(ownerRes.rows[0].school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url)

    // Preview mode: return what will be affected without deleting
    if (url.searchParams.get('consequences') === 'true') {
      try {
        const [subjectsRes, classTeacherRes, ttRes] = await Promise.all([
          pool.query(
            `SELECT cs.subject_name, c.grade, c.section
             FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
             WHERE cs.teacher_id = $1`, [id]),
          pool.query(
            `SELECT grade, section FROM classes WHERE class_teacher_id = $1`, [id]),
          pool.query(
            `SELECT DISTINCT ct.subject_name, c.grade, c.section, ct.day_of_week, ct.period_number
             FROM class_timetable ct JOIN classes c ON c.id = ct.class_id
             WHERE ct.teacher_id = $1 AND ct.is_break = false`, [id]),
        ])
        return NextResponse.json({
          subjects_teaching: subjectsRes.rows,
          class_teacher_of: classTeacherRes.rows,
          timetable_slots: ttRes.rows,
        })
      } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Failed to fetch consequences' }, { status: 500 })
      }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Null out all FK references (keep records for audit but unlink teacher)
      await client.query('UPDATE class_timetable SET teacher_id = NULL, is_manual = FALSE WHERE teacher_id = $1', [id])
      await client.query('UPDATE class_subjects SET teacher_id = NULL WHERE teacher_id = $1', [id])
      await client.query('UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = $1', [id])
      await client.query('UPDATE attendance SET marked_by_teacher_id = NULL WHERE marked_by_teacher_id = $1', [id])
      await client.query('UPDATE substitute_assignments SET original_teacher_id = NULL WHERE original_teacher_id = $1', [id])
      await client.query('UPDATE substitute_assignments SET substitute_teacher_id = NULL WHERE substitute_teacher_id = $1', [id])
      await client.query('UPDATE tasks SET teacher_id = NULL WHERE teacher_id = $1', [id])
      await client.query('UPDATE task_submissions SET reviewed_by = NULL WHERE reviewed_by = $1', [id])
      await client.query('UPDATE task_reminders SET sent_by = NULL WHERE sent_by = $1', [id])
      await client.query('UPDATE doubts SET answered_by = NULL WHERE answered_by = $1', [id])
      await client.query('UPDATE doubts SET resolved_by = NULL WHERE resolved_by = $1', [id])
      await client.query('UPDATE doubts SET faq_set_by = NULL WHERE faq_set_by = $1', [id])
      await client.query('UPDATE school_topic_progress SET covered_by = NULL WHERE covered_by = $1', [id])
      await client.query('UPDATE exam_records SET created_by = NULL WHERE created_by = $1', [id])
      await client.query('UPDATE exam_subjects SET teacher_id = NULL WHERE teacher_id = $1', [id])
      await client.query('UPDATE exam_subjects SET submitted_by = NULL WHERE submitted_by = $1', [id])
      await client.query('UPDATE exam_marks SET entered_by = NULL WHERE entered_by = $1', [id])
      await client.query('DELETE FROM teacher_unavailability WHERE teacher_id = $1', [id])
      await client.query('DELETE FROM leave_requests WHERE teacher_id = $1', [id])
      // Unlink rather than delete, same as every other reference above — a
      // removed teacher's notification history should stay intact for audit
      // purposes, not be destroyed just because this table alone used DELETE.
      await client.query('UPDATE notifications SET recipient_teacher_id = NULL WHERE recipient_teacher_id = $1', [id])
      await client.query('UPDATE notifications SET sender_teacher_id = NULL WHERE sender_teacher_id = $1', [id])

      // Soft-delete: mark as removed (keeps record in DB)
      const result = await client.query(
        `UPDATE teachers SET status = 'removed', removed_at = NOW() WHERE id = $1 AND status != 'removed'
         RETURNING id, school_id, name, email, phone, status, removed_at`,
        [id]
      )
      if (result.rowCount === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Teacher not found or already removed' }, { status: 404 })
      }

      // Invalidate cache
      const schoolId = result.rows[0].school_id
      const { invalidateCache } = await import('@/lib/responseCache')
      invalidateCache(`teachers:${schoolId}:all`)
      invalidateCache(`teachers:${schoolId}:teaching`)
      invalidateCache(`teachers:${schoolId}:non_teaching`)

      await client.query('COMMIT')

      const removedTeacher = result.rows[0]
      const schoolNameRes = await pool.query('SELECT name FROM schools WHERE id = $1', [schoolId])
      const schoolName = schoolNameRes.rows[0]?.name || 'Your School'
      if (removedTeacher.email) {
        sendStaffRemovedEmail({ to: removedTeacher.email, name: removedTeacher.name, schoolName }).catch(console.error)
      }
      if (removedTeacher.phone) {
        sendWhatsappMessage({
          schoolId, to: removedTeacher.phone, templateName: 'staff_removed', recipientName: removedTeacher.name,
          templateParams: { staff_name: removedTeacher.name, school_name: schoolName },
        }).catch(console.error)
      }

      return NextResponse.json({ message: 'Teacher removed', teacher: removedTeacher })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error(error)
      return NextResponse.json({ error: 'Failed to remove teacher' }, { status: 500 })
    } finally {
      client.release()
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
