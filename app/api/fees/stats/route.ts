import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/fees/stats?school_id=X&academic_year=2025-26
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id    = p.get('school_id')
  const academic_year = p.get('academic_year')

  if (!school_id || !academic_year) {
    return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
  }

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

    // Payment mode breakdown
    const { rows: by_payment_mode } = await pool.query(
      `SELECT payment_mode, COUNT(*) AS count, SUM(amount) AS total
       FROM fee_payments
       WHERE school_id = $1 AND payment_status = 'completed'
         AND paid_date >= TO_DATE(SPLIT_PART($2, '-', 1) || '-04-01', 'YYYY-MM-DD')
         AND paid_date <  TO_DATE(SPLIT_PART($2, '-', 1) || '-04-01', 'YYYY-MM-DD') + INTERVAL '1 year'
       GROUP BY payment_mode ORDER BY total DESC`,
      [school_id, academic_year]
    )

    return NextResponse.json({
      summary,
      by_category,
      monthly_trend,
      top_defaulters,
      by_payment_mode,
    })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
