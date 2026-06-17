import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

const ENSURE = `
  CREATE TABLE IF NOT EXISTS fee_day_close (
    id            SERIAL PRIMARY KEY,
    school_id     INTEGER NOT NULL,
    close_date    DATE    NOT NULL,
    total_cash    NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_cheque  NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_upi     NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_online  NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_dd      NUMERIC(10,2) NOT NULL DEFAULT 0,
    system_cash   NUMERIC(10,2) NOT NULL DEFAULT 0,
    actual_cash   NUMERIC(10,2),
    difference    NUMERIC(10,2),
    receipt_from  TEXT,
    receipt_to    TEXT,
    txn_count     INTEGER NOT NULL DEFAULT 0,
    submitted_by  TEXT NOT NULL,
    submitted_at  TIMESTAMPTZ DEFAULT NOW(),
    notes         TEXT,
    UNIQUE(school_id, close_date)
  )
`

// GET /api/fees/day-close?school_id=X&date=YYYY-MM-DD
// Returns collection summary for a date (or today if no date)
export async function GET(req: NextRequest) {
  const p         = req.nextUrl.searchParams
  const school_id = p.get('school_id')
  const date      = p.get('date') || new Date().toISOString().slice(0, 10)

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await pool.query(ENSURE)

    // Today's payment breakdown by mode
    const { rows: byMode } = await pool.query(
      `SELECT payment_mode,
              COUNT(*) AS count,
              SUM(amount) AS total
       FROM fee_payments
       WHERE school_id = $1
         AND paid_date = $2
         AND payment_status = 'completed'
       GROUP BY payment_mode`,
      [school_id, date]
    )

    // Receipt range today
    const { rows: [receipts] } = await pool.query(
      `SELECT MIN(receipt_number) AS first_receipt,
              MAX(receipt_number) AS last_receipt,
              COUNT(*) AS count,
              SUM(amount) AS total
       FROM fee_payments
       WHERE school_id = $1 AND paid_date = $2 AND payment_status = 'completed'`,
      [school_id, date]
    )

    // Recent payments today (for review)
    const { rows: todayPayments } = await pool.query(
      `SELECT fp.*, s.name AS student_name, s.grade, s.section,
              fc.name AS fee_head_name, l.period_label
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE fp.school_id = $1 AND fp.paid_date = $2 AND fp.payment_status = 'completed'
       ORDER BY fp.created_at DESC`,
      [school_id, date]
    )

    // Check if already closed
    const { rows: [existing] } = await pool.query(
      `SELECT * FROM fee_day_close WHERE school_id = $1 AND close_date = $2`,
      [school_id, date]
    )

    const modeMap: Record<string, { count: number; total: number }> = {}
    byMode.forEach((r: { payment_mode: string; count: string; total: string }) => {
      modeMap[r.payment_mode] = { count: parseInt(r.count), total: parseFloat(r.total) }
    })

    return NextResponse.json({
      date,
      by_mode: modeMap,
      receipts: {
        first: receipts?.first_receipt || null,
        last: receipts?.last_receipt || null,
        count: parseInt(receipts?.count || '0'),
        total: parseFloat(receipts?.total || '0'),
      },
      payments: todayPayments,
      already_closed: !!existing,
      close_record: existing || null,
    })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/fees/day-close
// Body: { school_id, date, actual_cash, submitted_by, notes? }
export async function POST(req: NextRequest) {
  try {
    await pool.query(ENSURE)
    const { school_id, date, actual_cash, submitted_by: clientActor, notes } = await req.json()
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const submitted_by = clientActor || access.actor
    if (!school_id || !date) {
      return NextResponse.json({ error: 'school_id, date required' }, { status: 400 })
    }

    // Get system totals for the day
    const { rows: byMode } = await pool.query(
      `SELECT payment_mode, SUM(amount) AS total
       FROM fee_payments
       WHERE school_id = $1 AND paid_date = $2 AND payment_status = 'completed'
       GROUP BY payment_mode`,
      [school_id, date]
    )
    const modeMap: Record<string, number> = {}
    byMode.forEach((r: { payment_mode: string; total: string }) => {
      modeMap[r.payment_mode] = parseFloat(r.total)
    })

    const { rows: [receipts] } = await pool.query(
      `SELECT MIN(receipt_number) AS first_receipt, MAX(receipt_number) AS last_receipt, COUNT(*) AS cnt
       FROM fee_payments WHERE school_id = $1 AND paid_date = $2 AND payment_status = 'completed'`,
      [school_id, date]
    )

    const systemCash = modeMap['cash'] || 0
    const diff = actual_cash != null ? parseFloat(actual_cash) - systemCash : null

    const { rows: [record] } = await pool.query(
      `INSERT INTO fee_day_close
         (school_id, close_date, total_cash, total_cheque, total_upi, total_online, total_dd,
          system_cash, actual_cash, difference, receipt_from, receipt_to, txn_count,
          submitted_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (school_id, close_date)
       DO UPDATE SET actual_cash=$9, difference=$10, submitted_by=$14, notes=$15, submitted_at=NOW()
       RETURNING *`,
      [school_id, date,
       systemCash, modeMap['cheque'] || 0, modeMap['upi'] || 0,
       modeMap['online'] || 0, modeMap['dd'] || 0,
       systemCash, actual_cash != null ? parseFloat(actual_cash) : null, diff,
       receipts?.first_receipt || null, receipts?.last_receipt || null,
       parseInt(receipts?.cnt || '0'),
       submitted_by, notes || null]
    )

    return NextResponse.json({ success: true, record })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to close day' }, { status: 500 }) }
}
