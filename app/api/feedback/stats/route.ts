import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/feedback/stats?school_id=
// Several small grouped queries rather than one mega-CTE, matching this
// codebase's existing dashboard-endpoint style. Windows are fixed for v1
// (today for mood breakdown, all-time for everything else) — a configurable
// date range is explicitly out of scope for this release.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const schoolId = access.schoolId

    // None of these four queries depends on another's result — run them
    // concurrently rather than paying for the sum of their round-trips.
    const [totalsRes, todayMoodRes, categoryStatsRes, highPriorityRes] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM feedback_submissions WHERE school_id = $1)::int AS total_feedback,
           COUNT(*)::int AS total_ratings,
           COALESCE(AVG(rating), 0)::float AS avg_rating,
           COUNT(*) FILTER (WHERE rating >= 4)::int AS positive_count,
           COUNT(*) FILTER (WHERE rating <= 2)::int AS negative_count
         FROM feedback_submission_ratings WHERE school_id = $1`,
        [schoolId]
      ),
      pool.query(
        `SELECT rating, COUNT(*)::int AS count
         FROM feedback_submission_ratings
         WHERE school_id = $1 AND created_at >= date_trunc('day', now())
         GROUP BY rating ORDER BY rating`,
        [schoolId]
      ),
      pool.query(
        `SELECT category_key, category_label, COUNT(*)::int AS count, AVG(rating)::float AS avg_rating
         FROM feedback_submission_ratings WHERE school_id = $1
         GROUP BY category_key, category_label`,
        [schoolId]
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM feedback_submission_ratings
         WHERE school_id = $1 AND priority = 'high' AND status = 'open'`,
        [schoolId]
      ),
    ])

    const totals = totalsRes.rows[0]
    const totalRatings = totals.total_ratings || 0
    const pulseScore = Math.round((totals.avg_rating / 5) * 100)
    const percentPositive = totalRatings ? Math.round((totals.positive_count / totalRatings) * 100) : 0
    const percentNegative = totalRatings ? Math.round((totals.negative_count / totalRatings) * 100) : 0

    const todayMood = todayMoodRes.rows
    const todayTotal = todayMood.reduce((sum, r) => sum + r.count, 0)
    const todayMoodBreakdown = todayMood.map(r => ({ rating: r.rating, count: r.count, percent: todayTotal ? Math.round((r.count / todayTotal) * 100) : 0 }))

    const categoryStats = categoryStatsRes.rows
    const bestCategories = [...categoryStats].sort((a, b) => b.avg_rating - a.avg_rating).slice(0, 5)
    const worstCategories = [...categoryStats].sort((a, b) => a.avg_rating - b.avg_rating).slice(0, 5)
    const categoryShare = [...categoryStats]
      .sort((a, b) => b.count - a.count)
      .map(c => ({ ...c, percent: totalRatings ? Math.round((c.count / totalRatings) * 100) : 0 }))

    const highPriorityOpenCount = highPriorityRes.rows[0].count

    return NextResponse.json({
      pulse_score: pulseScore,
      total_feedback: totals.total_feedback,
      percent_positive: percentPositive,
      percent_negative: percentNegative,
      today_mood_breakdown: todayMoodBreakdown,
      best_categories: bestCategories,
      worst_categories: worstCategories,
      category_share: categoryShare,
      high_priority_open_count: highPriorityOpenCount,
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
