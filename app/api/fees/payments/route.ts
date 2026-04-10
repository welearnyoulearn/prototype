import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/fees/payments?school_id=X&student_id=Y&ledger_id=Z
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id  = p.get('school_id')
  const student_id = p.get('student_id')
  const ledger_id  = p.get('ledger_id')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const conditions = ['fp.school_id = $1']
  const values: (string | number)[] = [school_id]
  if (student_id) { values.push(student_id); conditions.push(`fp.student_id = $${values.length}`) }
  if (ledger_id)  { values.push(ledger_id);  conditions.push(`fp.ledger_id = $${values.length}`) }

  try {
    const { rows } = await pool.query(
      `SELECT fp.*, s.name AS student_name, s.roll_number, s.grade, s.section,
              fc.name AS category_name, l.period_label
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY fp.created_at DESC`,
      values
    )
    return NextResponse.json(rows)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/fees/payments — record a payment (offline or online)
export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    const {
      school_id, student_id, ledger_id,
      amount, payment_mode, transaction_ref,
      collected_by_name, notes, paid_date,
      payment_status = 'completed', // online payments may start as pending_verification
    } = await req.json()

    if (!school_id || !student_id || !ledger_id || !amount || !payment_mode) {
      return NextResponse.json({ error: 'school_id, student_id, ledger_id, amount, payment_mode required' }, { status: 400 })
    }

    await client.query('BEGIN')

    // Generate receipt number
    const { rows: [seq] } = await client.query(`SELECT nextval('receipt_number_seq') AS n`)
    const receipt_number = `RCP-${new Date().getFullYear()}-${String(seq.n).padStart(6, '0')}`

    // Insert payment
    const { rows: [payment] } = await client.query(
      `INSERT INTO fee_payments
         (school_id, student_id, ledger_id, amount, payment_mode, payment_status,
          receipt_number, transaction_ref, paid_date, collected_by_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [school_id, student_id, ledger_id, amount, payment_mode, payment_status,
       receipt_number, transaction_ref || null, paid_date || new Date().toISOString().slice(0,10),
       collected_by_name || null, notes || null]
    )

    if (payment_status === 'completed') {
      // Update ledger amount_paid
      await client.query(
        `UPDATE student_fee_ledger
         SET amount_paid = amount_paid + $1,
             status = CASE
               WHEN amount_paid + $1 >= amount_due THEN 'paid'
               WHEN amount_paid + $1 > 0 THEN 'partial'
               ELSE status
             END
         WHERE id = $2`,
        [amount, ledger_id]
      )
    }

    await client.query('COMMIT')

    // Fetch full payment with student info for receipt
    const { rows: [full] } = await pool.query(
      `SELECT fp.*, s.name AS student_name, s.roll_number, s.grade, s.section, s.parent_name,
              fc.name AS category_name, l.period_label, l.amount_due, l.amount_paid AS ledger_paid,
              sc.name AS school_name
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       JOIN schools sc ON sc.id = fp.school_id
       WHERE fp.id = $1`,
      [payment.id]
    )
    return NextResponse.json(full, { status: 201 })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  } finally { client.release() }
}
