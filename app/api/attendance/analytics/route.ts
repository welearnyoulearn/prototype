import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { gradeOrderSql } from '@/lib/grades'
import { getAdminActor } from '@/lib/attendanceAuth'
import { nonWorkingDaysMap } from '@/lib/attendance'
import {
  addDays, attendanceBand, attendancePercent, isValidMonthStr, monthBounds, todayIST, type NonWorkingDay,
} from '@/lib/attendanceRules'

// GET /api/attendance/analytics                 (school admins only)
//   ?days=30                       rolling window: chronic absentees, weekly trend, per-class summary
//   ?view=month&month=YYYY-MM      per-day school-wide trend + per-class monthly %
//   ?view=year&year=YYYY           per-month school-wide trend + per-class yearly %
//
// Every figure follows lib/attendanceRules.ts, the same rules the teacher, parent and student
// screens use: each MARKED session counts, late counts as attended, and holidays / weekly-off
// days are left out entirely. `present` in the responses means "attended" (present + late).

type Counts = { present: number; late: number; absent: number }

function withPct<T extends Counts>(r: T) {
  const marked = r.present + r.late + r.absent
  const attended = r.present + r.late
  const pct = attendancePercent(attended, marked)
  return { ...r, present: attended, late: r.late, absent: r.absent, total: marked, pct, band: attendanceBand(pct) }
}

const holidayList = (m: Map<string, NonWorkingDay>) =>
  [...m.entries()].map(([date, v]) => ({ date, kind: v.kind, title: v.title }))

export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const p = req.nextUrl.searchParams
    if (p.get('school_id') !== null && Number(p.get('school_id')) !== admin.schoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const schoolId = admin.schoolId
    const view = p.get('view')
    const today = todayIST()

    // The three count columns every query returns; kept in one place so no view drifts.
    const COUNTS = `COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
                    COUNT(*) FILTER (WHERE a.status = 'late')::int    AS late,
                    COUNT(*) FILTER (WHERE a.status = 'absent')::int  AS absent`

    if (view === 'month') {
      const month = p.get('month')
      if (!isValidMonthStr(month)) return NextResponse.json({ error: 'month required as YYYY-MM' }, { status: 400 })
      const { from, to } = monthBounds(month)
      const nonWorking = await nonWorkingDaysMap(schoolId, from, to)
      const nw = [...nonWorking.keys()]

      const [daysRes, classRes] = await Promise.all([
        pool.query(
          `SELECT a.date::text AS date, ${COUNTS}
           FROM attendance a
           WHERE a.school_id = $1 AND a.date BETWEEN $2::date AND $3::date AND a.date <> ALL($4::date[])
           GROUP BY a.date ORDER BY a.date`,
          [schoolId, from, to, nw]),
        pool.query(
          `SELECT c.id AS class_id, c.grade, c.section, ${COUNTS}
           FROM classes c
           LEFT JOIN attendance a ON a.class_id = c.id AND a.school_id = $1
             AND a.date BETWEEN $2::date AND $3::date AND a.date <> ALL($4::date[])
           WHERE c.school_id = $1 AND c.deleted_at IS NULL
           GROUP BY c.id, c.grade, c.section
           ORDER BY ${gradeOrderSql('c.grade')}, c.section`,
          [schoolId, from, to, nw]),
      ])
      return NextResponse.json({
        month,
        days: daysRes.rows.map(r => withPct(r)),
        classes: classRes.rows.map(r => withPct(r)),
        holidays: holidayList(nonWorking),
      })
    }

    if (view === 'year') {
      const year = p.get('year')
      if (!year || !/^\d{4}$/.test(year)) return NextResponse.json({ error: 'year required as YYYY' }, { status: 400 })
      const from = `${year}-01-01`, to = `${year}-12-31`
      const nonWorking = await nonWorkingDaysMap(schoolId, from, to)
      const nw = [...nonWorking.keys()]

      const [monthsRes, classRes] = await Promise.all([
        pool.query(
          `SELECT TO_CHAR(a.date, 'YYYY-MM') AS month, ${COUNTS}
           FROM attendance a
           WHERE a.school_id = $1 AND a.date BETWEEN $2::date AND $3::date AND a.date <> ALL($4::date[])
           GROUP BY month ORDER BY month`,
          [schoolId, from, to, nw]),
        pool.query(
          `SELECT c.id AS class_id, c.grade, c.section, ${COUNTS}
           FROM classes c
           LEFT JOIN attendance a ON a.class_id = c.id AND a.school_id = $1
             AND a.date BETWEEN $2::date AND $3::date AND a.date <> ALL($4::date[])
           WHERE c.school_id = $1 AND c.deleted_at IS NULL
           GROUP BY c.id, c.grade, c.section
           ORDER BY ${gradeOrderSql('c.grade')}, c.section`,
          [schoolId, from, to, nw]),
      ])
      return NextResponse.json({
        year,
        months: monthsRes.rows.map(r => withPct(r)),
        classes: classRes.rows.map(r => withPct(r)),
        // Only named holidays — 50+ Sundays would drown the list.
        holidays: holidayList(nonWorking).filter(h => h.kind === 'holiday'),
      })
    }

    // ── Rolling window (default)
    const daysRaw = Number(p.get('days') ?? '30')
    const days = Number.isInteger(daysRaw) ? Math.min(Math.max(daysRaw, 1), 180) : 30
    const since = addDays(today, -days)
    const nonWorking = await nonWorkingDaysMap(schoolId, since, today)
    const nw = [...nonWorking.keys()]

    const [chronicRes, weeklyRes, classRes] = await Promise.all([
      // Students absent on 3+ working days in the period (any session counts as that day).
      pool.query(
        `SELECT s.id AS student_id, s.name, s.grade, s.section, s.roll_number,
                COUNT(DISTINCT a.date)::int AS absent_days, MAX(a.date::text) AS last_absent_date
         FROM students s
         JOIN attendance a ON a.student_id = s.id AND a.school_id = $1
         WHERE s.school_id = $1 AND (s.status IS NULL OR s.status = 'active')
           AND a.status = 'absent' AND a.date >= $2::date AND a.date <= $3::date AND a.date <> ALL($4::date[])
         GROUP BY s.id, s.name, s.grade, s.section, s.roll_number
         HAVING COUNT(DISTINCT a.date) >= 3
         ORDER BY absent_days DESC
         LIMIT 30`,
        [schoolId, since, today, nw]),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('week', a.date), 'YYYY-MM-DD') AS week_start, ${COUNTS}
         FROM attendance a
         WHERE a.school_id = $1 AND a.date >= $2::date AND a.date <= $3::date AND a.date <> ALL($4::date[])
         GROUP BY DATE_TRUNC('week', a.date) ORDER BY week_start`,
        [schoolId, since, today, nw]),
      pool.query(
        `SELECT c.id AS class_id, c.grade, c.section, ${COUNTS}
         FROM classes c
         LEFT JOIN attendance a ON a.class_id = c.id AND a.school_id = $1
           AND a.date >= $2::date AND a.date <= $3::date AND a.date <> ALL($4::date[])
         WHERE c.school_id = $1 AND c.deleted_at IS NULL
         GROUP BY c.id, c.grade, c.section
         ORDER BY ${gradeOrderSql('c.grade')}, c.section`,
        [schoolId, since, today, nw]),
    ])

    return NextResponse.json({
      period_days: days,
      since,
      chronic_absentees: chronicRes.rows,
      weekly_trend: weeklyRes.rows.map(r => ({ week_start: r.week_start, ...withPct(r) })),
      class_summary: classRes.rows.map(r => withPct(r)),
    })
  } catch (err) {
    console.error('[attendance/analytics]', err)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
