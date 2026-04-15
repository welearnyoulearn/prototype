import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await pool.query(
      `SELECT t.*, c.grade AS class_teacher_grade, c.section AS class_teacher_section
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
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const { name, email, subject, phone, department, qualification, date_of_joining, staff_type, status, teaches_grades } = body

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
        teaches_grades = COALESCE($10, teaches_grades)
       WHERE id = $11 RETURNING *`,
      [name, email, subject, phone, department, qualification, date_of_joining, staff_type, status, teaches_grades ?? null, id]
    )
    if (result.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

    // Invalidate teacher list cache for this school
    const { invalidateCache } = await import('@/lib/responseCache')
    const schoolId = result.rows[0].school_id
    invalidateCache(`teachers:${schoolId}:all`)
    invalidateCache(`teachers:${schoolId}:teaching`)
    invalidateCache(`teachers:${schoolId}:non_teaching`)

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update teacher' }, { status: 500 })
  }
}

// GET /api/teachers/[id]?consequences=true  → preview impact before removal
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
      `UPDATE teachers SET status = 'removed', removed_at = NOW() WHERE id = $1 AND status != 'removed' RETURNING *`,
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
}
