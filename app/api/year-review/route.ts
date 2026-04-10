import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/year-review?school_id=X&academic_year=2025-26
// Aggregates all data needed for the Year-in-Review PDF
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id    = p.get('school_id')
  const academic_year = p.get('academic_year') || '2025-26'
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const [startYStr] = academic_year.split('-')
  const startYear   = parseInt(startYStr)
  const dateFrom    = `${startYear}-04-01`
  const dateTo      = `${startYear + 1}-03-31`

  try {
    const [schoolRes, teacherRes, studentRes, classRes, attRes, examRes, taskRes, doubtRes, feeRes, topStudentsRes, monthlyAttRes] = await Promise.all([

      // School info
      pool.query(`SELECT name, type, city, country, created_at FROM schools WHERE id = $1`, [school_id]),

      // Teachers
      pool.query(`SELECT COUNT(*)::int AS count FROM teachers WHERE school_id = $1`, [school_id]),

      // Students
      pool.query(`SELECT COUNT(*)::int AS count FROM students WHERE school_id = $1 AND (status IS NULL OR status = 'active')`, [school_id]),

      // Classes
      pool.query(`SELECT COUNT(*)::int AS count FROM classes WHERE school_id = $1`, [school_id]),

      // Overall attendance
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'present')::int AS present,
          COUNT(*)::int AS total,
          COUNT(DISTINCT date)::int AS school_days
        FROM attendance
        WHERE school_id = $1 AND session = 'morning' AND date BETWEEN $2 AND $3
      `, [school_id, dateFrom, dateTo]),

      // Exams conducted
      pool.query(`
        SELECT COUNT(*)::int AS count,
               COUNT(DISTINCT exam_type)::int AS types
        FROM exam_records
        WHERE school_id = $1 AND status = 'published'
          AND exam_date BETWEEN $2 AND $3
      `, [school_id, dateFrom, dateTo]),

      // Tasks
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'published')::int AS published
        FROM tasks WHERE school_id = $1 AND created_at BETWEEN $2 AND $3
      `, [school_id, dateFrom, dateTo]),

      // Doubts
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved
        FROM doubts WHERE school_id = $1 AND created_at BETWEEN $2 AND $3
      `, [school_id, dateFrom, dateTo]),

      // Fee collection
      pool.query(`
        SELECT COALESCE(SUM(amount),0)::numeric AS collected,
               COUNT(*)::int AS payments
        FROM fee_payments
        WHERE school_id = $1 AND payment_status = 'completed'
          AND paid_date BETWEEN $2 AND $3
      `, [school_id, dateFrom, dateTo]),

      // Top 5 students by points
      pool.query(`
        SELECT s.name, s.grade, s.section,
               COALESCE(SUM(sp.points),0)::int AS total_points
        FROM students s
        LEFT JOIN student_points sp ON sp.student_id = s.id AND sp.school_id = s.school_id
        WHERE s.school_id = $1 AND (s.status IS NULL OR s.status = 'active')
        GROUP BY s.id, s.name, s.grade, s.section
        ORDER BY total_points DESC LIMIT 5
      `, [school_id]),

      // Monthly attendance trend
      pool.query(`
        SELECT
          TO_CHAR(date, 'Mon YYYY') AS month,
          DATE_TRUNC('month', date) AS month_start,
          COUNT(*) FILTER (WHERE status = 'present')::int AS present,
          COUNT(*)::int AS total
        FROM attendance
        WHERE school_id = $1 AND session = 'morning' AND date BETWEEN $2 AND $3
        GROUP BY month, month_start
        ORDER BY month_start
      `, [school_id, dateFrom, dateTo]),
    ])

    const school   = schoolRes.rows[0]
    const att      = attRes.rows[0]
    const att_pct  = att.total > 0 ? Math.round((att.present / att.total) * 100) : null

    return NextResponse.json({
      academic_year,
      school,
      counts: {
        teachers: teacherRes.rows[0].count,
        students: studentRes.rows[0].count,
        classes:  classRes.rows[0].count,
      },
      attendance: {
        present: att.present,
        total: att.total,
        school_days: att.school_days,
        pct: att_pct,
      },
      exams:   examRes.rows[0],
      tasks:   taskRes.rows[0],
      doubts:  doubtRes.rows[0],
      fees: {
        collected: Number(feeRes.rows[0].collected),
        payments:  feeRes.rows[0].payments,
      },
      top_students:  topStudentsRes.rows,
      monthly_attendance: monthlyAttRes.rows.map(r => ({
        month: r.month,
        pct: r.total > 0 ? Math.round((r.present / r.total) * 100) : 0,
        present: r.present,
        total: r.total,
      })),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to generate year review' }, { status: 500 })
  }
}
