import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/attendance/analytics?school_id=&days=30
// Returns:
//   chronic_absentees  — students absent >= 3 days in the period
//   weekly_trend       — school-wide present/total per ISO week
//   class_summary      — per class: total sessions, avg attendance %
export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const days      = Math.min(parseInt(searchParams.get('days') ?? '30'), 180)

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)

  try {
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
        ORDER BY c.grade, c.section
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
}
