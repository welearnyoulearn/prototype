import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { feedbackSourceFilter } from '@/lib/feedback-source'

// Period windows as trusted SQL fragments (never built from user input — the
// ?period= value only selects a key). `prev*` is the equally long window just
// before, for the "vs previous period" deltas. The pool's session time zone is
// IST, so date_trunc('day', now()) is the school's midnight.
const PERIODS = {
  today: { start: `date_trunc('day', now())`, prevStart: `date_trunc('day', now()) - interval '1 day'`, trendDays: 7 },
  '7d': { start: `now() - interval '7 days'`, prevStart: `now() - interval '14 days'`, trendDays: 7 },
  '30d': { start: `now() - interval '30 days'`, prevStart: `now() - interval '60 days'`, trendDays: 30 },
  all: { start: null, prevStart: null, trendDays: 90 },
} as const
type Period = keyof typeof PERIODS

// Category averages at or above this are "doing well"; below it they "need
// attention" — so the two dashboard lists never show the same category.
const GOOD_THRESHOLD = 3.5

// GET /api/feedback/stats?school_id=&source=&period=today|7d|30d|all (default 30d)
// source: see lib/feedback-source.ts (all | general | <qr point id>) — ratings
// are filtered through their submission. Every metric is scoped to the period
// except the open-issue counts, which describe the pipeline's current state.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const school_id = sp.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const periodKey = (sp.get('period') ?? '30d') as Period
    if (!(periodKey in PERIODS)) return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
    const period = PERIODS[periodKey]

    const params: unknown[] = [access.schoolId]
    const src = feedbackSourceFilter(sp.get('source'), 's', params)
    if (src === null) return NextResponse.json({ error: 'Invalid source' }, { status: 400 })

    const inPeriod = period.start ? ` AND s.created_at >= ${period.start}` : ''
    const inPrev = period.prevStart ? ` AND s.created_at >= ${period.prevStart} AND s.created_at < ${period.start}` : ''
    const ratingsFrom = `feedback_submission_ratings r JOIN feedback_submissions s ON s.id = r.submission_id`
    const base = `s.school_id = $1 ${src}`

    const [totalsRes, prevRes, moodRes, categoryRes, roleRes, trendRes, issuesRes] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM feedback_submissions s WHERE ${base}${inPeriod})::int AS total_feedback,
           (SELECT COUNT(*) FROM feedback_submissions s WHERE ${base}${inPeriod} AND s.advanced_form_type IS NOT NULL)::int AS form_submissions,
           COUNT(*)::int AS total_ratings,
           AVG(r.rating)::float AS avg_rating,
           COUNT(*) FILTER (WHERE r.rating >= 4)::int AS positive_count,
           COUNT(*) FILTER (WHERE r.rating = 3)::int AS neutral_count,
           COUNT(*) FILTER (WHERE r.rating <= 2)::int AS negative_count
         FROM ${ratingsFrom} WHERE ${base}${inPeriod}`,
        params
      ),
      period.prevStart
        ? pool.query(
            `SELECT
               (SELECT COUNT(*) FROM feedback_submissions s WHERE ${base}${inPrev})::int AS total_feedback,
               AVG(r.rating)::float AS avg_rating
             FROM ${ratingsFrom} WHERE ${base}${inPrev}`,
            params
          )
        : Promise.resolve(null),
      pool.query(
        `SELECT r.rating, COUNT(*)::int AS count FROM ${ratingsFrom}
         WHERE ${base}${inPeriod} GROUP BY r.rating`,
        params
      ),
      pool.query(
        `SELECT r.category_key, r.category_label, COUNT(*)::int AS count, AVG(r.rating)::float AS avg_rating,
                COUNT(*) FILTER (WHERE r.rating <= 2)::int AS negative_count
         FROM ${ratingsFrom} WHERE ${base}${inPeriod}
         GROUP BY r.category_key, r.category_label`,
        params
      ),
      pool.query(
        `SELECT s.role, COUNT(*)::int AS count FROM feedback_submissions s
         WHERE ${base}${inPeriod} GROUP BY s.role`,
        params
      ),
      // One row per day (zero-filled) for the trend line
      pool.query(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                COALESCE(sub.count, 0)::int AS count,
                rat.avg_rating::float AS avg_rating
         FROM generate_series(date_trunc('day', now()) - interval '${period.trendDays - 1} days', date_trunc('day', now()), interval '1 day') AS d(day)
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS count FROM feedback_submissions s
           WHERE ${base} AND s.created_at >= d.day AND s.created_at < d.day + interval '1 day'
         ) sub ON TRUE
         LEFT JOIN LATERAL (
           SELECT AVG(r.rating) AS avg_rating FROM ${ratingsFrom}
           WHERE ${base} AND s.created_at >= d.day AND s.created_at < d.day + interval '1 day'
         ) rat ON TRUE
         ORDER BY d.day`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE r.priority = 'high')::int AS high_open,
                COUNT(*)::int AS all_open
         FROM ${ratingsFrom}
         WHERE ${base} AND r.priority IS NOT NULL AND r.status = 'open'`,
        params
      ),
    ])

    const t = totalsRes.rows[0]
    const totalRatings: number = t.total_ratings || 0
    const pct = (n: number) => (totalRatings ? Math.round((n / totalRatings) * 100) : 0)
    // Pulse = average rating mapped onto 0–100 (1★ → 0, 5★ → 100); null with no ratings
    const pulse = (avg: number | null) => (avg == null ? null : Math.round(((avg - 1) / 4) * 100))

    const prev = prevRes?.rows[0] ?? null
    const categories = categoryRes.rows
    const bestCategories = categories.filter(c => c.avg_rating >= GOOD_THRESHOLD)
      .sort((a, b) => b.avg_rating - a.avg_rating || b.count - a.count).slice(0, 5)
    const attentionCategories = categories.filter(c => c.avg_rating < GOOD_THRESHOLD)
      .sort((a, b) => a.avg_rating - b.avg_rating || b.count - a.count).slice(0, 5)

    return NextResponse.json({
      period: periodKey,
      pulse_score: pulse(t.avg_rating),
      avg_rating: t.avg_rating,
      total_feedback: t.total_feedback,
      form_submissions: t.form_submissions,
      total_ratings: totalRatings,
      percent_positive: pct(t.positive_count),
      percent_neutral: pct(t.neutral_count),
      percent_negative: pct(t.negative_count),
      previous: prev && { total_feedback: prev.total_feedback, pulse_score: pulse(prev.avg_rating) },
      mood_breakdown: [5, 4, 3, 2, 1].map(rating => {
        const count = moodRes.rows.find(m => m.rating === rating)?.count ?? 0
        return { rating, count, percent: pct(count) }
      }),
      category_stats: [...categories].sort((a, b) => b.count - a.count),
      best_categories: bestCategories,
      attention_categories: attentionCategories,
      by_role: roleRes.rows.sort((a, b) => b.count - a.count),
      trend: trendRes.rows,
      high_priority_open_count: issuesRes.rows[0].high_open,
      open_issues_count: issuesRes.rows[0].all_open,
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
