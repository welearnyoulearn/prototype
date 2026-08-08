import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// POST /api/expenses/[id]/attachments — links one already-uploaded Cloudinary
// file to an expense. The client uploads directly to Cloudinary via the
// existing generic /api/upload/sign flow first (folder: 'expense-bills'),
// then calls this once per file with the returned secure_url — same
// two-step pattern StudentTasks.tsx already uses for submission files.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [expense] } = await pool.query('SELECT school_id FROM expenses WHERE id = $1 AND is_deleted = FALSE', [id])
    if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    if (!await requireFeeAccess(expense.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { file_url, file_name } = await req.json()
    if (!file_url) return NextResponse.json({ error: 'file_url required' }, { status: 400 })

    const { rows: [row] } = await pool.query(
      `INSERT INTO expense_attachments (expense_id, file_url, file_name) VALUES ($1, $2, $3) RETURNING *`,
      [id, file_url, file_name || null]
    )
    return NextResponse.json(row, { status: 201 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
