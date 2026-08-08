import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/expenses/[id] — full detail including attachments
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [expense] } = await pool.query(
      `SELECT e.*, ec.name AS category_name FROM expenses e
       JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.id = $1 AND e.is_deleted = FALSE`,
      [id]
    )
    if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    if (!await requireFeeAccess(expense.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: attachments } = await pool.query(
      'SELECT id, file_url, file_name, uploaded_at FROM expense_attachments WHERE expense_id = $1 ORDER BY uploaded_at', [id]
    )
    return NextResponse.json({ ...expense, attachments })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/expenses/[id] — edit; writes an audit-log diff
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [existing] } = await pool.query('SELECT * FROM expenses WHERE id = $1 AND is_deleted = FALSE', [id])
    if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    if (!await requireFeeAccess(existing.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { category_id, title, payee_name, amount, expense_date, payment_mode, transaction_ref, notes, changed_by_name } = await req.json()

    if (category_id !== undefined) {
      const { rows: [cat] } = await pool.query(
        'SELECT id FROM expense_categories WHERE id = $1 AND school_id = $2', [category_id, existing.school_id]
      )
      if (!cat) return NextResponse.json({ error: 'Category not found for this school' }, { status: 400 })
    }
    if (amount !== undefined && !(Number(amount) > 0)) {
      return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
    }

    const { rows: [row] } = await pool.query(
      `UPDATE expenses SET
         category_id     = COALESCE($1, category_id),
         title           = COALESCE($2, title),
         payee_name      = COALESCE($3, payee_name),
         amount          = COALESCE($4, amount),
         expense_date    = COALESCE($5, expense_date),
         payment_mode    = COALESCE($6, payment_mode),
         transaction_ref = COALESCE($7, transaction_ref),
         notes           = COALESCE($8, notes),
         updated_at      = NOW()
       WHERE id = $9 RETURNING *`,
      [category_id ?? null, title?.trim() ?? null, payee_name?.trim() ?? null, amount ?? null,
       expense_date ?? null, payment_mode ?? null, transaction_ref?.trim() ?? null, notes?.trim() ?? null, id]
    )

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const [key, newVal] of Object.entries({ category_id, title, payee_name, amount, expense_date, payment_mode, transaction_ref, notes })) {
      if (newVal !== undefined && String(existing[key]) !== String(newVal)) {
        changes[key] = { from: existing[key], to: newVal }
      }
    }
    if (Object.keys(changes).length > 0) {
      await pool.query(
        `INSERT INTO expense_audit_log (expense_id, school_id, action, changed_by_name, changes)
         VALUES ($1, $2, 'edited', $3, $4)`,
        [id, existing.school_id, changed_by_name || null, JSON.stringify(changes)]
      ).catch(() => {})
    }

    return NextResponse.json(row)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/expenses/[id] — soft delete, never a hard delete (matches how
// this app treats every other financial record)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [existing] } = await pool.query('SELECT school_id FROM expenses WHERE id = $1 AND is_deleted = FALSE', [id])
    if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    if (!await requireFeeAccess(existing.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const changed_by_name = req.nextUrl.searchParams.get('changed_by_name')

    const { rows: [row] } = await pool.query(
      `UPDATE expenses SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *`, [id]
    )
    await pool.query(
      `INSERT INTO expense_audit_log (expense_id, school_id, action, changed_by_name)
       VALUES ($1, $2, 'deleted', $3)`,
      [id, existing.school_id, changed_by_name || null]
    ).catch(() => {})

    return NextResponse.json({ message: 'Expense removed', expense: row })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
