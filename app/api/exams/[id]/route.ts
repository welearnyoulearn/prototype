import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, requireExamsAdmin, examNotificationEnabled } from '@/lib/examsAuth'
import { findExamConflicts } from '@/lib/examConflicts'

// GET /api/exams/[id]?school_id= — full exam detail with subjects + marks summary
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const school_id = req.nextUrl.searchParams.get('school_id')
    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params

    // LEFT JOIN teachers — created_by is nullable (admin-created exams have
    // no teacher creator), and an inner JOIN here previously made every
    // admin-created exam 404 for everyone, permanently. created_by_name
    // falls back to the admin's own users.full_name, then a generic label.
    const { rows: [exam] } = await pool.query(`
      SELECT e.*,
        TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
        c.grade, c.section, c.class_teacher_id,
        COALESCE(t.name, u.full_name, 'School Admin') AS created_by_name,
        at.name AS assigned_teacher_name
      FROM exam_records e
      JOIN classes c ON c.id = e.class_id
      LEFT JOIN teachers t ON t.id = e.created_by
      LEFT JOIN users u ON u.id = e.created_by_admin_id
      LEFT JOIN teachers at ON at.id = e.assigned_teacher_id
      WHERE e.id = $1 AND e.school_id = $2
    `, [id, actor.schoolId])
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    // Parent/student callers only get syllabus/instructions when the exam
    // actually applies to them — mirrors the marks-route self/child checks
    // rather than trusting the URL alone. Everyone else (admin, any teacher)
    // keeps full detail; the narrower per-role read scoping lives in the
    // student/parent-specific list endpoints (GET /api/students/[id]/exams),
    // this route is the "open one exam" detail view used from those lists.
    if (actor.kind === 'parent') delete exam.syllabus
    if (actor.kind === 'parent') delete exam.instructions

    const { rows: subjects } = await pool.query(`
      SELECT es.*, t.name AS teacher_name_current
      FROM exam_subjects es
      LEFT JOIN teachers t ON t.id = es.teacher_id
      WHERE es.exam_id = $1
      ORDER BY es.subject_name
    `, [id])

    const { rows: subjectStats } = await pool.query(`
      SELECT
        em.subject_name,
        COUNT(DISTINCT em.student_id)::int AS entries,
        ROUND(AVG(em.marks_obtained) FILTER (WHERE NOT em.is_absent), 1) AS avg_marks,
        COUNT(DISTINCT CASE WHEN em.is_absent THEN em.student_id END)::int AS absent_count
      FROM exam_marks em
      WHERE em.exam_id = $1
      GROUP BY em.subject_name
    `, [id])

    const statsMap: Record<string, { entries: number; avg_marks: number | null; absent_count: number }> = {}
    subjectStats.forEach(s => { statsMap[s.subject_name] = s })

    return NextResponse.json({
      ...exam,
      subjects: subjects.map(s => ({
        ...s,
        teacher_name: s.teacher_name_current || s.teacher_name,
        stats: statsMap[s.subject_name] ?? null,
      })),
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Resolves the student ids an exam currently applies to — whole class roster
// for student_scope='all', or the exam_applicable_students list otherwise.
// Shared by the reschedule notification and conflict-check paths below.
async function affectedStudentIds(examId: number, classId: number, studentScope: string, schoolId: number): Promise<number[]> {
  if (studentScope === 'specific') {
    const { rows } = await pool.query(`SELECT student_id FROM exam_applicable_students WHERE exam_id = $1`, [examId])
    return rows.map(r => r.student_id)
  }
  const { rows: [cls] } = await pool.query(`SELECT grade, section FROM classes WHERE id = $1`, [classId])
  if (!cls) return []
  const { rows } = await pool.query(
    `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
    [schoolId, cls.grade, cls.section]
  )
  return rows.map(r => r.id)
}

async function notifyExamChange(
  examId: number, classId: number, schoolId: number, studentIds: number[],
  classTeacherId: number | null, assignedTeacherId: number | null,
  examName: string, title: string, message: string
) {
  const data = JSON.stringify({ exam_id: examId, class_id: classId })
  for (const sid of studentIds) {
    try {
      await pool.query(
        `INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data) VALUES ($1, $2, 'exam_updated', $3, $4, $5)`,
        [schoolId, sid, title, message, data]
      )
    } catch { /* non-critical */ }
  }
  if (studentIds.length > 0) {
    try {
      const { rows: parentLinks } = await pool.query(
        `SELECT DISTINCT parent_id FROM student_parents WHERE student_id = ANY($1::int[])`, [studentIds]
      )
      for (const link of parentLinks) {
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data) VALUES ($1, $2, 'exam_updated', $3, $4, $5)`,
          [schoolId, link.parent_id, title, message, data]
        )
      }
    } catch { /* non-critical */ }
  }
  // Dedup: a teacher who is both the class teacher and the assigned
  // invigilator (a common case) must only ever get one notification, not one
  // per role.
  for (const tid of new Set([classTeacherId, assignedTeacherId].filter(Boolean))) {
    try {
      await pool.query(
        `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data) VALUES ($1, $2, 'exam_updated', $3, $4, $5)`,
        [schoolId, tid, title, message, data]
      )
    } catch { /* non-critical */ }
  }
}

// PUT /api/exams/[id] — edit exam details, including reschedule. Admin-only:
// this is the "school admin who created the exam can edit its details" rule
// from the v2 flow — once an exam exists, only admin staff (not the
// class/subject teachers) change its name/date/type/passing_pct. Blocked
// once teacher review or release has happened, matching the old "no editing
// after publish" rule extended to the new intermediate stage too.
//
// v3: also accepts the schedule-detail fields, re-runs conflict detection
// when the date/time actually changes, and fires 'exam_updated' notifications
// to every affected student/parent/teacher for a date/time/room/instructions
// change — none of that existed before (edits were previously silent).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id } = await params
    const body = await req.json()
    const {
      school_id, exam_name, exam_type, academic_year, exam_date,
      start_time, end_time, duration_minutes, room, syllabus, instructions,
      assigned_teacher_id, passing_pct,
    } = body

    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      'SELECT e.*, c.class_teacher_id FROM exam_records e JOIN classes c ON c.id = e.class_id WHERE e.id = $1 AND e.school_id = $2', [id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (exam.status === 'teacher_reviewed' || exam.status === 'released') {
      return NextResponse.json({ error: 'Cannot edit an exam that has already been reviewed or released' }, { status: 400 })
    }
    if (exam.status === 'cancelled') {
      return NextResponse.json({ error: 'Cannot edit a cancelled exam' }, { status: 400 })
    }
    if (exam_type && !['unit_test', 'mid_term', 'final_exam', 'practical'].includes(exam_type)) {
      return NextResponse.json({ error: 'Invalid exam_type' }, { status: 400 })
    }
    if (start_time && end_time && start_time >= end_time) {
      return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 })
    }

    const newDate = exam_date || exam.exam_date
    const newStart = start_time !== undefined ? start_time : exam.start_time
    const newEnd = end_time !== undefined ? end_time : exam.end_time
    const dateChanged = exam_date && exam_date !== (exam.exam_date ? new Date(exam.exam_date).toISOString().slice(0, 10) : null)
    const norm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : null)
    const timeChanged = (start_time !== undefined && norm(start_time) !== norm(exam.start_time)) || (end_time !== undefined && norm(end_time) !== norm(exam.end_time))
    const roomChanged = room !== undefined && room !== exam.room
    const instructionsChanged = instructions !== undefined && instructions !== exam.instructions

    const studentIds = (dateChanged || timeChanged || roomChanged || instructionsChanged)
      ? await affectedStudentIds(exam.id, exam.class_id, exam.student_scope, actor.schoolId)
      : []

    // Conflict check only when the date/time is actually moving — editing
    // unrelated fields (name, syllabus, passing_pct) never needs one.
    if ((dateChanged || timeChanged) && newDate) {
      const conflicts = await findExamConflicts(pool, actor.schoolId, studentIds, newDate, newStart ?? null, newEnd ?? null, exam.id)
      if (conflicts.length > 0) {
        return NextResponse.json({
          error: '⚠️ Exam Schedule Conflict – Selected students already have an exam at this time.',
          conflicts,
        }, { status: 409 })
      }
    }

    const { rows: [updated] } = await pool.query(`
      UPDATE exam_records SET
        exam_name = COALESCE($3, exam_name),
        exam_type = COALESCE($4, exam_type),
        academic_year = COALESCE($5, academic_year),
        exam_date = COALESCE($6, exam_date),
        start_time = CASE WHEN $7::boolean THEN $8::time ELSE start_time END,
        end_time = CASE WHEN $9::boolean THEN $10::time ELSE end_time END,
        duration_minutes = COALESCE($11, duration_minutes),
        room = CASE WHEN $12::boolean THEN $13 ELSE room END,
        syllabus = CASE WHEN $14::boolean THEN $15 ELSE syllabus END,
        instructions = CASE WHEN $16::boolean THEN $17 ELSE instructions END,
        assigned_teacher_id = CASE WHEN $18::boolean THEN $19::int ELSE assigned_teacher_id END,
        passing_pct = COALESCE($20, passing_pct),
        updated_at = NOW()
      WHERE id = $1 AND school_id = $2
      RETURNING *, TO_CHAR(exam_date, 'YYYY-MM-DD') AS exam_date
    `, [
      id, actor.schoolId, exam_name || null, exam_type || null, academic_year || null, exam_date || null,
      start_time !== undefined, start_time ?? null,
      end_time !== undefined, end_time ?? null,
      duration_minutes ?? null,
      room !== undefined, room ?? null,
      syllabus !== undefined, syllabus ?? null,
      instructions !== undefined, instructions ?? null,
      assigned_teacher_id !== undefined, assigned_teacher_id ?? null,
      passing_pct ?? null,
    ])

    const scheduleChangeNotifsOn = (dateChanged || timeChanged || roomChanged || instructionsChanged)
      ? await examNotificationEnabled(actor.schoolId, 'notify_schedule_change')
      : false

    if (scheduleChangeNotifsOn && (dateChanged || timeChanged)) {
      const oldDateLabel = exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : 'an unscheduled date'
      const newDateLabel = newDate ? new Date(newDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'a date to be announced'
      const timeLabel = newStart ? ` at ${newStart}` : ''
      await notifyExamChange(
        exam.id, exam.class_id, actor.schoolId, studentIds, exam.class_teacher_id, updated.assigned_teacher_id,
        exam.exam_name, `${exam.exam_name} rescheduled`,
        `🔄 ${exam.exam_name} has been moved from ${oldDateLabel} to ${newDateLabel}${timeLabel}.`
      )
    } else if (scheduleChangeNotifsOn && roomChanged) {
      await notifyExamChange(
        exam.id, exam.class_id, actor.schoolId, studentIds, exam.class_teacher_id, updated.assigned_teacher_id,
        exam.exam_name, `${exam.exam_name} — venue changed`,
        `${exam.exam_name}'s room has been changed to ${room || 'TBA'}.`
      )
    } else if (scheduleChangeNotifsOn && instructionsChanged) {
      await notifyExamChange(
        exam.id, exam.class_id, actor.schoolId, studentIds, exam.class_teacher_id, updated.assigned_teacher_id,
        exam.exam_name, `${exam.exam_name} — instructions updated`,
        `The instructions for ${exam.exam_name} have been updated. Please review them before the exam.`
      )
    }

    return NextResponse.json(updated)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/exams/[id] — admin-only hard delete, same reasoning as PUT.
// Distinct from cancel (POST /api/exams/[id]/cancel): delete removes the row
// outright with no notification (for a mistaken entry no one has seen yet),
// cancel keeps history and notifies everyone it was called off.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')

    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (exam.status === 'teacher_reviewed' || exam.status === 'released') {
      return NextResponse.json({ error: 'Cannot delete an exam that has already been reviewed or released' }, { status: 400 })
    }

    await pool.query('DELETE FROM exam_records WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
