import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'
import { resolveAcademicYear } from '@/lib/academicYear'
import { nonWorkingDay } from '@/lib/attendance'
import { isValidDateStr, todayIST } from '@/lib/attendanceRules'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSchoolAdmin()
    if (!session?.schoolId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const sp  = req.nextUrl.searchParams
    const sid = sp.get('school_id')
    if (!sid) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    // The login decides the school — a school_id for someone else's school is refused.
    if (parseInt(sid) !== session.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const school_id = session.schoolId
    const features  = new Set((sp.get('features') || '').split(',').map(s => s.trim()))
    const dateParam = sp.get('date')
    if (dateParam && !isValidDateStr(dateParam)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    const date      = dateParam || todayIST()
    const year      = sp.get('year') || await resolveAcademicYear(school_id)

    // ── 1. Core counts (always) ───────────────────────────────────────────────
    const coreQ = pool.query(`
      SELECT
        (SELECT COUNT(*) FROM teachers WHERE school_id=$1 AND status='active')::int AS teachers,
        (SELECT COUNT(*) FROM students WHERE school_id=$1 AND status='active')::int AS students,
        (SELECT COUNT(*) FROM classes  WHERE school_id=$1)::int                     AS classes
    `, [school_id])

    // ── 4. Attendance today ───────────────────────────────────────────────────
    const attQ = features.has('attendance')
      ? pool.query(`
          SELECT
            c.id AS class_id, c.grade, c.section,
            -- Morning session. "present" = attended (present + late), as everywhere else (lib/attendanceRules.ts)
            COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late'))::int AS morning_present,
            COUNT(a.id) FILTER (WHERE a.status = 'absent')::int             AS morning_absent,
            COUNT(a.id)::int                                                 AS morning_total,
            EXISTS (SELECT 1 FROM attendance_sessions k
                    WHERE k.class_id = c.id AND k.date = $2::date AND k.session = 'morning') AS morning_marked
          FROM classes c
          LEFT JOIN attendance a ON a.class_id = c.id AND a.date = $2::date AND a.school_id = $1 AND a.session = 'morning'
          WHERE c.school_id = $1 AND c.deleted_at IS NULL
          GROUP BY c.id, c.grade, c.section
          ORDER BY ${gradeOrderSql('c.grade')}, c.section
        `, [school_id, date])
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
            COALESCE(SUM(GREATEST(amount_due - amount_paid - COALESCE(waiver_amount, 0), 0)) FILTER (WHERE status IN ('pending','overdue','partial')), 0) AS total_outstanding
          FROM student_fee_ledger
          WHERE school_id=$1 AND academic_year=$2
        `, [school_id, year])
      : null

    try {
      const [core, att, exams, fees, holiday] = await Promise.all([
        coreQ,
        attQ       ?? Promise.resolve(null),
        examsQ     ?? Promise.resolve(null),
        feesQ      ?? Promise.resolve(null),
        attQ ? nonWorkingDay(school_id, date) : Promise.resolve(null),
      ])

      return NextResponse.json({
        core:       core?.rows?.[0]  ?? { teachers: 0, students: 0, classes: 0 },
        attendance: att              ? att.rows    : null,
        // Set when `date` is a holiday / weekly off: the card shows that instead of "not marked".
        attendance_holiday: holiday ? { kind: holiday.kind, title: holiday.title } : null,
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
