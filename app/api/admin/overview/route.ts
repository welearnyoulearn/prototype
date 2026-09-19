import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'
import { resolveAcademicYear } from '@/lib/academicYear'

export async function GET(req: NextRequest) {
  try {
    if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const sp  = req.nextUrl.searchParams
    const sid = sp.get('school_id')
    if (!sid) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const school_id = parseInt(sid)
    const features  = new Set((sp.get('features') || '').split(',').map(s => s.trim()))
    const date      = sp.get('date') || new Date().toISOString().slice(0, 10)
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
            COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS morning_present,
            COUNT(a.id) FILTER (WHERE a.status = 'absent')::int  AS morning_absent,
            COUNT(a.id)::int                                      AS morning_total,
            (COUNT(a.id) > 0)                                     AS morning_marked
          FROM classes c
          LEFT JOIN attendance a ON a.class_id = c.id AND a.date = $2::date AND a.school_id = $1
          WHERE c.school_id = $1
          GROUP BY c.id, c.grade, c.section
          ORDER BY ${gradeOrderSql('c.grade')}, c.section
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
          ORDER BY ${gradeOrderSql('c.grade')}, c.section
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
      const [core, att, tt, exams, fees] = await Promise.all([
        coreQ,
        attQ       ?? Promise.resolve(null),
        ttQ        ?? Promise.resolve(null),
        examsQ     ?? Promise.resolve(null),
        feesQ      ?? Promise.resolve(null),
      ])

      return NextResponse.json({
        core:       core?.rows?.[0]  ?? { teachers: 0, students: 0, classes: 0 },
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
