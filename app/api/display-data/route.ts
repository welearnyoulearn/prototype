import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/display-data?token=X
// Public endpoint — validates token, returns all slide data for the kiosk
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  try {
    // Validate token + get school_id
    const { rows: [tokenRow] } = await pool.query(
      `SELECT dt.*, sc.name AS school_name, sc.city
       FROM display_tokens dt
       JOIN schools sc ON sc.id = dt.school_id
       WHERE dt.token = $1`,
      [token]
    )
    if (!tokenRow) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    // Update last_used
    await pool.query(`UPDATE display_tokens SET last_used_at = NOW() WHERE token = $1`, [token])

    const school_id = tokenRow.school_id
    const today = new Date().toISOString().slice(0, 10)

    const [attRes, examRes, annRes, leaderRes, statsRes] = await Promise.all([
      // Today's school-wide attendance %
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'present')::int AS present,
          COUNT(*)::int AS total
        FROM attendance
        WHERE school_id = $1 AND date = $2 AND session = 'morning'
      `, [school_id, today]),

      // Upcoming exams (next 7 days)
      pool.query(`
        SELECT e.exam_name, e.exam_date, e.exam_type, c.grade, c.section
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        WHERE e.school_id = $1
          AND e.exam_date >= $2
          AND e.exam_date <= $2::date + INTERVAL '7 days'
          AND e.status != 'draft'
        ORDER BY e.exam_date, c.grade
        LIMIT 10
      `, [school_id, today]),

      // Active announcements
      pool.query(`
        SELECT title, content, announcement_type, priority
        FROM announcements
        WHERE school_id = $1
          AND (expires_at IS NULL OR expires_at >= $2)
        ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at DESC
        LIMIT 5
      `, [school_id, today]),

      // Top 5 leaderboard
      pool.query(`
        SELECT s.name, s.grade, s.section,
               COALESCE(SUM(sp.points),0)::int AS total_points,
               RANK() OVER (ORDER BY COALESCE(SUM(sp.points),0) DESC)::int AS rank
        FROM students s
        LEFT JOIN student_points sp ON sp.student_id = s.id AND sp.school_id = s.school_id
        WHERE s.school_id = $1 AND (s.status IS NULL OR s.status = 'active')
        GROUP BY s.id, s.name, s.grade, s.section
        ORDER BY total_points DESC
        LIMIT 5
      `, [school_id]),

      // School stats
      pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM teachers WHERE school_id = $1) AS teacher_count,
          (SELECT COUNT(*)::int FROM students WHERE school_id = $1 AND (status IS NULL OR status = 'active')) AS student_count,
          (SELECT COUNT(*)::int FROM classes WHERE school_id = $1) AS class_count
      `, [school_id]),
    ])

    const att = attRes.rows[0]
    const att_pct = att.total > 0 ? Math.round((att.present / att.total) * 100) : null

    return NextResponse.json({
      school_name: tokenRow.school_name,
      city: tokenRow.city,
      attendance: { present: att.present, total: att.total, pct: att_pct },
      upcoming_exams: examRes.rows,
      announcements: annRes.rows,
      leaderboard: leaderRes.rows,
      stats: statsRes.rows[0],
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
