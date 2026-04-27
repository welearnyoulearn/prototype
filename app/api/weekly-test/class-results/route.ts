import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/weekly-test/class-results?school_id=&class_id=&week_start=YYYY-MM-DD
// Returns weekly test status for all students in a class for a given week.
// If week_start omitted, uses the current Monday.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const school_id = sp.get('school_id')
  const class_id  = sp.get('class_id')

  if (!school_id || !class_id)
    return NextResponse.json({ error: 'school_id and class_id required' }, { status: 400 })

  // Default to current week's Monday
  let week_start = sp.get('week_start')
  if (!week_start) {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    week_start = d.toISOString().slice(0, 10)
  }

  try {
    // All active students in class + their test status for this week (LEFT JOIN)
    const { rows } = await pool.query(`
      SELECT
        s.id          AS student_id,
        s.name        AS student_name,
        s.roll_number,
        wt.id         AS test_id,
        wt.status,
        wt.score,
        wt.max_score,
        wt.submitted_at,
        wt.generated_at
      FROM students s
      LEFT JOIN weekly_tests wt
             ON wt.student_id = s.id
            AND wt.class_id   = $2
            AND wt.week_start = $3
      WHERE s.class_id  = $2
        AND s.school_id = $1
        AND s.status    = 'active'
      ORDER BY s.roll_number, s.name
    `, [school_id, class_id, week_start])

    const submitted = rows.filter(r => r.status === 'submitted')
    const total     = rows.length
    const avgScore  = submitted.length > 0
      ? Math.round(submitted.reduce((a, r) => a + (r.score / r.max_score * 100), 0) / submitted.length)
      : null

    return NextResponse.json({
      week_start,
      total_students: total,
      submitted_count: submitted.length,
      avg_score_pct:   avgScore,
      students: rows,
    })
  } catch (err) {
    console.error('weekly-test/class-results error:', err)
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 })
  }
}
