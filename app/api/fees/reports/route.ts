import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'
import { withWatchline } from '@/lib/logger'

// GET /api/fees/reports?school_id=X&academic_year=Y
// Returns comprehensive annual financial report data
async function handleGET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id     = p.get('school_id')
    const academic_year = p.get('academic_year')
    if (!school_id || !academic_year) {
      return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [startYStr] = academic_year.split('-')
    const startYear = parseInt(startYStr)

    try {
      // Balance sheet summary
      const { rows: [balance] } = await pool.query(
        `SELECT
           COALESCE(SUM(l.amount_due), 0)                                          AS total_billed,
           COALESCE(SUM(l.amount_paid), 0)                                         AS total_collected,
           COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0)), 0)             AS total_outstanding,
           COALESCE(SUM(COALESCE(l.waiver_amount, 0)), 0)                          AS total_waived,
           COUNT(*) FILTER (WHERE l.status = 'paid')                               AS paid_entries,
           COUNT(*) FILTER (WHERE l.status = 'partial')                            AS partial_entries,
           COUNT(*) FILTER (WHERE l.status IN ('pending','overdue'))                AS unpaid_entries,
           COUNT(*) FILTER (WHERE l.status = 'waived')                             AS waived_entries,
           COUNT(DISTINCT l.student_id)                                            AS total_students
         FROM student_fee_ledger l
         WHERE l.school_id = $1 AND l.academic_year = $2`,
        [school_id, academic_year]
      )

      // Discretionary waivers only (scholarships, hardship, etc.) — excludes the
      // 'carry_forward' waiver_type used internally during year-end/rollover to zero
      // out an old year's unpaid balance, so "Total Waived" reflects actual concessions
      // granted, not administrative bookkeeping. See app/api/fees/stats/route.ts for
      // the same computation used on the Overview tab.
      const { rows: [discretionary] } = await pool.query(
        `SELECT COALESCE(SUM(w.waiver_amount), 0) AS total
         FROM fee_waivers w
         JOIN student_fee_ledger l ON l.id = w.ledger_id
         WHERE w.school_id = $1 AND l.academic_year = $2
           AND COALESCE(w.is_revoked, FALSE) = FALSE
           AND w.waiver_type != 'carry_forward'`,
        [school_id, academic_year]
      ).catch(() => ({ rows: [{ total: balance.total_waived }] }))
      balance.discretionary_waived = discretionary.total

      // Month-wise collection (April to March)
      const { rows: monthly } = await pool.query(
        `SELECT
           TO_CHAR(fp.paid_date, 'Mon YYYY')            AS month,
           DATE_TRUNC('month', fp.paid_date)            AS month_start,
           COUNT(*)                                      AS payment_count,
           SUM(fp.amount)                                AS collected,
           COUNT(DISTINCT fp.student_id)                AS students_paid
         FROM fee_payments fp
         WHERE fp.school_id = $1
           AND fp.payment_status = 'completed'
           AND fp.paid_date >= ($2 || '-04-01')::date
           AND fp.paid_date <  (($3)::text || '-04-01')::date
         GROUP BY month, month_start
         ORDER BY month_start`,
        [school_id, startYear, startYear + 1]
      )

      // Month-wise dues billed (for comparison bar)
      const { rows: monthlyDue } = await pool.query(
        `SELECT
           TO_CHAR(l.due_date, 'Mon YYYY') AS month,
           DATE_TRUNC('month', l.due_date) AS month_start,
           SUM(l.amount_due)               AS billed
         FROM student_fee_ledger l
         WHERE l.school_id = $1 AND l.academic_year = $2
         GROUP BY month, month_start
         ORDER BY month_start`,
        [school_id, academic_year]
      )

      // Class-wise collection (grade + section), enriched: defaulters + fully-paid counts
      const { rows: byGrade } = await pool.query(
        `WITH per_student AS (
           SELECT s.grade, COALESCE(s.section, '') AS section, l.student_id,
                  SUM(l.amount_due)                                                        AS s_due,
                  SUM(l.amount_paid)                                                       AS s_paid,
                  SUM(COALESCE(l.waiver_amount, 0))                                        AS s_waived,
                  SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0)) AS s_out
           FROM student_fee_ledger l
           JOIN students s ON s.id = l.student_id
           WHERE l.school_id = $1 AND l.academic_year = $2
           GROUP BY s.grade, s.section, l.student_id
         )
         SELECT
           grade,
           section,
           COUNT(*)                                       AS students,
           COALESCE(SUM(s_due), 0)                        AS total_due,
           COALESCE(SUM(s_paid), 0)                       AS total_collected,
           COALESCE(SUM(s_waived), 0)                     AS total_waived,
           COALESCE(SUM(s_out), 0)                        AS outstanding,
           COUNT(*) FILTER (WHERE s_out <= 0)             AS fully_paid_students,
           COUNT(*) FILTER (WHERE s_out > 0)              AS defaulter_students
         FROM per_student
         GROUP BY grade, section
         ORDER BY ${gradeOrderSql('grade')}, section`,
        [school_id, academic_year]
      )
      // Discretionary waivers per grade/section (excludes carry_forward bookkeeping)
      const { rows: discByGradeRows } = await pool.query(
        `SELECT s.grade, COALESCE(s.section, '') AS section, COALESCE(SUM(w.waiver_amount), 0) AS total
         FROM fee_waivers w
         JOIN student_fee_ledger l ON l.id = w.ledger_id
         JOIN students s ON s.id = l.student_id
         WHERE l.school_id = $1 AND l.academic_year = $2
           AND COALESCE(w.is_revoked, FALSE) = FALSE
           AND w.waiver_type != 'carry_forward'
         GROUP BY s.grade, s.section`,
        [school_id, academic_year]
      ).catch(() => ({ rows: [] as Array<{grade: string; section: string; total: string}> }))
      const discGradeMap = new Map(discByGradeRows.map((r: {grade: string; section: string; total: string}) => [`${r.grade}|${r.section}`, r.total]))
      for (const g of byGrade) g.discretionary_waived = discGradeMap.get(`${g.grade}|${g.section}`) ?? '0'

      // Category-wise annual summary
      const { rows: byCategory } = await pool.query(
        `SELECT
           fc.id, fc.name AS category_name, fc.frequency,
           COUNT(DISTINCT l.student_id)                              AS students,
           COALESCE(SUM(l.amount_due), 0)                           AS total_due,
           COALESCE(SUM(l.amount_paid), 0)                          AS total_collected,
           COALESCE(SUM(COALESCE(l.waiver_amount, 0)), 0)           AS total_waived,
            COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0)), 0) AS outstanding,
           COUNT(*) FILTER (WHERE l.status = 'paid')                AS paid_count,
           COUNT(*) FILTER (WHERE l.status IN ('pending','overdue')) AS unpaid_count
         FROM student_fee_ledger l
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE l.school_id = $1 AND l.academic_year = $2
         GROUP BY fc.id, fc.name, fc.frequency
         ORDER BY total_due DESC`,
        [school_id, academic_year]
      )

      // Discretionary waivers per category — kept as a separate aggregate (not joined
      // into the query above) since a ledger entry can have more than one fee_waivers
      // row over time; joining would multiply total_due/total_collected/outstanding.
      const { rows: discByCategory } = await pool.query(
        `SELECT fc.id AS fee_category_id, COALESCE(SUM(w.waiver_amount), 0) AS total
         FROM fee_waivers w
         JOIN student_fee_ledger l ON l.id = w.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE l.school_id = $1 AND l.academic_year = $2
           AND COALESCE(w.is_revoked, FALSE) = FALSE
           AND w.waiver_type != 'carry_forward'
         GROUP BY fc.id`,
        [school_id, academic_year]
      ).catch(() => ({ rows: [] }))
      const discMap = new Map(discByCategory.map((r: { fee_category_id: number; total: string }) => [r.fee_category_id, r.total]))
      for (const c of byCategory) c.discretionary_waived = discMap.get(c.id) ?? c.total_waived

      // Payment mode breakdown
      const { rows: byMode } = await pool.query(
        `SELECT payment_mode,
                COUNT(*)   AS count,
                SUM(amount) AS total
         FROM fee_payments
         WHERE school_id = $1 AND payment_status = 'completed'
           AND paid_date >= ($2 || '-04-01')::date
           AND paid_date <  (($3)::text || '-04-01')::date
         GROUP BY payment_mode ORDER BY total DESC`,
        [school_id, startYear, startYear + 1]
      )

      // Full defaulters list (no limit) — defined as outstanding balance > 0, regardless of
      // status, so partially-paid students aren't silently excluded (they still owe money).
      // Matches the same definition already used by the Defaulters CSV export.
      const { rows: defaulters } = await pool.query(
        `SELECT s.name AS student_name, s.roll_number, s.grade, s.section,
                s.parent_name, s.parent_phone,
                SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0)) AS outstanding,
                COUNT(*) FILTER (WHERE l.status = 'overdue') AS overdue_entries,
                COUNT(*) FILTER (WHERE l.status IN ('pending','overdue','partial')) AS unpaid_entries
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         WHERE l.school_id = $1 AND l.academic_year = $2
           AND l.status NOT IN ('paid', 'waived')
           AND GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0) > 0
         GROUP BY s.id, s.name, s.roll_number, s.grade, s.section, s.parent_name, s.parent_phone
         ORDER BY outstanding DESC`,
        [school_id, academic_year]
      )

      return NextResponse.json({ balance, monthly, monthlyDue, byGrade, byCategory, byMode, defaulters })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const GET = withWatchline(handleGET, { route: '/api/fees/reports' })
