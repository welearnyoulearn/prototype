import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'

// GET /api/attendance/analytics
//   ?school_id=X&days=30                      → rolling window (default): chronic absentees,
//                                                weekly trend, per-class summary
//   ?school_id=X&view=month&month=YYYY-MM     → month view: per-day school-wide trend +
//                                                per-class monthly %
//   ?school_id=X&view=year&year=YYYY          → year view: per-month school-wide trend +
//                                                per-class yearly % (best/worst derived client-side)
//
// All stats are computed off the morning session only — see class_summary comment below.
export async function GET(req: NextRequest) {
  try {
    const authSession = await getAnySession()
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const view      = searchParams.get('view') // null (rolling) | 'month' | 'year'

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    // getAnySession() only confirms SOME valid login exists — without this check
    // a logged-in user from School A could pass School B's school_id and read
    // School B's attendance analytics (student names included).
    if (Number(school_id) !== Number(authSession.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      if (view === 'month') {
        const month = searchParams.get('month') // YYYY-MM
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
          return NextResponse.json({ error: 'month required as YYYY-MM' }, { status: 400 })
        }
        const [daysRes, classRes] = await Promise.all([
          pool.query(`
            SELECT a.date::text AS date,
              COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
              COUNT(*)::int AS total
            FROM attendance a
            WHERE a.school_id = $1 AND a.session = 'morning' AND TO_CHAR(a.date, 'YYYY-MM') = $2
            GROUP BY a.date
            ORDER BY a.date
          `, [school_id, month]),
          pool.query(`
            SELECT c.id AS class_id, c.grade, c.section,
              COUNT(*) FILTER (WHERE a.status = 'present' AND a.session = 'morning')::int AS present,
              COUNT(*) FILTER (WHERE a.session = 'morning')::int AS total
            FROM classes c
            LEFT JOIN attendance a
              ON a.class_id = c.id AND a.school_id = $1 AND TO_CHAR(a.date, 'YYYY-MM') = $2
            WHERE c.school_id = $1
            GROUP BY c.id, c.grade, c.section
            ORDER BY ${gradeOrderSql('c.grade')}, c.section
          `, [school_id, month]),
        ])
        return NextResponse.json({
          month,
          days: daysRes.rows.map(r => ({
            date: r.date, present: r.present, total: r.total,
            pct: r.total > 0 ? Math.round((r.present / r.total) * 100) : null,
          })),
          classes: classRes.rows.map(r => ({
            class_id: r.class_id, grade: r.grade, section: r.section,
            present: r.present, total: r.total,
            pct: r.total > 0 ? Math.round((r.present / r.total) * 100) : null,
          })),
        })
      }

      if (view === 'year') {
        const year = searchParams.get('year') // YYYY
        if (!year || !/^\d{4}$/.test(year)) {
          return NextResponse.json({ error: 'year required as YYYY' }, { status: 400 })
        }
        const [monthsRes, classRes] = await Promise.all([
          pool.query(`
            SELECT TO_CHAR(a.date, 'YYYY-MM') AS month,
              COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
              COUNT(*)::int AS total
            FROM attendance a
            WHERE a.school_id = $1 AND a.session = 'morning' AND TO_CHAR(a.date, 'YYYY') = $2
            GROUP BY month
            ORDER BY month
          `, [school_id, year]),
          pool.query(`
            SELECT c.id AS class_id, c.grade, c.section,
              COUNT(*) FILTER (WHERE a.status = 'present' AND a.session = 'morning')::int AS present,
              COUNT(*) FILTER (WHERE a.session = 'morning')::int AS total
            FROM classes c
            LEFT JOIN attendance a
              ON a.class_id = c.id AND a.school_id = $1 AND TO_CHAR(a.date, 'YYYY') = $2
            WHERE c.school_id = $1
            GROUP BY c.id, c.grade, c.section
            ORDER BY ${gradeOrderSql('c.grade')}, c.section
          `, [school_id, year]),
        ])
        return NextResponse.json({
          year,
          months: monthsRes.rows.map(r => ({
            month: r.month, present: r.present, total: r.total,
            pct: r.total > 0 ? Math.round((r.present / r.total) * 100) : null,
          })),
          classes: classRes.rows.map(r => ({
            class_id: r.class_id, grade: r.grade, section: r.section,
            present: r.present, total: r.total,
            pct: r.total > 0 ? Math.round((r.present / r.total) * 100) : null,
          })),
        })
      }

      // ── Rolling window (default) ──────────────────────────────────────────
      const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 180)
      const since = new Date()
      since.setDate(since.getDate() - days)
      const sinceStr = since.toISOString().slice(0, 10)

      const [chronicRes, weeklyRes, classRes] = await Promise.all([

        // Chronic absentees — students with >= 3 absences (morning session) in the period
        pool.query(`
          SELECT
            s.id AS student_id,
            s.name,
            s.grade,
            s.section,
            s.roll_number,
            COUNT(a.id)::int AS absent_days,
            MAX(a.date::text)  AS last_absent_date
          FROM students s
          JOIN attendance a ON a.student_id = s.id AND a.school_id = $1
          WHERE s.school_id = $1
            AND a.status = 'absent'
            AND a.session = 'morning'
            AND a.date >= $2
          GROUP BY s.id, s.name, s.grade, s.section, s.roll_number
          HAVING COUNT(a.id) >= 3
          ORDER BY absent_days DESC
          LIMIT 30
        `, [school_id, sinceStr]),

        // Weekly trend — school-wide (morning session)
        pool.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('week', a.date), 'YYYY-MM-DD') AS week_start,
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
            COUNT(*)::int AS total
          FROM attendance a
          WHERE a.school_id = $1
            AND a.session   = 'morning'
            AND a.date      >= $2
          GROUP BY DATE_TRUNC('week', a.date)
          ORDER BY week_start
        `, [school_id, sinceStr]),

        // Class summary — avg attendance % per class
        pool.query(`
          SELECT
            c.id AS class_id,
            c.grade,
            c.section,
            COUNT(*) FILTER (WHERE a.status = 'present' AND a.session = 'morning')::int AS present,
            COUNT(*) FILTER (WHERE a.session = 'morning')::int AS total
          FROM classes c
          LEFT JOIN attendance a
            ON a.class_id = c.id AND a.school_id = $1 AND a.date >= $2
          WHERE c.school_id = $1
          GROUP BY c.id, c.grade, c.section
          ORDER BY ${gradeOrderSql('c.grade')}, c.section
        `, [school_id, sinceStr]),
      ])

      return NextResponse.json({
        period_days:       days,
        since:             sinceStr,
        chronic_absentees: chronicRes.rows,
        weekly_trend:      weeklyRes.rows,
        class_summary:     classRes.rows.map(r => ({
          class_id: r.class_id,
          grade:    r.grade,
          section:  r.section,
          present:  r.present,
          total:    r.total,
          pct:      r.total > 0 ? Math.round((r.present / r.total) * 100) : null,
        })),
      })
    } catch (err) {
      console.error('[attendance/analytics]', err)
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
    }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
