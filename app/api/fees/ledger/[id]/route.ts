import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/fees/ledger/[id]/edits — fetch edit history for one ledger entry
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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
// Only allowed when amount_paid = 0 and status is not paid/waived
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    try {
      const { rows: [entry] } = await pool.query(
        `SELECT * FROM student_fee_ledger WHERE id = $1 AND school_id = $2`,
        [id, school_id]
      )
      if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (entry.status === 'paid' || entry.status === 'waived')
        return NextResponse.json({ error: `Cannot delete a ${entry.status} entry` }, { status: 400 })
      if (Number(entry.amount_paid) > 0)
        return NextResponse.json({ error: 'Cannot delete an entry with payments recorded' }, { status: 400 })
      await pool.query(`DELETE FROM student_fee_ledger WHERE id = $1`, [id])
      return NextResponse.json({ deleted: true })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
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
    const client = await pool.connect()
    try {
      const { new_amount, reason, changed_by, school_id } = await req.json()

      if (!new_amount || !reason || !changed_by || !school_id) {
        return NextResponse.json({ error: 'new_amount, reason, changed_by, school_id required' }, { status: 400 })
      }
      if (Number(new_amount) <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
      }

      // Ensure audit table exists (idempotent)
      await client.query(`
        CREATE TABLE IF NOT EXISTS student_fee_ledger_edits (
          id         SERIAL PRIMARY KEY,
          ledger_id  INTEGER NOT NULL REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
          school_id  INTEGER NOT NULL,
          student_id INTEGER NOT NULL,
          old_amount NUMERIC(10,2) NOT NULL,
          new_amount NUMERIC(10,2) NOT NULL,
          reason     TEXT NOT NULL,
          changed_by TEXT NOT NULL,
          changed_at TIMESTAMPTZ DEFAULT NOW()
        )
      `)

      await client.query('BEGIN')

      // Fetch current entry
      const { rows: [entry] } = await client.query(
        `SELECT * FROM student_fee_ledger WHERE id = $1 AND school_id = $2`,
        [id, school_id]
      )
      if (!entry) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 })
      }

      // Block edits on a closed academic year
      const { rows: [locked] } = await client.query(
        `SELECT 1 FROM fee_year_close
         WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE LIMIT 1`,
        [school_id, entry.academic_year]
      ).catch(() => ({ rows: [] }))
      if (locked) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to edit amounts.' }, { status: 409 })
      }

      // Block edits on paid / waived entries
      if (entry.status === 'paid' || entry.status === 'waived') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: `Cannot edit a ${entry.status} entry` }, { status: 400 })
      }

      // Cannot set below what is already paid
      if (Number(new_amount) < Number(entry.amount_paid)) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: `New amount (₹${new_amount}) cannot be less than amount already paid (₹${entry.amount_paid})`
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
               WHEN amount_paid >= $1                          THEN 'paid'
               WHEN amount_paid > 0 AND amount_paid < $1      THEN 'partial'
               WHEN $1 > 0 AND due_date < CURRENT_DATE        THEN 'overdue'
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
