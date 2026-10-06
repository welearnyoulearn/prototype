import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import {
  generateTempPassword, getPlatformSession, hashPortalPassword, requireFeeAccess, requireSchoolAdmin,
  revokePortalSessions, schoolHasFeature,
} from '@/lib/auth'
import {
  sendStaffRemovedEmail, sendStaffReactivatedEmail, sendStaffContactChangedEmail,
} from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { findAutoAssignableSubjects, findStaleAssignments, type ClassSubjectRow } from '@/lib/matchTeacher'
import { normalizeStaffInput, validateStaffStatus } from '@/lib/staffValidation'
import { invalidateCache } from '@/lib/responseCache'
import { canonicalStaffSubject, getStaffSubjectOptions } from '@/lib/staffSubjectOptions'

const EDITABLE_FIELDS = new Set([
  'name', 'email', 'subject', 'phone', 'department', 'qualification',
  'date_of_joining', 'staff_type', 'status', 'teaches_grades',
])
const UNIQUE_VIOLATION = '23505'
type TeacherRecord = {
  id: number; school_id: number; name: string; email: string; phone: string; subject: string | null
  department: string | null; qualification: string | null; date_of_joining: string | null
  staff_type: string; status: string; teaches_grades: string | null; employee_id?: string
  password_changed?: boolean; removed_at?: string | null; created_at?: string
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await getPlatformSession() && !await requireSchoolAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    try {
      // Fetch the teacher's own school first so the tenant check can run
      // before any data (including password_hash, excluded below) leaves
      // the server — a teacher record is sensitive PII, not public data.
      const ownerRes = await pool.query('SELECT school_id FROM teachers WHERE id = $1', [id])
      if (ownerRes.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
      const access = await requireFeeAccess(ownerRes.rows[0].school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (access.role !== 'platform_admin' && !(await schoolHasFeature(access.schoolId, 'staff'))) {
        return NextResponse.json({ error: 'Staff Management is not enabled for this school', code: 'FEATURE_DISABLED' }, { status: 403 })
      }

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
  if (!await getPlatformSession() && !await requireSchoolAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid teacher ID' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }
  const unknown = Object.keys(body).filter(key => !EDITABLE_FIELDS.has(key))
  if (unknown.length) return NextResponse.json({ error: `Unsupported fields: ${unknown.join(', ')}` }, { status: 400 })
  if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No changes supplied' }, { status: 400 })
  const statusError = validateStaffStatus(body.status)
  if (statusError) return NextResponse.json({ error: statusError }, { status: 422 })

  const client = await pool.connect()
  let teacher!: TeacherRecord
  let existing!: TeacherRecord
  let tempPassword: string | null = null
  let schoolName = 'Your School'
  try {
    await client.query('BEGIN')
    const existingRes = await client.query(
      `SELECT id, school_id, name, email, phone, subject, department, qualification, date_of_joining,
              staff_type, status, teaches_grades FROM teachers WHERE id = $1 FOR UPDATE`, [id],
    )
    if (!existingRes.rows[0]) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }
    existing = existingRes.rows[0]
    const access = await requireFeeAccess(existing.school_id, client)
    if (!access) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (access.role !== 'platform_admin' && !(await schoolHasFeature(access.schoolId, 'staff', client))) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Staff Management is not enabled for this school', code: 'FEATURE_DISABLED' }, { status: 403 })
    }

    const merged = normalizeStaffInput({
      name: body.name ?? existing.name,
      email: body.email ?? existing.email,
      subject: body.subject ?? existing.subject,
      phone: body.phone ?? existing.phone,
      department: body.department ?? existing.department,
      qualification: body.qualification ?? existing.qualification,
      date_of_joining: body.date_of_joining ?? existing.date_of_joining,
      staff_type: body.staff_type ?? existing.staff_type,
      teaches_grades: body.teaches_grades ?? existing.teaches_grades,
    })
    if (!merged.data) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: merged.errors.join('; ') }, { status: 422 })
    }
    const data = merged.data
    if (body.subject !== undefined && data.staff_type === 'teaching' && data.subject) {
      const canonical = canonicalStaffSubject(data.subject, await getStaffSubjectOptions(existing.school_id, client))
      if (!canonical) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Subject must be selected from the master syllabus or this school’s custom subjects' }, { status: 422 })
      }
      data.subject = canonical
    }
    const nextStatus = (body.status as 'active' | 'inactive' | undefined) ?? existing.status
    const becomingInactive = nextStatus === 'inactive' && existing.status !== 'inactive'
    const becomingActive = nextStatus === 'active' && existing.status !== 'active'
    const emailChanged = data.email !== String(existing.email || '').toLowerCase()
    const phoneChanged = data.phone !== String(existing.phone || '')
    const subjectChanged = data.subject !== (existing.subject || null)
    const gradesChanged = data.teaches_grades !== (existing.teaches_grades || null)

    const emailDup = await client.query(
      `SELECT t.name, s.name AS school_name FROM teachers t JOIN schools s ON s.id=t.school_id
       WHERE LOWER(t.email)=LOWER($1) AND t.id<>$2 AND t.removed_at IS NULL LIMIT 1`, [data.email, id],
    )
    if (emailDup.rows[0]) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `${data.email} is already registered to ${emailDup.rows[0].name} at ${emailDup.rows[0].school_name}` }, { status: 409 })
    }
    const phoneDup = await client.query(
      `SELECT name FROM teachers WHERE school_id=$1 AND phone=$2 AND id<>$3 AND removed_at IS NULL LIMIT 1`,
      [existing.school_id, data.phone, id],
    )
    if (phoneDup.rows[0]) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `Phone already belongs to ${phoneDup.rows[0].name}` }, { status: 409 })
    }

    if (becomingActive) tempPassword = generateTempPassword(10)
    const passwordHash = tempPassword ? await hashPortalPassword(tempPassword) : null
    const result = await client.query(
      `UPDATE teachers SET name=$1, email=$2, subject=$3, phone=$4, department=$5,
         qualification=$6, date_of_joining=$7, staff_type=$8, status=$9::varchar, teaches_grades=$10,
         password_hash=COALESCE($11,password_hash),
         password_changed=CASE WHEN $11 IS NOT NULL THEN FALSE ELSE password_changed END,
         removed_at=CASE WHEN $9::varchar='active' THEN NULL ELSE removed_at END
       WHERE id=$12
       RETURNING id, school_id, name, email, phone, subject, department, qualification,
                 date_of_joining, staff_type, status, teaches_grades, employee_id,
                 password_changed, removed_at, created_at`,
      [data.name, data.email, data.subject, data.phone, data.department, data.qualification,
        data.date_of_joining, data.staff_type, nextStatus, data.teaches_grades, passwordHash, id],
    )
    teacher = result.rows[0]

    if (becomingInactive) {
      await client.query('UPDATE class_subjects SET teacher_id=NULL WHERE teacher_id=$1', [id])
      await client.query('UPDATE classes SET class_teacher_id=NULL WHERE class_teacher_id=$1', [id])
    }
    if (becomingInactive || becomingActive) await revokePortalSessions('teacher', id, undefined, client)

    if ((subjectChanged || gradesChanged) && teacher.staff_type === 'teaching' && teacher.status === 'active') {
      // Release subjects the updated details no longer fit, so the teacher is
      // re-assigned purely from their current subject/grades.
      const { rows: current } = await client.query<ClassSubjectRow>(
        `SELECT cs.id, cs.class_id, cs.subject_name, c.grade FROM class_subjects cs
         JOIN classes c ON c.id=cs.class_id
         WHERE c.school_id=$1 AND c.deleted_at IS NULL AND cs.teacher_id=$2`, [teacher.school_id, id],
      )
      const stale = findStaleAssignments(
        { subject: existing.subject, teaches_grades: existing.teaches_grades },
        { subject: teacher.subject, teaches_grades: teacher.teaches_grades },
        current,
      )
      for (const row of stale) {
        await client.query('UPDATE class_subjects SET teacher_id=NULL WHERE id=$1 AND teacher_id=$2', [row.id, id])
        invalidateCache(`subjects:class:${row.class_id}`)
      }
      if (stale.length) invalidateCache(`health:${teacher.school_id}`)
    }
    if ((subjectChanged || gradesChanged) && teacher.staff_type === 'teaching' && teacher.status === 'active' && teacher.subject) {
      const { rows: unfilled } = await client.query<ClassSubjectRow>(
        `SELECT cs.id, cs.class_id, cs.subject_name, c.grade FROM class_subjects cs
         JOIN classes c ON c.id=cs.class_id
         WHERE c.school_id=$1 AND c.deleted_at IS NULL AND cs.teacher_id IS NULL`, [teacher.school_id],
      )
      const matches = findAutoAssignableSubjects({ subject: teacher.subject, teaches_grades: teacher.teaches_grades }, unfilled)
      for (const match of matches) {
        await client.query('UPDATE class_subjects SET teacher_id=$1 WHERE id=$2 AND teacher_id IS NULL', [id, match.id])
        invalidateCache(`subjects:class:${match.class_id}`)
      }
      if (matches.length) invalidateCache(`health:${teacher.school_id}`)
    }
    const school = await client.query<{ name: string }>('SELECT name FROM schools WHERE id=$1', [teacher.school_id])
    schoolName = school.rows[0]?.name || schoolName
    await client.query('COMMIT')

    invalidateCache(`teachers:${teacher.school_id}:all`)
    invalidateCache(`teachers:${teacher.school_id}:teaching`)
    invalidateCache(`teachers:${teacher.school_id}:non_teaching`)

    const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/login`
    if (becomingActive && tempPassword) {
      sendStaffReactivatedEmail({ to: teacher.email, name: teacher.name, schoolName, tempPassword, loginUrl }).catch(console.error)
      sendWhatsappMessage({ schoolId: teacher.school_id, to: teacher.phone, templateName: 'staff_reactivated', recipientName: teacher.name,
        templateParams: { staff_name: teacher.name, school_name: schoolName, login: teacher.email, temp_password: tempPassword, login_url: loginUrl } }).catch(console.error)
    } else {
      if (emailChanged) {
        sendStaffContactChangedEmail({ to: teacher.email, name: teacher.name, schoolName, field: 'email', newValue: teacher.email }).catch(console.error)
        if (existing.email && existing.email !== teacher.email) sendStaffContactChangedEmail({ to: existing.email, name: teacher.name, schoolName, field: 'email', newValue: teacher.email }).catch(console.error)
      }
      if (phoneChanged) {
        for (const phone of new Set([teacher.phone, existing.phone].filter(Boolean))) {
          sendWhatsappMessage({ schoolId: teacher.school_id, to: phone, templateName: 'contact_info_changed', recipientName: teacher.name,
            templateParams: { name: teacher.name, school_name: schoolName, field: 'phone', new_value: teacher.phone } }).catch(console.error)
        }
      }
    }
    return NextResponse.json({ ...teacher, ...(tempPassword ? { temporary_credential: { email: teacher.email, temp_password: tempPassword } } : {}) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) return NextResponse.json({ error: 'Email or phone is already in use' }, { status: 409 })
    console.error('[teachers/id PUT]', error)
    return NextResponse.json({ error: 'Failed to update teacher' }, { status: 500 })
  } finally {
    client.release()
  }
}

// GET /api/teachers/[id]?consequences=true  → preview impact before removal
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await getPlatformSession() && !await requireSchoolAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const ownerRes = await pool.query('SELECT school_id FROM teachers WHERE id = $1', [id])
    if (ownerRes.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    const access = await requireFeeAccess(ownerRes.rows[0].school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (access.role !== 'platform_admin' && !(await schoolHasFeature(access.schoolId, 'staff'))) {
      return NextResponse.json({ error: 'Staff Management is not enabled for this school', code: 'FEATURE_DISABLED' }, { status: 403 })
    }

    const url = new URL(req.url)

    // Preview mode: return what will be affected without deleting
    if (url.searchParams.get('consequences') === 'true') {
      try {
        const [subjectsRes, classTeacherRes] = await Promise.all([
          pool.query(
            `SELECT cs.subject_name, c.grade, c.section
             FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
             WHERE cs.teacher_id = $1`, [id]),
          pool.query(
            `SELECT grade, section FROM classes WHERE class_teacher_id = $1`, [id]),
        ])
        return NextResponse.json({
          subjects_teaching: subjectsRes.rows,
          class_teacher_of: classTeacherRes.rows,
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
      await client.query('UPDATE class_subjects SET teacher_id = NULL WHERE teacher_id = $1', [id])
      await client.query('UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = $1', [id])
      await client.query('UPDATE attendance SET marked_by_teacher_id = NULL WHERE marked_by_teacher_id = $1', [id])
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
      await revokePortalSessions('teacher', Number(id), undefined, client)

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
