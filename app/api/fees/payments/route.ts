import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { withWatchline } from '@/lib/logger'

// Hard ceiling on rows per request so a payment history can never come back unbounded.
const MAX_LIMIT = 500

// Non-negative integer query param. Absent => fallback; malformed => NaN so the
// caller can reject it (Math.min/clamping keeps NaN, which Number.isInteger catches).
function parseCount(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  return /^\d+$/.test(raw) ? Number(raw) : NaN
}

// GET /api/fees/payments?school_id=X&student_id=Y&ledger_id=Z&limit=&offset=
async function handleGET(req: NextRequest) {
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

    const where = `WHERE ${conditions.join(' AND ')}`
    // Every JOIN is on a primary key (students.id, student_fee_ledger.id,
    // fee_categories.id), so they filter but never multiply rows — the count
    // reuses this exact FROM/JOIN/WHERE and so agrees with the rows returned.
    const from = `FROM fee_payments fp
         JOIN students s ON s.id = fp.student_id
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id`

    // Pagination is opt-in — see the note in app/api/fees/ledger/route.ts. The
    // collection screens total these rows up, so a default cap would show wrong
    // "collected" figures rather than an obviously truncated list.
    const paginated = p.has('limit') || p.has('offset')
    let pageClause = ''
    let limit = 0
    let offset = 0
    if (paginated) {
      limit = Math.min(parseCount(p.get('limit'), MAX_LIMIT), MAX_LIMIT)
      offset = parseCount(p.get('offset'), 0)
      if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
        return NextResponse.json({ error: 'limit and offset must be non-negative integers' }, { status: 400 })
      }
      values.push(limit, offset)
      pageClause = `LIMIT $${values.length - 1} OFFSET $${values.length}`
    }

    try {
      // created_at alone is not a total order — one multi-entry FIFO payment
      // inserts several rows inside a single transaction and they share a
      // timestamp, so paging over it would drop/duplicate rows. fp.id breaks ties.
      const { rows } = await pool.query(
        `SELECT fp.*, s.name AS student_name, s.roll_number, s.grade, s.section,
                fc.name AS category_name, l.period_label
         ${from}
         ${where}
         ORDER BY fp.created_at DESC, fp.id DESC
         ${pageClause}`,
        values
      )
      if (!paginated) return NextResponse.json(rows)

      // Only paginated callers pay for the count.
      const { rows: [{ total }] } = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total ${from} ${where}`,
        values.slice(0, values.length - 2)
      )
      return NextResponse.json({ data: rows, limit, offset, total })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const GET = withWatchline(handleGET, { route: '/api/fees/payments' })

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
async function handlePOST(req: NextRequest) {
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

    // #13 — Reject zero or negative amounts before touching the DB
    const amountToCheck = isMulti ? parseFloat(String(total_amount)) : parseFloat(String(amount))
    if (!(amountToCheck > 0)) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    // ── Acquire connection only after validation passes ─────────────────────────
    const client = await pool.connect()
    try {
      // Guard: block payments against a closed academic year — fee_year_close is
      // guaranteed to exist (see lib/db.ts), so a query error here is a real failure,
      // not a missing table; let it propagate rather than silently failing this open.
      const guardIds = isMulti ? ledger_ids : (ledger_id ? [ledger_id] : [])
      if (guardIds.length > 0) {
        const { rows: [locked] } = await client.query(
          `SELECT 1
           FROM student_fee_ledger l
           JOIN fee_year_close yc ON yc.school_id = l.school_id AND yc.academic_year = l.academic_year AND yc.is_reopened = FALSE
           WHERE l.id = ANY($1) LIMIT 1`,
          [guardIds]
        )
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

        // #15 — FOR UPDATE locks the row so concurrent cashiers queue instead of double-paying
        const { rows: [ledgerRow] } = await client.query(
          `SELECT amount_due, amount_paid, COALESCE(waiver_amount, 0) AS waiver_amount FROM student_fee_ledger WHERE id = $1 AND school_id = $2 FOR UPDATE`,
          [ledger_id, school_id]
        )
        if (!ledgerRow) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 })
        }
        const balance = parseFloat(ledgerRow.amount_due) - parseFloat(ledgerRow.waiver_amount) - parseFloat(ledgerRow.amount_paid)
        if (parseFloat(String(amount)) > balance + 0.001) {
          await client.query('ROLLBACK')
          const msg = balance <= 0
            ? 'This fee has already been paid by another user. Please refresh and try again.'
            : `Amount exceeds balance due (₹${balance.toFixed(2)}). Another payment may have been recorded simultaneously — please refresh.`
          return NextResponse.json({ error: msg }, { status: 400 })
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
             SET amount_paid = LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1),
                 status = CASE
                   WHEN COALESCE(waiver_amount,0) + LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1) >= amount_due THEN 'paid'
                   WHEN amount_paid + $1 > 0 THEN 'partial'
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
        // #15 — FOR UPDATE locks all selected rows so concurrent cashiers queue
        const { rows: entries } = await client.query(
          `SELECT id, amount_due, amount_paid, COALESCE(waiver_amount, 0) AS waiver_amount, status,
                  GREATEST(amount_due - COALESCE(waiver_amount, 0) - amount_paid, 0) AS balance
           FROM student_fee_ledger
           WHERE id = ANY($1) AND school_id = $2
             AND status NOT IN ('paid', 'waived')
           ORDER BY due_date ASC
           FOR UPDATE`,
          [ledger_ids, school_id]
        )

        const totalBalance = entries.reduce((sum, e) => sum + parseFloat(String(e.balance)), 0)
        const totalAmount = parseFloat(String(total_amount))
        if (totalAmount > totalBalance + 0.001) {
          await client.query('ROLLBACK')
          const msg = totalBalance <= 0
            ? 'These fees have already been paid by another user. Please refresh and try again.'
            : `Amount exceeds total balance due (₹${totalBalance.toFixed(2)}). Another payment may have been recorded simultaneously — please refresh.`
          return NextResponse.json({ error: msg }, { status: 400 })
        }

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
               SET amount_paid = LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1),
                   status = CASE
                     WHEN COALESCE(waiver_amount,0) + LEAST(amount_due - COALESCE(waiver_amount,0), amount_paid + $1) >= amount_due THEN 'paid'
                     WHEN amount_paid + $1 > 0 THEN 'partial'
                     ELSE status
                   END
               WHERE id = $2`,
              [allocate, entry.id]
            )
          }

          createdPayments.push(payment)
        }

        if (createdPayments.length === 0) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'This fee has already been paid by another user. Please refresh and try again.' }, { status: 400 })
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

      // Per-fee-head breakdown for the receipt — createdPayments can span multiple
      // fee categories (e.g. Tuition + Transport + Hostel paid in one transaction),
      // so the receipt must itemise each rather than assuming a single category.
      const { rows: lineItems } = await client.query(
        `SELECT fp.id, fc.name AS category_name, l.period_label, fp.amount
         FROM fee_payments fp
         JOIN student_fee_ledger l ON l.id = fp.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE fp.id = ANY($1::int[])`,
        [createdPayments.map(p => p.id)]
      )

      return NextResponse.json({
        ...full,
        receipt_number,
        total_paid: createdPayments.reduce((s, p) => s + parseFloat(p.amount), 0),
        line_items: lineItems.map(li => ({ category_name: li.category_name, period_label: li.period_label, amount: parseFloat(li.amount) })),
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
export const POST = withWatchline(handlePOST, {
  route: '/api/fees/payments',
  getSchoolId: async req => { try { return (await req.clone().json())?.school_id ?? null } catch { return null } },
})
