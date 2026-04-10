import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/leaderboard?school_id=&class_id=&limit=50
// Returns top students ranked by total points, with badge count and streak.
export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const class_id  = searchParams.get('class_id')
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  // Build optional class filter — join through classes to match grade+section
  const classFilter = class_id
    ? `AND s.grade = (SELECT grade FROM classes WHERE id = $2 AND school_id = $1)
       AND s.section = (SELECT section FROM classes WHERE id = $2 AND school_id = $1)`
    : ''

  const params: (string | number)[] = [school_id]
  if (class_id) params.push(parseInt(class_id))

  const { rows } = await pool.query(`
    SELECT
      s.id                                        AS student_id,
      s.name,
      s.grade,
      s.section,
      s.roll_number,
      COALESCE(SUM(sp.points), 0)::int            AS total_points,
      COUNT(DISTINCT sb.id)::int                  AS badge_count,
      COALESCE(ss.current_streak, 0)::int         AS current_streak,
      COALESCE(ss.longest_streak, 0)::int         AS longest_streak,
      RANK() OVER (ORDER BY COALESCE(SUM(sp.points), 0) DESC)::int AS rank
    FROM students s
    LEFT JOIN student_points sp  ON sp.student_id = s.id AND sp.school_id = s.school_id
    LEFT JOIN student_badges sb  ON sb.student_id = s.id AND sb.school_id = s.school_id
    LEFT JOIN student_streaks ss ON ss.student_id = s.id
    WHERE s.school_id = $1
      AND (s.status IS NULL OR s.status = 'active')
      ${classFilter}
    GROUP BY s.id, s.name, s.grade, s.section, s.roll_number, ss.current_streak, ss.longest_streak
    ORDER BY total_points DESC, s.name ASC
    LIMIT ${limit}
  `, params)

  return NextResponse.json(rows)
}
