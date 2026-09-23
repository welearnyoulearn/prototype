import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// Verify a ledger entry belongs to the caller's school. Returns the entry's school_id or null.
async function ledgerSchoolId(id: string): Promise<string | null> {
  const { rows: [row] } = await pool.query(`SELECT school_id FROM student_fee_ledger WHERE id = $1`, [id])
  return row ? String(row.school_id) : null
}

// GET /api/fees/ledger/[id] — fetch edit history for one ledger entry
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sid = await ledgerSchoolId(id)
    if (!sid) return NextResponse.json([])
    if (!await requireFeeAccess(sid)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    try {
      const { rows: [tbl] } = await pool.query(`SELECT to_regclass('student_fee_ledger_edits') IS NOT NULL AS exists`)
      if (!tbl.exists) return NextResponse.json([])
      const { rows } = await pool.query(
        `SELECT * FROM student_fee_ledger_edits WHERE ledger_id = $1 ORDER BY changed_at DESC`,
        [id]
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/fees/ledger/[id]?school_id=X — delete a ledger entry
// Only allowed when amount_paid = 0, waiver_amount = 0, and status is not paid/waived
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // FOR UPDATE closes the gap between this check and the DELETE below — without
      // it, a payment or waiver could land on this exact row between the read and
      // the delete (a parent's online payment, another admin's cash collection),
      // and fee_payments/fee_waivers' ON DELETE CASCADE would silently destroy that
      // real payment/waiver record along with the bill.
      const { rows: [entry] } = await client.query(
        `SELECT * FROM student_fee_ledger WHERE id = $1 AND school_id = $2 FOR UPDATE`,
        [id, school_id]
      )
      if (!entry) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      // Block deletes on a closed academic year — PATCH on this same route
      // already enforces this; DELETE didn't, letting a pending bill in a
      // closed year be permanently removed (no audit trail) without
      // reopening the year first.
      const { rows: [locked] } = await client.query(
        `SELECT 1 FROM fee_year_close
         WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE LIMIT 1`,
        [school_id, entry.academic_year]
      )
      if (locked) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to delete entries.' }, { status: 409 })
      }
      if (entry.status === 'paid' || entry.status === 'waived') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: `Cannot delete a ${entry.status} entry` }, { status: 400 })
      }
      if (Number(entry.amount_paid) > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Cannot delete an entry with payments recorded' }, { status: 400 })
      }
      // A partially-waived (but never paid) bill sits at status='partial' with
      // amount_paid=0 — it passed both checks above and was deleted outright,
      // cascade-deleting the fee_waivers row and erasing the record a waiver was
      // ever granted.
      if (Number(entry.waiver_amount || 0) > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Cannot delete an entry with a waiver recorded — revoke the waiver first' }, { status: 400 })
      }
      // The checks above only look at the ledger's CURRENT running totals
      // (amount_paid, waiver_amount), which a cancelled payment or revoked waiver
      // already zeroes out — but the fee_payments/fee_waivers ROWS themselves
      // still exist for audit history, and both reference this ledger_id with
      // ON DELETE CASCADE. Deleting the bill would silently erase that history:
      // pending_verification/cancelled payments and revoked waivers alike.
      const { rows: [linked] } = await client.query(
        `SELECT
           EXISTS(SELECT 1 FROM fee_payments WHERE ledger_id = $1) AS has_payments,
           EXISTS(SELECT 1 FROM fee_waivers  WHERE ledger_id = $1) AS has_waivers`,
        [id]
      )
      if (linked.has_payments || linked.has_waivers) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: 'Cannot delete an entry with payment or waiver history (including cancelled/revoked/pending records) — this would erase the audit trail.',
        }, { status: 400 })
      }
      await client.query(`DELETE FROM student_fee_ledger WHERE id = $1`, [id])
      await client.query('COMMIT')
      return NextResponse.json({ deleted: true })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/fees/ledger/[id] — edit the amount_due on one ledger entry
// Body: { new_amount, reason, changed_by, school_id }
//
// Rules enforced server-side:
//   - Cannot edit a PAID or WAIVED entry
//   - new_amount must be >= amount_paid (cannot go below what is already paid)
//   - new_amount must be > 0
//   - reason and changed_by are required
//
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Must run before pool.connect() below, not after — on Vercel's max:1 pool,
    // ensureDB()'s own pool.query() calls would otherwise block waiting for a
    // connection that `client` is already holding, and `client` can't be
    // released until this call returns: a deadlock resolved only by
    // connectionTimeoutMillis expiring into an error.
    await ensureDB()
    const client = await pool.connect()
    try {
      const { new_amount, reason, changed_by: clientActor, school_id } = await req.json()
      const access = await requireFeeAccess(school_id)
      if (!access) { client.release(); return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
      const changed_by = clientActor || access.actor

      if (!new_amount || !reason || !school_id) {
        return NextResponse.json({ error: 'new_amount, reason, school_id required' }, { status: 400 })
      }
      if (Number(new_amount) <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
      }

      await client.query('BEGIN')

      // Fetch current entry — FOR UPDATE so a concurrent payment/waiver can't land
      // on this row between this read and the update below, which would let this
      // edit's own amount_paid/waiver_amount snapshot go stale.
      const { rows: [entry] } = await client.query(
        `SELECT * FROM student_fee_ledger WHERE id = $1 AND school_id = $2 FOR UPDATE`,
        [id, school_id]
      )
      if (!entry) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 })
      }

      // Block edits on a closed academic year — fee_year_close is guaranteed to exist
      // (see lib/db.ts), so a query error here is a real failure, not a missing table;
      // let it propagate to the outer catch rather than silently failing this guard open.
      const { rows: [locked] } = await client.query(
        `SELECT 1 FROM fee_year_close
         WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE LIMIT 1`,
        [school_id, entry.academic_year]
      )
      if (locked) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to edit amounts.' }, { status: 409 })
      }

      // Block edits on paid / waived entries
      if (entry.status === 'paid' || entry.status === 'waived') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: `Cannot edit a ${entry.status} entry` }, { status: 400 })
      }

      // Cannot set below what is already covered by payments + waivers combined —
      // checking amount_paid alone let a bill be cut below amount_paid + waiver_amount
      // (e.g. ₹1,000 bill, ₹300 paid, ₹500 waived could be edited down to ₹400).
      const coveredAmount = Number(entry.amount_paid) + Number(entry.waiver_amount || 0)
      if (Number(new_amount) < coveredAmount) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: `New amount (₹${new_amount}) cannot be less than amount already paid + waived (₹${coveredAmount})`
        }, { status: 400 })
      }

      // Record the edit in audit log
      await client.query(
        `INSERT INTO student_fee_ledger_edits
           (ledger_id, school_id, student_id, old_amount, new_amount, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, school_id, entry.student_id,
         entry.amount_due, new_amount, reason, changed_by]
      )

      // Update the ledger entry
      const { rows: [updated] } = await client.query(
        `UPDATE student_fee_ledger
         SET amount_due = $1,
             status = CASE
               WHEN COALESCE(waiver_amount,0) + amount_paid >= $1  THEN 'paid'
               WHEN amount_paid > 0 AND amount_paid < $1            THEN 'partial'
               WHEN $1 > 0 AND EXISTS (SELECT 1 FROM academic_years ay WHERE ay.school_id = student_fee_ledger.school_id AND ay.label = student_fee_ledger.academic_year AND ay.end_date < CURRENT_DATE) THEN 'overdue'
               ELSE 'pending'
             END
         WHERE id = $2
         RETURNING *`,
        [new_amount, id]
      )

      await client.query('COMMIT')
      return NextResponse.json(updated)
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to update ledger entry' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
