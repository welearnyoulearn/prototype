import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/removed-students?school_id=X
// Every non-active student (removed/left AND graduated/passout alike) who still
// carries an unresolved balance — the single place to see all leavers' dues,
// whether they were soft-deleted or routed through the passout ledger at year-end.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id = p.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      const { rows: [summary] } = await pool.query(
        `SELECT
           COUNT(DISTINCT l.student_id) AS student_count,
           COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)), 0) AS total_outstanding
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         WHERE l.school_id = $1
           AND s.status IS NOT NULL AND s.status != 'active'
           AND l.status IN ('pending', 'partial', 'overdue')
           AND GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0`,
        [school_id]
      )

      const { rows: students } = await pool.query(
        `SELECT
           l.student_id,
           s.name AS student_name,
           s.roll_number,
           s.grade,
           s.section,
           s.status AS student_status,
           ps.passout_year,
           COALESCE(SUM(l.amount_due), 0) AS total_billed,
           COALESCE(SUM(l.amount_paid), 0) AS total_collected,
           COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)), 0) AS outstanding,
           array_agg(DISTINCT l.academic_year) AS academic_years
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         LEFT JOIN passout_students ps ON ps.student_id = l.student_id AND ps.school_id = l.school_id
         WHERE l.school_id = $1
           AND s.status IS NOT NULL AND s.status != 'active'
           AND l.status IN ('pending', 'partial', 'overdue')
           AND GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0
         GROUP BY l.student_id, s.name, s.roll_number, s.grade, s.section, s.status, ps.passout_year
         ORDER BY outstanding DESC`,
        [school_id]
      )

      return NextResponse.json({
        summary: {
          student_count: Number(summary.student_count),
          total_outstanding: parseFloat(summary.total_outstanding),
        },
        students,
      })
    } catch (e) {
      console.error('[removed-students GET]', e)
      return NextResponse.json({ error: 'Failed to load removed-student dues' }, { status: 500 })
    }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
