import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/passout?school_id=X
// Returns passout ledger overview: list of passout students with their outstanding dues
// and recent collections. Used by the Overview tab "Passout Students Pending Bills" panel.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id = p.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      // Self-heal: ensure tables exist before querying
      await pool.query(`
        CREATE TABLE IF NOT EXISTS passout_students (
          id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
          passout_year TEXT NOT NULL, moved_by TEXT NOT NULL, moved_at TIMESTAMPTZ DEFAULT NOW(),
          notes TEXT, UNIQUE(school_id, student_id)
        )
      `).catch(() => {})

      // Summary stats for the passout panel
      const { rows: [summary] } = await pool.query(
        `SELECT
           COUNT(DISTINCT l.student_id)                                                            AS passout_students,
           COALESCE(SUM(l.amount_due), 0)                                                          AS total_billed,
           COALESCE(SUM(l.amount_paid), 0)                                                         AS total_collected,
           COALESCE(SUM(COALESCE(l.waiver_amount, 0)), 0)                                          AS total_waived,
           COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)), 0) AS total_outstanding
         FROM student_fee_ledger l
         WHERE l.school_id = $1 AND l.academic_year = 'passout'`,
        [school_id]
      )

      // Per-student passout dues
      const { rows: students } = await pool.query(
        `SELECT
           l.student_id,
           s.name AS student_name,
           s.roll_number,
           s.grade,
           s.section,
           ps.passout_year,
           ps.moved_at,
           COALESCE(SUM(l.amount_due), 0)                                                          AS total_billed,
           COALESCE(SUM(l.amount_paid), 0)                                                         AS total_collected,
           COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)), 0) AS outstanding
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         LEFT JOIN passout_students ps ON ps.student_id = l.student_id AND ps.school_id = l.school_id
         WHERE l.school_id = $1 AND l.academic_year = 'passout'
           AND l.status IN ('pending', 'partial', 'overdue')
         GROUP BY l.student_id, s.name, s.roll_number, s.grade, s.section, ps.passout_year, ps.moved_at
         ORDER BY outstanding DESC`,
        [school_id]
      )

      // Recent collections from passout ledger (last 10)
      const { rows: recent_collections } = await pool.query(
        `SELECT fp.id, fp.student_id, s.name AS student_name,
                fp.amount, fp.payment_mode, fp.paid_date, fp.receipt_number,
                fp.collected_by_name, l.period_label
         FROM fee_payments fp
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         JOIN students s ON s.id = fp.student_id
         WHERE fp.school_id = $1
           AND l.academic_year = 'passout'
           AND fp.payment_status = 'completed'
         ORDER BY fp.paid_date DESC, fp.created_at DESC
         LIMIT 10`,
        [school_id]
      ).catch(() => ({ rows: [] }))

      return NextResponse.json({
        summary: {
          passout_students: Number(summary.passout_students),
          total_billed: parseFloat(summary.total_billed),
          total_collected: parseFloat(summary.total_collected),
          total_waived: parseFloat(summary.total_waived),
          total_outstanding: parseFloat(summary.total_outstanding),
        },
        students,
        recent_collections,
      })
    } catch (e) {
      console.error('[passout GET]', e)
      return NextResponse.json({ error: 'Failed to load passout data' }, { status: 500 })
    }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/fees/passout/bills?school_id=X&student_id=Y
// Returns all passout ledger entries for a single student (for the collect modal)
// This is accessed via a query param, not a sub-route, for simplicity.
// (The collect flow uses the same /api/fees/payments route as regular dues.)
