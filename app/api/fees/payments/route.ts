import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/payments?school_id=X&student_id=Y&ledger_id=Z
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id  = p.get('school_id')
    const student_id = p.get('student_id')
    const ledger_id  = p.get('ledger_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/fees/payments
//
// Single-entry mode (existing):
//   { school_id, student_id, ledger_id, amount, payment_mode, ... }
//
// Multi-entry FIFO mode (new — for "pay selected" or "pay all"):
//   { school_id, student_id, ledger_ids: [1,2,3], total_amount, payment_mode, ... }
//   Server allocates total_amount across ledger_ids in order (oldest first).
//   All allocations share one receipt_number.
//
export async function POST(req: NextRequest) {
  try {
    // ── Parse and validate BEFORE acquiring a pool connection ──────────────────
    const body = await req.json()
    const {
      school_id, student_id,
      ledger_id,               // single-entry mode
      ledger_ids,              // multi-entry mode (array)
      amount,                  // single-entry
      total_amount,            // multi-entry total
      payment_mode, transaction_ref,
      collected_by_name: clientCollector, notes, paid_date,
      payment_status = 'completed',
    } = body

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const collected_by_name = clientCollector || access.actor

    if (!school_id || !student_id || !payment_mode) {
      return NextResponse.json({ error: 'school_id, student_id, payment_mode required' }, { status: 400 })
    }

    if (paid_date !== undefined && paid_date !== null) {
      const dateRe = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRe.test(paid_date)) {
        return NextResponse.json({ error: 'paid_date must be YYYY-MM-DD' }, { status: 400 })
      }
      const d = new Date(paid_date)
      const now = new Date()
      const minDate = new Date('2000-01-01')
      if (isNaN(d.getTime()) || d > now || d < minDate) {
        return NextResponse.json({ error: 'paid_date must be a valid past date' }, { status: 400 })
      }
    }

    const isMulti = Array.isArray(ledger_ids) && ledger_ids.length > 0

    if (!isMulti && (!ledger_id || !amount)) {
      return NextResponse.json({ error: 'Single mode: ledger_id and amount required' }, { status: 400 })
    }
    if (isMulti && !total_amount) {
      return NextResponse.json({ error: 'Multi mode: total_amount required' }, { status: 400 })
    }

    // ── Acquire connection only after validation passes ─────────────────────────
    const client = await pool.connect()
    try {
      // Guard: block payments against a closed academic year
      const guardIds = isMulti ? ledger_ids : (ledger_id ? [ledger_id] : [])
      if (guardIds.length > 0) {
        const { rows: [locked] } = await client.query(
          `SELECT 1
           FROM student_fee_ledger l
           JOIN fee_year_close yc ON yc.school_id = l.school_id AND yc.academic_year = l.academic_year AND yc.is_reopened = FALSE
           WHERE l.id = ANY($1) LIMIT 1`,
          [guardIds]
        ).catch(() => ({ rows: [] }))
        if (locked) {
          return NextResponse.json({ error: 'This academic year is closed. Reopen it to record payments.' }, { status: 409 })
        }
      }

      await client.query('BEGIN')

      // Generate one receipt number shared across all allocations
      const { rows: [seq] } = await client.query(`SELECT nextval('receipt_number_seq') AS n`)
      const schoolCode = String(school_id).padStart(3, '0')
      const receipt_number = `RCP-${schoolCode}-${new Date().getFullYear()}-${String(seq.n).padStart(6, '0')}`
      const payDate = paid_date || new Date().toISOString().slice(0, 10)

      const createdPayments = []

      if (!isMulti) {
        // ── Single-entry mode (offline admin collection) ──────────────────────────

        // BUG 6: Guard against overpayment
        const { rows: [ledgerRow] } = await client.query(
          `SELECT amount_due, amount_paid FROM student_fee_ledger WHERE id = $1 AND school_id = $2`,
          [ledger_id, school_id]
        )
        if (!ledgerRow) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 })
        }
        const balance = parseFloat(ledgerRow.amount_due) - parseFloat(ledgerRow.amount_paid)
        if (parseFloat(String(amount)) > balance + 0.001) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: `Amount exceeds balance due (₹${balance.toFixed(2)})` }, { status: 400 })
        }

        const { rows: [payment] } = await client.query(
          `INSERT INTO fee_payments
             (school_id, student_id, ledger_id, amount, payment_mode, payment_status,
              receipt_number, transaction_ref, paid_date, collected_by_name, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING *`,
          [school_id, student_id, ledger_id, amount, payment_mode, payment_status,
           receipt_number, transaction_ref || null, payDate,
           collected_by_name || null, notes || null]
        )

        if (payment_status === 'completed') {
          await client.query(
            `UPDATE student_fee_ledger
             SET amount_paid = LEAST(amount_due, amount_paid + $1),
                 status = CASE
                   WHEN LEAST(amount_due, amount_paid + $1) >= amount_due THEN 'paid'
                   WHEN amount_paid + $1 > 0                              THEN 'partial'
                   ELSE status
                 END
             WHERE id = $2`,
            [amount, ledger_id]
          )
        }

        createdPayments.push(payment)
      } else {
        // ── Multi-entry FIFO mode ─────────────────────────────────────────────────
        // Fetch ledger entries in FIFO order (oldest due_date first)
        const { rows: entries } = await client.query(
          `SELECT id, amount_due, amount_paid, status,
                  (amount_due - amount_paid) AS balance
           FROM student_fee_ledger
           WHERE id = ANY($1) AND school_id = $2
             AND status NOT IN ('paid', 'waived')
           ORDER BY due_date ASC`,
          [ledger_ids, school_id]
        )

        let remaining = parseFloat(String(total_amount))

        for (const entry of entries) {
          if (remaining <= 0) break
          const balance = parseFloat(String(entry.balance))
          if (balance <= 0) continue

          // Use integer paise arithmetic to avoid float drift
          const remainingPaise = Math.round(remaining * 100)
          const balancePaise   = Math.round(balance * 100)
          const allocatePaise  = Math.min(remainingPaise, balancePaise)
          const allocate = allocatePaise / 100
          remaining = (remainingPaise - allocatePaise) / 100

          const { rows: [payment] } = await client.query(
            `INSERT INTO fee_payments
               (school_id, student_id, ledger_id, amount, payment_mode, payment_status,
                receipt_number, transaction_ref, paid_date, collected_by_name, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [school_id, student_id, entry.id, allocate, payment_mode, payment_status,
             receipt_number, transaction_ref || null, payDate,
             collected_by_name || null, notes || null]
          )

          if (payment_status === 'completed') {
            await client.query(
              `UPDATE student_fee_ledger
               SET amount_paid = LEAST(amount_due, amount_paid + $1),
                   status = CASE
                     WHEN LEAST(amount_due, amount_paid + $1) >= amount_due THEN 'paid'
                     WHEN amount_paid + $1 > 0                              THEN 'partial'
                     ELSE status
                   END
               WHERE id = $2`,
              [allocate, entry.id]
            )
          }

          createdPayments.push(payment)
        }
      }

      await client.query('COMMIT')

      // Return enriched response for receipt display
      const { rows: [full] } = await client.query(
        `SELECT fp.*, s.name AS student_name, s.roll_number, s.grade, s.section, s.parent_name,
                fc.name AS category_name, l.period_label, l.amount_due,
                sc.name AS school_name
         FROM fee_payments fp
         JOIN students s ON s.id = fp.student_id
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         JOIN schools sc ON sc.id = fp.school_id
         WHERE fp.id = $1`,
        [createdPayments[0].id]
      )

      return NextResponse.json({
        ...full,
        receipt_number,
        total_paid: createdPayments.reduce((s, p) => s + parseFloat(p.amount), 0),
        allocations: createdPayments.map(p => ({ ledger_id: p.ledger_id, amount: parseFloat(p.amount) })),
      }, { status: 201 })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
