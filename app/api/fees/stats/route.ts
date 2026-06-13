import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/stats?school_id=X&academic_year=2025-26
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id    = p.get('school_id')
    const academic_year = p.get('academic_year')

    if (!school_id || !academic_year) {
      return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      // Auto-mark overdue
      await pool.query(
        `UPDATE student_fee_ledger SET status = 'overdue'
         WHERE school_id = $1 AND academic_year = $2 AND status = 'pending' AND due_date < CURRENT_DATE`,
        [school_id, academic_year]
      )

      const { rows: [summary] } = await pool.query(
        `SELECT
           COUNT(DISTINCT l.student_id)                                              AS total_students,
           COALESCE(SUM(l.amount_due), 0)                                            AS total_due,
           COALESCE(SUM(l.amount_paid), 0)                                           AS total_collected,
           COALESCE(SUM(l.amount_due - l.amount_paid), 0)                            AS total_outstanding,
           COUNT(*) FILTER (WHERE l.status = 'paid')                                 AS paid_count,
           COUNT(*) FILTER (WHERE l.status = 'partial')                              AS partial_count,
           COUNT(*) FILTER (WHERE l.status = 'pending')                              AS pending_count,
           COUNT(*) FILTER (WHERE l.status = 'overdue')                              AS overdue_count,
           COUNT(*) FILTER (WHERE l.status = 'waived')                               AS waived_count,
           COUNT(DISTINCT l.student_id) FILTER (WHERE l.status IN ('overdue','pending') AND l.amount_paid = 0) AS defaulters_count
         FROM student_fee_ledger l
         WHERE l.school_id = $1 AND l.academic_year = $2`,
        [school_id, academic_year]
      )

      // Collection by category
      const { rows: by_category } = await pool.query(
        `SELECT fc.name AS category_name, fc.frequency,
                COALESCE(SUM(l.amount_due), 0)  AS total_due,
                COALESCE(SUM(l.amount_paid), 0) AS total_collected,
                COUNT(*) FILTER (WHERE l.status = 'overdue') AS overdue_count
         FROM student_fee_ledger l
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE l.school_id = $1 AND l.academic_year = $2
         GROUP BY fc.id, fc.name, fc.frequency
         ORDER BY total_due DESC`,
        [school_id, academic_year]
      )

      // Monthly collection trend (last 12 months of payments)
      const { rows: monthly_trend } = await pool.query(
        `SELECT TO_CHAR(fp.paid_date, 'Mon YYYY') AS month,
                DATE_TRUNC('month', fp.paid_date) AS month_start,
                COALESCE(SUM(fp.amount), 0) AS collected
         FROM fee_payments fp
         WHERE fp.school_id = $1
           AND fp.payment_status = 'completed'
           AND fp.paid_date >= CURRENT_DATE - INTERVAL '12 months'
         GROUP BY month, month_start
         ORDER BY month_start`,
        [school_id]
      )

      // Top defaulters
      const { rows: top_defaulters } = await pool.query(
        `SELECT s.id AS student_id, s.name AS student_name, s.grade, s.section, s.roll_number,
                SUM(l.amount_due - l.amount_paid) AS outstanding,
                COUNT(*) AS overdue_entries
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         WHERE l.school_id = $1 AND l.academic_year = $2
           AND l.status IN ('overdue','pending') AND l.amount_paid < l.amount_due
         GROUP BY s.id, s.name, s.grade, s.section, s.roll_number
         ORDER BY outstanding DESC
         LIMIT 10`,
        [school_id, academic_year]
      )

      // Payment mode breakdown — filter to this academic year (Apr startYear → Mar endYear)
      const { rows: by_payment_mode } = await pool.query(
        `SELECT payment_mode, COUNT(*) AS count, SUM(amount) AS total
         FROM fee_payments
         WHERE school_id = $1 AND payment_status = 'completed'
           AND paid_date >= (SPLIT_PART($2, '-', 1) || '-04-01')::date
           AND paid_date <  ((SPLIT_PART($2, '-', 1)::int + 1)::text || '-04-01')::date
         GROUP BY payment_mode ORDER BY total DESC`,
        [school_id, academic_year]
      )

      // Class-wise (grade + section) collection breakdown for Overview analysis
      const { rows: by_class } = await pool.query(
        `WITH per_student AS (
           SELECT s.grade, COALESCE(s.section, '') AS section, l.student_id,
                  SUM(l.amount_due)  AS s_due,
                  SUM(l.amount_paid) AS s_paid,
                  SUM(GREATEST(l.amount_due - l.amount_paid, 0)) AS s_out
           FROM student_fee_ledger l
           JOIN students s ON s.id = l.student_id
           WHERE l.school_id = $1 AND l.academic_year = $2
           GROUP BY s.grade, s.section, l.student_id
         )
         SELECT grade, section,
                COUNT(*)                            AS students,
                COALESCE(SUM(s_due), 0)             AS total_due,
                COALESCE(SUM(s_paid), 0)            AS total_collected,
                COALESCE(SUM(s_out), 0)            AS outstanding,
                COUNT(*) FILTER (WHERE s_out <= 0) AS fully_paid_students,
                COUNT(*) FILTER (WHERE s_out > 0)  AS defaulter_students
         FROM per_student
         GROUP BY grade, section
         ORDER BY grade::int NULLS LAST, section`,
        [school_id, academic_year]
      )

      // Students who are active but have NO ledger rows for this year (need billing)
      const { rows: [{ unbilled_students }] } = await pool.query(
        `SELECT COUNT(*) AS unbilled_students
         FROM students s
         WHERE s.school_id = $1 AND s.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM student_fee_ledger l
             WHERE l.student_id = s.id AND l.academic_year = $2
           )`,
        [school_id, academic_year]
      )

      return NextResponse.json({
        summary,
        by_category,
        monthly_trend,
        top_defaulters,
        by_payment_mode,
        by_class,
        unbilled_students: Number(unbilled_students),
      })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
