import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/parent/fees?school_id=X&student_id=Y&academic_year=2025-26
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id   = p.get('school_id')
  const student_id  = p.get('student_id')
  const academic_year = p.get('academic_year') || '2025-26'
  if (!school_id || !student_id) return NextResponse.json({ error: 'school_id, student_id required' }, { status: 400 })

  try {
    // Auto-mark overdue
    await pool.query(
      `UPDATE student_fee_ledger SET status = 'overdue'
       WHERE school_id = $1 AND student_id = $2 AND status = 'pending' AND due_date < CURRENT_DATE`,
      [school_id, student_id]
    )

    const { rows: ledger } = await pool.query(
      `SELECT l.*, fc.name AS category_name, fc.frequency,
              (l.amount_due - l.amount_paid) AS balance
       FROM student_fee_ledger l
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE l.school_id = $1 AND l.student_id = $2 AND l.academic_year = $3
       ORDER BY l.due_date ASC`,
      [school_id, student_id, academic_year]
    )

    const { rows: payments } = await pool.query(
      `SELECT fp.*, fc.name AS category_name, l.period_label
       FROM fee_payments fp
       JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE fp.school_id = $1 AND fp.student_id = $2
       ORDER BY fp.paid_date DESC`,
      [school_id, student_id]
    )

    const total_due       = ledger.reduce((s, r) => s + Number(r.amount_due), 0)
    const total_paid      = ledger.reduce((s, r) => s + Number(r.amount_paid), 0)
    const total_outstanding = ledger.reduce((s, r) => s + Number(r.balance), 0)
    const overdue_count   = ledger.filter(r => r.status === 'overdue').length

    return NextResponse.json({ ledger, payments, summary: { total_due, total_paid, total_outstanding, overdue_count } })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/parent/fees — parent initiates online payment (marks as pending_verification)
export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    const { school_id, student_id, ledger_id, amount, transaction_ref, upi_id } = await req.json()
    if (!school_id || !student_id || !ledger_id || !amount) {
      return NextResponse.json({ error: 'school_id, student_id, ledger_id, amount required' }, { status: 400 })
    }

    await client.query('BEGIN')

    const { rows: [seq] } = await client.query(`SELECT nextval('receipt_number_seq') AS n`)
    const receipt_number = `RCP-${new Date().getFullYear()}-${String(seq.n).padStart(6, '0')}`

    const { rows: [payment] } = await client.query(
      `INSERT INTO fee_payments
         (school_id, student_id, ledger_id, amount, payment_mode, payment_status,
          receipt_number, transaction_ref, paid_date, notes)
       VALUES ($1,$2,$3,$4,'online','pending_verification',$5,$6,CURRENT_DATE,$7)
       RETURNING *`,
      [school_id, student_id, ledger_id, amount, receipt_number,
       transaction_ref || null,
       upi_id ? `Parent initiated via UPI: ${upi_id}` : 'Parent initiated online payment']
    )

    await client.query('COMMIT')
    return NextResponse.json({
      ...payment,
      message: 'Payment submitted. Admin will verify and mark as confirmed shortly.',
    }, { status: 201 })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    return NextResponse.json({ error: 'Failed to submit payment' }, { status: 500 })
  } finally { client.release() }
}
