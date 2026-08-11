import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/expenses/metrics?school_id=&from=&to=
// Powers the dashboard: total spent + category breakdown for [from, to],
// plus the same window shifted one period back for a vs-previous-period trend.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id = p.get('school_id')
    const from = p.get('from')
    const to = p.get('to')
    if (!school_id || !from || !to) return NextResponse.json({ error: 'school_id, from, and to are required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      // Previous period of equal length, immediately before `from`, for the trend %.
      const { rows: [{ prev_from, prev_to }] } = await pool.query(
        `SELECT ($1::date - ($2::date - $1::date) - INTERVAL '1 day')::date AS prev_from, ($1::date - INTERVAL '1 day')::date AS prev_to`,
        [from, to]
      )

      const [currentRes, prevRes, byCategoryRes, recentRes] = await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS count
           FROM expenses WHERE school_id = $1 AND is_deleted = FALSE AND expense_date BETWEEN $2 AND $3`,
          [school_id, from, to]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total
           FROM expenses WHERE school_id = $1 AND is_deleted = FALSE AND expense_date BETWEEN $2 AND $3`,
          [school_id, prev_from, prev_to]
        ),
        pool.query(
          `SELECT ec.id AS category_id, ec.name AS category_name,
                  COALESCE(SUM(e.amount),0) AS total, COUNT(e.id)::int AS count
           FROM expense_categories ec
           LEFT JOIN expenses e ON e.category_id = ec.id AND e.is_deleted = FALSE AND e.expense_date BETWEEN $2 AND $3
           WHERE ec.school_id = $1
           GROUP BY ec.id, ec.name
           HAVING COALESCE(SUM(e.amount),0) > 0
           ORDER BY total DESC`,
          [school_id, from, to]
        ),
        pool.query(
          `SELECT e.id, e.title, e.amount, e.expense_date, e.payee_name, ec.name AS category_name
           FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
           WHERE e.school_id = $1 AND e.is_deleted = FALSE
           ORDER BY e.expense_date DESC, e.id DESC LIMIT 8`,
          [school_id]
        ),
      ])

      const total = Number(currentRes.rows[0].total)
      const prevTotal = Number(prevRes.rows[0].total)
      const trendPct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null
      const topCategory = byCategoryRes.rows[0] ?? null

      return NextResponse.json({
        total_spent: total,
        entry_count: currentRes.rows[0].count,
        previous_period_total: prevTotal,
        trend_pct: trendPct,
        top_category: topCategory ? { name: topCategory.category_name, total: Number(topCategory.total) } : null,
        by_category: byCategoryRes.rows.map(r => ({ category_id: r.category_id, category_name: r.category_name, total: Number(r.total), count: r.count })),
        recent: recentRes.rows,
      })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to compute metrics' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
