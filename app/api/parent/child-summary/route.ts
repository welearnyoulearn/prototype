import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, parentOwnsStudent } from '@/lib/examsAuth'
import { buildStudentAttendanceView } from '@/lib/attendanceStudentView'

export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const student_id = searchParams.get('student_id')
    const class_id = searchParams.get('class_id')

    const actor = await requireExamsAccess(school_id)
    if (!actor || actor.kind !== 'parent') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!student_id || !class_id) {
      return NextResponse.json({ error: 'student_id, class_id required' }, { status: 400 })
    }

    // v2 fix: this route previously only checked that SOME session existed
    // in the right school — never that the calling parent actually has a
    // claim to this specific student. Any parent (or teacher/student, since
    // getAnySession admits any role) could read any other family's summary
    // by changing student_id in the URL.
    if (!await parentOwnsStudent(actor.parentId, Number(student_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sid = parseInt(student_id)
    const scid = actor.schoolId
    const cid = parseInt(class_id)

    let upcoming_exams: unknown[] = []
    let released_results: unknown[] = []
    let unacknowledged_count = 0
    let attendance_pct: number | null = null

    const { rows: studentRows } = await pool.query(
      `SELECT grade, section FROM students WHERE id = $1 AND school_id = $2`,
      [sid, scid]
    )
    const student = studentRows[0]
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const { rows: matchingClasses } = await pool.query(
      `SELECT 1 FROM classes WHERE id = $1 AND school_id = $2 AND grade = $3 AND section = $4`,
      [cid, scid, student.grade, student.section],
    )
    if (matchingClasses.length === 0) {
      return NextResponse.json({ error: 'class_id does not match this student' }, { status: 400 })
    }

      const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const todayDate = new Date()
      const cutoffDate = new Date(todayDate); cutoffDate.setDate(cutoffDate.getDate() + 60)
      const today = localDate(todayDate)
      const cutoff = localDate(cutoffDate)
      // status != 'scheduled' previously excluded almost every real upcoming
      // exam — 'scheduled' is the status every future exam sits in right up
      // until the day after it happens (see /api/cron/exam-status-sweep), so
      // this silently emptied "Upcoming Exams" for parents. Only 'cancelled'
      // is excluded now. Also matches student_scope='specific' exams
      // targeted at this exact student, not just whole-class exams.
      const { rows: upcomingRows } = await pool.query(`
        SELECT
          e.id,
          e.exam_name,
          e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.start_time, e.end_time, e.duration_minutes, e.room,
          e.status,
          e.class_id,
          c.grade,
          c.section,
          COUNT(DISTINCT es.id)::int AS total_subjects,
          COALESCE(
            ARRAY_AGG(es.subject_name ORDER BY es.subject_name) FILTER (WHERE es.subject_name IS NOT NULL),
            '{}'
          ) AS subjects
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN exam_subjects es ON es.exam_id = e.id
        WHERE e.school_id = $3
          AND (
            (e.student_scope = 'all' AND c.grade = $1 AND c.section = $2)
            OR (e.student_scope = 'specific' AND EXISTS (SELECT 1 FROM exam_applicable_students eas WHERE eas.exam_id = e.id AND eas.student_id = $6))
          )
          AND e.exam_date >= $4 AND e.exam_date <= $5
          AND e.status != 'cancelled'
        GROUP BY e.id, c.grade, c.section
        ORDER BY e.exam_date ASC
        LIMIT 10
      `, [student.grade, student.section, scid, today, cutoff, sid])
      upcoming_exams = upcomingRows

      // total_max is now computed from exam_subjects directly (every real
      // subject for this exam), not by joining through the student's own
      // exam_marks rows — the old join silently dropped any subject the
      // student had no mark row for yet, understating the denominator and
      // inflating the shown percentage relative to what the student's own
      // portal (GET /api/students/[id]/exams, which sums max over all
      // subjects) reports for the identical exam.
      const { rows: resultRows } = await pool.query(`
        SELECT
          e.id,
          e.exam_name,
          e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.passing_pct,
          COALESCE(SUM(CASE WHEN em.is_absent THEN 0 ELSE em.marks_obtained END), 0) AS total_obtained,
          subj.total_max,
          (
            SELECT pma.id IS NOT NULL
            FROM parent_mark_acks pma
            WHERE pma.exam_id = e.id AND pma.student_id = $1
          ) AS parent_acknowledged
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        JOIN (SELECT exam_id, SUM(max_marks) AS total_max FROM exam_subjects GROUP BY exam_id) subj ON subj.exam_id = e.id
        LEFT JOIN exam_marks em ON em.exam_id = e.id AND em.student_id = $1
        WHERE e.class_id = $2 AND e.school_id = $3 AND e.status = 'released'
          AND (e.student_scope = 'all' OR EXISTS (
            SELECT 1 FROM exam_applicable_students eas WHERE eas.exam_id = e.id AND eas.student_id = $1
          ))
        GROUP BY e.id, subj.total_max
        ORDER BY e.released_at DESC
        LIMIT 5
      `, [sid, cid, scid])
      released_results = resultRows

      const { rows: acknowledgementRows } = await pool.query(`
        SELECT COUNT(*)::int AS cnt
        FROM exam_records e
        WHERE e.class_id = $1 AND e.school_id = $2 AND e.status = 'released'
          AND (e.student_scope = 'all' OR EXISTS (
            SELECT 1 FROM exam_applicable_students eas WHERE eas.exam_id = e.id AND eas.student_id = $3
          ))
          AND NOT EXISTS (
            SELECT 1 FROM parent_mark_acks pma
            WHERE pma.exam_id = e.id AND pma.student_id = $3
          )
      `, [cid, scid, sid])
      unacknowledged_count = acknowledgementRows[0]?.cnt ?? 0

      // This month's attendance from the same builder the Attendance tab uses — one formula
      // (present + late ÷ marked sessions, holidays excluded), so the two screens always agree.
      const view = await buildStudentAttendanceView(scid, sid)
      attendance_pct = view?.month.summary.pct ?? null

    return NextResponse.json({
      upcoming_exams,
      released_results,
      unacknowledged_count,
      attendance_pct,
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
