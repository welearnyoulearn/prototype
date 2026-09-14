import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/archive?school_id=X
//
// Read-only landing list for the "past records" archive: every academic year a
// school has ever had, each with its financial headline (billed/collected/waived/
// unpaid — same shape as /api/fees/reports's summary) and its fee_year_close state
// (closed / reopened / never closed). Nothing here is a new source of truth — it's
// a join over academic_years, fee_year_close, and an aggregate over
// student_fee_ledger, all of which already exist. Per-year line-item drill-down
// stays on the existing /api/fees/ledger and /api/fees/reports endpoints (both
// already accept academic_year), so this route only needs to answer "which years
// exist and what's their one-line summary" — not duplicate either of those.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows } = await pool.query(
      `SELECT
         ay.label                          AS academic_year,
         ay.start_date, ay.end_date, ay.is_current,
         COALESCE(SUM(l.amount_due), 0)                                                             AS total_billed,
         COALESCE(SUM(l.amount_paid), 0)                                                             AS total_collected,
         COALESCE(SUM(COALESCE(l.waiver_amount, 0)), 0)                                              AS total_waived,
         COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)), 0)   AS total_unpaid,
         COUNT(DISTINCT l.student_id)                                                                AS student_count,
         fyc.closed_at, fyc.closed_by, fyc.is_reopened,
         fyc.carried_count, fyc.carried_total, fyc.writeoff_count, fyc.writeoff_total,
         fyc.open_count, fyc.open_total
       FROM academic_years ay
       LEFT JOIN student_fee_ledger l ON l.school_id = ay.school_id AND l.academic_year = ay.label
       LEFT JOIN fee_year_close fyc ON fyc.school_id = ay.school_id AND fyc.academic_year = ay.label
       WHERE ay.school_id = $1
       GROUP BY ay.id, ay.label, ay.start_date, ay.end_date, ay.is_current,
                fyc.closed_at, fyc.closed_by, fyc.is_reopened,
                fyc.carried_count, fyc.carried_total, fyc.writeoff_count, fyc.writeoff_total,
                fyc.open_count, fyc.open_total
       ORDER BY ay.start_date DESC`,
      [school_id]
    )

    const years = rows.map(r => ({
      academic_year: r.academic_year,
      start_date: r.start_date,
      end_date: r.end_date,
      is_current: r.is_current,
      student_count: parseInt(r.student_count),
      summary: {
        total_billed: parseFloat(r.total_billed),
        total_collected: parseFloat(r.total_collected),
        total_waived: parseFloat(r.total_waived),
        total_unpaid: parseFloat(r.total_unpaid),
      },
      close_status: r.closed_at ? {
        closed_at: r.closed_at,
        closed_by: r.closed_by,
        is_reopened: r.is_reopened,
        carried: { count: r.carried_count ?? 0, total: parseFloat(r.carried_total ?? 0) },
        writeoff: { count: r.writeoff_count ?? 0, total: parseFloat(r.writeoff_total ?? 0) },
        open: { count: r.open_count ?? 0, total: parseFloat(r.open_total ?? 0) },
      } : null,
    }))

    return NextResponse.json({ years })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
