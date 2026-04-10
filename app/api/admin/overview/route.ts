import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/admin/overview?school_id=&features=attendance,leave,cover,timetable,exams,fees&date=YYYY-MM-DD&year=2025-26
 *
 * Single batched query replacing 6+ round-trips from the Overview dashboard.
 * Returns everything needed in one DB call per logical group, all in parallel server-side.
 */
export async function GET(req: NextRequest) {
  const sp   = req.nextUrl.searchParams
  const sid  = sp.get('school_id')
  if (!sid) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const school_id = parseInt(sid)
  const features  = new Set((sp.get('features') || '').split(',').map(s => s.trim()))
  const date      = sp.get('date') || new Date().toISOString().slice(0, 10)
  const year      = sp.get('year') || '2025-26'

  // Run all queries in parallel — only the ones the client needs
  const queries: Promise<unknown>[] = []

  // ── 1. Core counts (always) ─────────────────────────────────────────────
  const coreQ = pool.query(`
    SELECT
      (SELECT COUNT(*) FROM teachers   WHERE school_id=$1 AND status='active')::int  AS teachers,
      (SELECT COUNT(*) FROM students   WHERE school_id=$1 AND status='active')::int  AS students,
      (SELECT COUNT(*) FROM classes    WHERE school_id=$1)::int                      AS classes
  `, [school_id])

  // ── 2. Pending leaves ───────────────────────────────────────────────────
  const leavesQ = features.has('leave')
    ? pool.query(`SELECT COUNT(*)::int AS count FROM leave_requests WHERE school_id=$1 AND status='pending'`, [school_id])
    : null

  // ── 3. Uncovered periods today ─────────────────────────────────────────
  const coverQ = features.has('cover')
    ? pool.query(`
        SELECT
          lr.id AS leave_request_id, lr.leave_type,
          t.id AS teacher_id, t.name AS teacher_name, t.department,
          c.id AS class_id, c.grade, c.section,
          ts.period_number, ts.subject_name, ts.time_from, ts.time_to
        FROM leave_requests lr
        JOIN teachers t ON t.id = lr.teacher_id
        JOIN timetable_slots ts ON ts.teacher_id = t.id
        JOIN timetable_versions tv ON tv.id = ts.version_id AND tv.is_active = true
        JOIN classes c ON c.id = tv.class_id
        WHERE lr.school_id = $1
          AND lr.status = 'approved'
          AND $2 BETWEEN lr.start_date AND lr.end_date
          AND ts.day_of_week = trim(to_char($2::date, 'Day'))
          AND NOT EXISTS (
            SELECT 1 FROM substitute_duties sd
            WHERE sd.class_id = c.id
              AND sd.period_number = ts.period_number
              AND sd.date = $2
              AND sd.school_id = $1
          )
        ORDER BY ts.period_number
      `, [school_id, date])
    : null

  // ── 4. Attendance today ─────────────────────────────────────────────────
  const attQ = features.has('attendance')
    ? pool.query(`
        SELECT
          c.id AS class_id, c.grade, c.section,
          COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS morning_present,
          COUNT(a.id) FILTER (WHERE a.status = 'absent')::int  AS morning_absent,
          COUNT(a.id)::int                                      AS morning_total,
          (COUNT(a.id) > 0)                                     AS morning_marked
        FROM classes c
        LEFT JOIN attendance a ON a.class_id = c.id AND a.date = $2 AND a.school_id = $1
        WHERE c.school_id = $1
        GROUP BY c.id, c.grade, c.section
        ORDER BY c.grade, c.section
      `, [school_id, date])
    : null

  // ── 5. Timetable health ─────────────────────────────────────────────────
  const ttQ = features.has('timetable')
    ? pool.query(`
        SELECT
          c.id AS class_id,
          EXISTS(SELECT 1 FROM timetable_versions tv WHERE tv.class_id=c.id AND tv.is_active=true) AS timetable_exists,
          COALESCE((
            SELECT COUNT(*) FROM timetable_slots ts
            JOIN timetable_versions tv ON tv.id=ts.version_id AND tv.class_id=c.id AND tv.is_active=true
            WHERE ts.teacher_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM timetable_slots ts2
              JOIN timetable_versions tv2 ON tv2.id=ts2.version_id AND tv2.is_active=true
              WHERE ts2.teacher_id=ts.teacher_id AND ts2.day_of_week=ts.day_of_week AND ts2.period_number=ts.period_number AND ts2.id<>ts.id
            )
          ),0)::int AS conflict_count,
          COALESCE((
            SELECT COUNT(*) FROM timetable_slots ts
            JOIN timetable_versions tv ON tv.id=ts.version_id AND tv.class_id=c.id AND tv.is_active=true
            WHERE ts.teacher_id IS NULL AND ts.is_break=false
          ),0)::int AS no_teacher_count,
          0::int AS subjects_unassigned
        FROM classes c WHERE c.school_id=$1 ORDER BY c.grade, c.section
      `, [school_id])
    : null

  // ── 6. Upcoming exams (7 days) ──────────────────────────────────────────
  const examsQ = features.has('exams')
    ? pool.query(`
        SELECT e.id, e.exam_name, e.exam_date::text, e.exam_type, c.grade, c.section
        FROM exams e
        JOIN classes c ON c.id = e.class_id
        WHERE e.school_id = $1
          AND e.exam_date >= $2::date
          AND e.exam_date < $2::date + interval '7 days'
        ORDER BY e.exam_date, e.exam_name
        LIMIT 5
      `, [school_id, date])
    : null

  // ── 7. Fee stats ────────────────────────────────────────────────────────
  const feesQ = features.has('fees')
    ? pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='overdue')::int          AS overdue_count,
          COALESCE(SUM(amount_due - amount_paid) FILTER (WHERE status IN ('pending','overdue','partial')),0) AS total_outstanding
        FROM student_fee_ledger
        WHERE school_id=$1 AND academic_year=$2
      `, [school_id, year])
    : null

  // ── Run all in parallel ─────────────────────────────────────────────────
  queries.push(coreQ, leavesQ ?? Promise.resolve(null), coverQ ?? Promise.resolve(null),
    attQ ?? Promise.resolve(null), ttQ ?? Promise.resolve(null),
    examsQ ?? Promise.resolve(null), feesQ ?? Promise.resolve(null))

  const [core, leaves, cover, att, tt, exams, fees] = await Promise.all(queries) as Awaited<typeof coreQ>[]

  return NextResponse.json({
    core:       core?.rows?.[0]   ?? { teachers: 0, students: 0, classes: 0 },
    leaves:     leaves            ? { count: leaves.rows[0]?.count ?? 0 } : null,
    uncovered:  cover             ? cover.rows   : null,
    attendance: att               ? att.rows      : null,
    timetable:  tt                ? tt.rows       : null,
    exams:      exams             ? exams.rows    : null,
    fees:       fees              ? fees.rows[0]  : null,
  })
}
