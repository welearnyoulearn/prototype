import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const sp  = req.nextUrl.searchParams
    const sid = sp.get('school_id')
    if (!sid) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const school_id = parseInt(sid)
    const features  = new Set((sp.get('features') || '').split(',').map(s => s.trim()))
    const date      = sp.get('date') || new Date().toISOString().slice(0, 10)
    const year      = sp.get('year') || await pool.query(
      `SELECT label FROM academic_years WHERE school_id=$1 AND is_current=TRUE LIMIT 1`, [school_id]
    ).then(r => r.rows[0]?.label ?? '2025-26').catch(() => '2025-26')

    // ── 1. Core counts (always) ───────────────────────────────────────────────
    const coreQ = pool.query(`
      SELECT
        (SELECT COUNT(*) FROM teachers WHERE school_id=$1 AND status='active')::int AS teachers,
        (SELECT COUNT(*) FROM students WHERE school_id=$1 AND status='active')::int AS students,
        (SELECT COUNT(*) FROM classes  WHERE school_id=$1)::int                     AS classes
    `, [school_id])

    // ── 2. Pending leaves ─────────────────────────────────────────────────────
    const leavesQ = features.has('leave')
      ? pool.query(
          `SELECT COUNT(*)::int AS count FROM leave_requests WHERE school_id=$1 AND status='pending'`,
          [school_id]
        )
      : null

    // ── 3. Uncovered periods today (approved leave with no substitute) ────────
    const coverQ = features.has('cover')
      ? pool.query(`
          SELECT
            lr.id AS leave_request_id,
            t.id  AS teacher_id, t.name AS teacher_name,
            c.id  AS class_id, c.grade, c.section,
            ct.period_number, ct.subject_name, ct.time_from, ct.time_to
          FROM leave_requests lr
          JOIN teachers t ON t.id = lr.teacher_id
          JOIN class_timetable ct ON ct.teacher_id = t.id AND ct.school_id = $1 AND ct.is_break = false
          JOIN classes c ON c.id = ct.class_id
          WHERE lr.school_id = $1
            AND lr.status = 'approved'
            AND $2::date BETWEEN lr.start_date AND lr.end_date
            AND ct.day_of_week = trim(to_char($2::date, 'Day'))
            AND NOT EXISTS (
              SELECT 1 FROM substitute_assignments sa
              WHERE sa.class_id = c.id
                AND sa.period_number = ct.period_number
                AND sa.date = $2::date
                AND sa.school_id = $1
            )
          ORDER BY ct.period_number
        `, [school_id, date])
      : null

    // ── 4. Attendance today ───────────────────────────────────────────────────
    const attQ = features.has('attendance')
      ? pool.query(`
          SELECT
            c.id AS class_id, c.grade, c.section,
            COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS morning_present,
            COUNT(a.id) FILTER (WHERE a.status = 'absent')::int  AS morning_absent,
            COUNT(a.id)::int                                      AS morning_total,
            (COUNT(a.id) > 0)                                     AS morning_marked
          FROM classes c
          LEFT JOIN attendance a ON a.class_id = c.id AND a.date = $2::date AND a.school_id = $1
          WHERE c.school_id = $1
          GROUP BY c.id, c.grade, c.section
          ORDER BY (NULLIF(regexp_replace(c.grade,'[^0-9]','','g'),''))::int NULLS LAST, c.section
        `, [school_id, date])
      : null

    // ── 5. Timetable health (uses class_timetable directly) ──────────────────
    const ttQ = features.has('timetable')
      ? pool.query(`
          WITH conflict_slots AS (
            SELECT a.class_id, COUNT(*) AS conflict_count
            FROM class_timetable a
            JOIN class_timetable b ON
              b.teacher_id = a.teacher_id AND
              b.day_of_week = a.day_of_week AND
              b.period_number = a.period_number AND
              b.class_id <> a.class_id AND
              b.school_id = a.school_id AND
              b.is_break = false
            WHERE a.school_id = $1 AND a.teacher_id IS NOT NULL AND a.is_break = false
            GROUP BY a.class_id
          ),
          no_teacher_slots AS (
            SELECT class_id, COUNT(*) AS no_teacher_count
            FROM class_timetable
            WHERE school_id = $1 AND teacher_id IS NULL AND is_break = false
            GROUP BY class_id
          ),
          tt_exists AS (
            SELECT class_id, TRUE AS timetable_exists
            FROM class_timetable WHERE school_id = $1
            GROUP BY class_id
          )
          SELECT
            c.id AS class_id,
            COALESCE(cf.conflict_count, 0)::int   AS conflict_count,
            COALESCE(nt.no_teacher_count, 0)::int AS no_teacher_count,
            0::int                                 AS subjects_unassigned,
            COALESCE(te.timetable_exists, FALSE)   AS timetable_exists
          FROM classes c
          LEFT JOIN conflict_slots  cf ON cf.class_id = c.id
          LEFT JOIN no_teacher_slots nt ON nt.class_id = c.id
          LEFT JOIN tt_exists        te ON te.class_id = c.id
          WHERE c.school_id = $1
          ORDER BY (NULLIF(regexp_replace(c.grade,'[^0-9]','','g'),''))::int NULLS LAST, c.section
        `, [school_id])
      : null

    // ── 6. Upcoming exams (7 days) ────────────────────────────────────────────
    const examsQ = features.has('exams')
      ? pool.query(`
          SELECT e.id, e.exam_name, e.exam_date::text, e.exam_type, c.grade, c.section
          FROM exam_records e
          JOIN classes c ON c.id = e.class_id
          WHERE e.school_id = $1
            AND e.exam_date >= $2::date
            AND e.exam_date < $2::date + interval '7 days'
          ORDER BY e.exam_date, e.exam_name
          LIMIT 5
        `, [school_id, date])
      : null

    // ── 7. Fee stats ──────────────────────────────────────────────────────────
    const feesQ = features.has('fees')
      ? pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status='overdue')::int AS overdue_count,
            COALESCE(SUM(amount_due - amount_paid - COALESCE(waiver_amount, 0)) FILTER (WHERE status IN ('pending','overdue','partial')), 0) AS total_outstanding
          FROM student_fee_ledger
          WHERE school_id=$1 AND academic_year=$2
        `, [school_id, year])
      : null

    try {
      const [core, leaves, cover, att, tt, exams, fees] = await Promise.all([
        coreQ,
        leavesQ    ?? Promise.resolve(null),
        coverQ     ?? Promise.resolve(null),
        attQ       ?? Promise.resolve(null),
        ttQ        ?? Promise.resolve(null),
        examsQ     ?? Promise.resolve(null),
        feesQ      ?? Promise.resolve(null),
      ])

      return NextResponse.json({
        core:       core?.rows?.[0]  ?? { teachers: 0, students: 0, classes: 0 },
        leaves:     leaves           ? { count: leaves.rows[0]?.count ?? 0 } : null,
        uncovered:  cover            ? cover.rows  : null,
        attendance: att              ? att.rows    : null,
        timetable:  tt               ? tt.rows     : null,
        exams:      exams            ? exams.rows  : null,
        fees:       fees             ? fees.rows[0]: null,
      })
    } catch (err) {
      console.error('[admin/overview]', err)
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: msg || 'Overview fetch failed' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
