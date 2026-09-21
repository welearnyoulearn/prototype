import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { BADGE_DEFS } from '@/lib/rewards'

// GET /api/students/[id]/rewards?school_id=
// Returns total points, badges, streak, recent transactions, class leaderboard.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

    const { id: student_id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    const class_id = req.nextUrl.searchParams.get('class_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    try {
      const [pointsRes, badgesRes, streakRes, recentRes, leaderboardRes] = await Promise.all([
        // Academic points (default or explicit 'academic')
        pool.query(
          `SELECT
             COALESCE(SUM(points) FILTER (WHERE points_type = 'academic' OR points_type IS NULL), 0)::int AS academic
           FROM student_points WHERE student_id = $1 AND school_id = $2`,
          [student_id, school_id]
        ),

        // Earned badges
        pool.query(
          `SELECT badge_type, earned_at FROM student_badges WHERE student_id = $1 ORDER BY earned_at DESC`,
          [student_id]
        ),

        // Streak
        pool.query(
          `SELECT current_streak, longest_streak, last_activity_date FROM student_streaks WHERE student_id = $1`,
          [student_id]
        ),

        // Recent point transactions (last 15) — include points_type
        pool.query(
          `SELECT action_type, points, points_type, earned_at FROM student_points
           WHERE student_id = $1 AND school_id = $2
           ORDER BY earned_at DESC LIMIT 15`,
          [student_id, school_id]
        ),

        // Class leaderboard ranked by academic points only
        class_id ? pool.query(
          `SELECT s.id, s.name,
             COALESCE(SUM(sp.points) FILTER (WHERE sp.points_type = 'academic' OR sp.points_type IS NULL), 0)::int AS total_points
           FROM students s
           LEFT JOIN student_points sp ON sp.student_id = s.id AND sp.school_id = s.school_id
           WHERE s.school_id = $1
             AND s.grade = (SELECT grade FROM students WHERE id = $2)
             AND s.section = (SELECT section FROM students WHERE id = $2)
             AND s.status = 'active'
           GROUP BY s.id, s.name
           ORDER BY total_points DESC
           LIMIT 10`,
          [school_id, student_id]
        ) : Promise.resolve({ rows: [] }),

      ])

      const academicPoints    = pointsRes.rows[0]?.academic ?? 0
      const totalPoints = academicPoints  // leaderboard & rank use academic only
      const streak = streakRes.rows[0] || { current_streak: 0, longest_streak: 0, last_activity_date: null }

      // Enrich badges with display info
      const earnedBadgeTypes = new Set(badgesRes.rows.map((b: { badge_type: string }) => b.badge_type))
      const badgeEarnedAt: Record<string, string> = {}
      badgesRes.rows.forEach((b: { badge_type: string; earned_at: string }) => { badgeEarnedAt[b.badge_type] = b.earned_at })

      const allBadges = BADGE_DEFS.map(def => ({
        ...def,
        earned: earnedBadgeTypes.has(def.type),
        earned_at: badgeEarnedAt[def.type] || null,
      }))

      // Rank in class
      const leaderboard = leaderboardRes.rows.map((row: { id: number; name: string; total_points: string }, idx: number) => ({
        rank: idx + 1,
        student_id: row.id,
        name: row.id === parseInt(student_id) ? 'You' : row.name,
        total_points: parseInt(row.total_points),
        is_me: row.id === parseInt(student_id),
      }))

      const myRank = leaderboard.find((r: { is_me: boolean }) => r.is_me)?.rank ?? null

      return NextResponse.json({
        total_points: totalPoints,
        academic_points: academicPoints,
        streak: {
          current: parseInt(streak.current_streak) || 0,
          longest: parseInt(streak.longest_streak) || 0,
          last_activity_date: streak.last_activity_date,
        },
        badges: allBadges,
        recent_transactions: recentRes.rows,
        leaderboard,
        my_rank: myRank,
      })
    } catch (err) {
      console.error('Rewards API error:', err)
      return NextResponse.json({ error: 'Failed to fetch rewards' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
