import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, parentOwnsStudent } from '@/lib/examsAuth'

export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const student_id = searchParams.get('student_id')
    const class_id = searchParams.get('class_id')

    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!student_id || !class_id) {
      return NextResponse.json({ error: 'student_id, class_id required' }, { status: 400 })
    }

    // v2 fix: this route previously only checked that SOME session existed
    // in the right school — never that the calling parent actually has a
    // claim to this specific student. Any parent (or teacher/student, since
    // getAnySession admits any role) could read any other family's summary
    // by changing student_id in the URL.
    if (actor.kind === 'parent' && !await parentOwnsStudent(actor.parentId, Number(student_id))) {
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

    try {
      const today = new Date().toISOString().slice(0, 10)
      const cutoff = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { rows } = await pool.query(`
        SELECT
          e.id,
          e.exam_name,
          e.exam_type,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
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
        WHERE c.grade = $1 AND c.section = $2 AND e.school_id = $3
          AND e.exam_date >= $4 AND e.exam_date <= $5
          AND e.status != 'scheduled'
        GROUP BY e.id, c.grade, c.section
        ORDER BY e.exam_date ASC
        LIMIT 10
      `, [student.grade, student.section, scid, today, cutoff])
      upcoming_exams = rows
    } catch (_) {
      upcoming_exams = []
    }

    try {
      // total_max is now computed from exam_subjects directly (every real
      // subject for this exam), not by joining through the student's own
      // exam_marks rows — the old join silently dropped any subject the
      // student had no mark row for yet, understating the denominator and
      // inflating the shown percentage relative to what the student's own
      // portal (GET /api/students/[id]/exams, which sums max over all
      // subjects) reports for the identical exam.
      const { rows } = await pool.query(`
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
        GROUP BY e.id, subj.total_max
        ORDER BY e.released_at DESC
        LIMIT 5
      `, [sid, cid, scid])
      released_results = rows
    } catch (_) {
      released_results = []
    }

    try {
      const { rows } = await pool.query(`
        SELECT COUNT(*)::int AS cnt
        FROM exam_records e
        WHERE e.class_id = $1 AND e.school_id = $2 AND e.status = 'released'
          AND NOT EXISTS (
            SELECT 1 FROM parent_mark_acks pma
            WHERE pma.exam_id = e.id AND pma.student_id = $3
          )
      `, [cid, scid, sid])
      unacknowledged_count = rows[0]?.cnt ?? 0
    } catch (_) {
      unacknowledged_count = 0
    }

    try {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'present')::int AS present_days,
          COUNT(DISTINCT date)::int AS total_days
        FROM attendance
        WHERE student_id = $1 AND school_id = $2 AND date >= $3 AND session = 'morning'
      `, [sid, scid, monthStart])
      const r = rows[0]
      attendance_pct = (r && r.total_days > 0) ? Math.round((r.present_days / r.total_days) * 100) : null
    } catch (_) {
      attendance_pct = null
    }

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
