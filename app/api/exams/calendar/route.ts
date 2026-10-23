import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireExamsAccess, isTeacherLinkedToClass, parentOwnsStudent } from '@/lib/examsAuth'

export async function GET(req: NextRequest) {
  try {

    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const class_id = searchParams.get('class_id')
    const teacher_id = searchParams.get('teacher_id')
    const student_id = searchParams.get('student_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const validDate = (value: string | null) => value === null || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
    if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
      return NextResponse.json({ error: 'Invalid calendar date range' }, { status: 400 })
    }

    // Role-scoped access — a session can only ever ask for its own calendar:
    // a student for themself, a parent for a linked child, a teacher for
    // their own class/teacher_id. This closes the same "any session can pass
    // any id" gap GET /api/exams had, on the route students/parents actually use.
    if (actor.kind === 'student') {
      if (student_id && Number(student_id) !== actor.studentId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (class_id || teacher_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (actor.kind === 'parent') {
      if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })
      const owns = await parentOwnsStudent(actor.parentId, parseInt(student_id))
      if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (class_id || teacher_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (actor.kind === 'teacher') {
      if (teacher_id && Number(teacher_id) !== actor.teacherId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (class_id && !(await isTeacherLinkedToClass(actor.teacherId, parseInt(class_id)))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (student_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const effectiveStudentId = actor.kind === 'student' ? String(actor.studentId) : student_id

    const currentYear = new Date().getFullYear()
    const dateFrom = from || `${currentYear}-01-01`
    const dateTo = to || `${currentYear}-12-31`

    try {
      let whereClause = ''
      const vals: (string | number)[] = [actor.schoolId, dateFrom, dateTo]

      if (class_id) {
        vals.push(parseInt(class_id))
        whereClause = `e.class_id = $${vals.length} AND e.school_id = $1`
      } else if (teacher_id) {
        vals.push(parseInt(teacher_id))
        whereClause = `e.school_id = $1 AND (
          EXISTS (SELECT 1 FROM exam_subjects es WHERE es.exam_id = e.id AND es.teacher_id = $${vals.length})
          OR c.class_teacher_id = $${vals.length}
        )`
      } else if (effectiveStudentId) {
        const { rows: [student] } = await pool.query(
          `SELECT s.id, s.grade, s.section FROM students s WHERE s.id = $1 AND s.school_id = $2`,
          [parseInt(effectiveStudentId), actor.schoolId]
        )
        if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
        vals.push(student.grade, student.section, student.id)
        // A student may see a whole-class exam OR one specifically targeted
        // at them — the old grade/section-only match silently hid
        // student_scope='specific' exams from the very students they name.
        whereClause = `e.school_id = $1 AND (
          (e.student_scope = 'all' AND c.grade = $${vals.length - 2} AND c.section = $${vals.length - 1})
          OR (e.student_scope = 'specific' AND EXISTS (SELECT 1 FROM exam_applicable_students eas WHERE eas.exam_id = e.id AND eas.student_id = $${vals.length}))
        )`
      } else {
        whereClause = `e.school_id = $1`
      }

      // This is a schedule calendar, not a marks-workflow view — every
      // non-cancelled exam belongs on it regardless of status, including
      // 'scheduled' (the status almost every future exam is in, right up
      // until the day after it happens). A prior include_draft='true'-only
      // toggle excluded 'scheduled' by default, which meant students and
      // parents — the two roles that never passed include_draft — saw no
      // upcoming exams at all until the day after each one had already
      // happened. Removed; every role now sees the same non-cancelled set.
      whereClause += ` AND e.status != 'cancelled'`

      const { rows } = await pool.query(`
        SELECT
          e.id,
          e.exam_name,
          e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.start_time,
          e.end_time,
          e.duration_minutes,
          e.room,
          e.syllabus,
          e.instructions,
          e.status,
          e.class_id,
          c.grade,
          c.section,
          COUNT(DISTINCT es.id)::int AS total_subjects,
          COUNT(DISTINCT CASE WHEN es.status = 'submitted' THEN es.id END)::int AS submitted_subjects,
          COALESCE(
            ARRAY_AGG(es.subject_name ORDER BY es.subject_name) FILTER (WHERE es.subject_name IS NOT NULL),
            '{}'
          ) AS subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN exam_subjects es ON es.exam_id = e.id
        WHERE ${whereClause}
          AND (e.exam_date IS NULL OR e.exam_date BETWEEN $2 AND $3)
        GROUP BY e.id, c.grade, c.section
        ORDER BY e.exam_date ASC
      `, vals)

      // Parent portal must never see syllabus/chapters/instructions — only
      // the schedule fields (name, subject, date, time, room). Strip here
      // rather than at the SQL level so admin/teacher/student keep full detail
      // from the same query.
      const out = actor.kind === 'parent'
        ? rows.map(row => {
            const safe = { ...row }
            delete safe.syllabus
            delete safe.instructions
            return safe
          })
        : rows
      return NextResponse.json(out)
    } catch (err) {
      console.error('GET /api/exams/calendar error:', err)
      return NextResponse.json({ error: 'Failed to fetch exam calendar' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
