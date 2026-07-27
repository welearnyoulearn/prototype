import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, generateTempPassword, requireFeeAccess } from '@/lib/auth'
import { sendTeacherWelcomeEmail } from '@/lib/email'

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
        `SELECT t.id, t.school_id, t.name, t.email, t.phone, t.subject, t.department,
                t.qualification, t.date_of_joining, t.staff_type, t.status, t.teaches_grades,
                t.employee_id, t.password_changed, t.removed_at, t.created_at,
                c.grade AS class_teacher_grade, c.section AS class_teacher_section
         FROM teachers t
         LEFT JOIN classes c ON c.class_teacher_id = t.id
         WHERE t.id = $1`,
        [id]
      )
      if (result.rows.length === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
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
      const existingRes = await pool.query('SELECT email, school_id, status FROM teachers WHERE id = $1', [id])
      if (existingRes.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
      const existing = existingRes.rows[0]
      const access = await requireFeeAccess(existing.school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const body = await req.json()
      const { name, email, subject, phone, department, qualification, date_of_joining, staff_type, status, teaches_grades } = body
      const becomingInactive = status === 'inactive' && existing.status !== 'inactive'

      const trimmedEmail = typeof email === 'string' ? email.trim() : email
      const emailChanged = trimmedEmail && trimmedEmail.toLowerCase() !== (existing.email || '').toLowerCase()

      if (emailChanged) {
        // Same cross-school uniqueness rule as onboarding — email is the
        // teacher login identifier, so it can't be handed to an active
        // teacher elsewhere without them being removed there first.
        const emailDup = await pool.query(
          `SELECT t.name, s.name AS school_name FROM teachers t
           JOIN schools s ON s.id = t.school_id
           WHERE LOWER(t.email) = LOWER($1) AND t.school_id != $2 AND t.id != $3 AND t.removed_at IS NULL`,
          [trimmedEmail, existing.school_id, id]
        )
        if (emailDup.rows.length > 0) {
          const dup = emailDup.rows[0]
          return NextResponse.json({
            error: `${trimmedEmail} is already registered to ${dup.name} at ${dup.school_name}. That school must remove them before this email can be reused here.`,
          }, { status: 409 })
        }
      }

      // Changing the login email invalidates the old credentials — issue a
      // fresh temp password and email it to the new address, same as
      // onboarding, rather than silently repointing the account.
      const tempPassword = emailChanged ? generateTempPassword(10) : null
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
          password_changed = CASE WHEN $12 IS NOT NULL THEN FALSE ELSE password_changed END
         WHERE id = $11
         RETURNING id, school_id, name, email, phone, subject, department, qualification,
                   date_of_joining, staff_type, status, teaches_grades, employee_id,
                   password_changed, removed_at, created_at`,
        [name, email, subject, phone, department, qualification, date_of_joining, staff_type, status, teaches_grades ?? null, id, passwordHash]
      )
      if (result.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

      const teacher = result.rows[0]

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

      if (emailChanged && tempPassword) {
        const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [teacher.school_id])
        const schoolName = schoolRes.rows[0]?.name || 'Your School'
        const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/login`
        sendTeacherWelcomeEmail({ to: teacher.email, name: teacher.name, schoolName, tempPassword, loginUrl }).catch(console.error)
      }

      // Invalidate teacher list cache for this school
      const { invalidateCache } = await import('@/lib/responseCache')
      const schoolId = teacher.school_id
      invalidateCache(`teachers:${schoolId}:all`)
      invalidateCache(`teachers:${schoolId}:teaching`)
      invalidateCache(`teachers:${schoolId}:non_teaching`)

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
      await client.query('UPDATE syllabus_topics SET covered_by = NULL WHERE covered_by = $1', [id])
      await client.query('UPDATE exam_records SET created_by = NULL WHERE created_by = $1', [id])
      await client.query('UPDATE exam_subjects SET teacher_id = NULL WHERE teacher_id = $1', [id])
      await client.query('UPDATE exam_subjects SET submitted_by = NULL WHERE submitted_by = $1', [id])
      await client.query('UPDATE exam_marks SET entered_by = NULL WHERE entered_by = $1', [id])
      await client.query('DELETE FROM teacher_unavailability WHERE teacher_id = $1', [id])
      await client.query('DELETE FROM leave_requests WHERE teacher_id = $1', [id])
      await client.query('DELETE FROM notifications WHERE recipient_teacher_id = $1 OR sender_teacher_id = $1', [id])

      // Soft-delete: mark as removed (keeps record in DB)
      const result = await client.query(
        `UPDATE teachers SET status = 'removed', removed_at = NOW() WHERE id = $1 AND status != 'removed'
         RETURNING id, school_id, name, email, status, removed_at`,
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
      return NextResponse.json({ message: 'Teacher removed', teacher: result.rows[0] })
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
