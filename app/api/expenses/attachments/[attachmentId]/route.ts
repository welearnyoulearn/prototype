import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// DELETE /api/expenses/attachments/[attachmentId] — remove one attached bill
// (the Cloudinary asset itself is left in place; only the DB link is removed,
// same trade-off this app already makes elsewhere for uploaded files)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { attachmentId } = await params
    const { rows: [row] } = await pool.query(
      `SELECT ea.id, e.school_id FROM expense_attachments ea
       JOIN expenses e ON e.id = ea.expense_id
       WHERE ea.id = $1`,
      [attachmentId]
    )
    if (!row) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    if (!await requireFeeAccess(row.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await pool.query('DELETE FROM expense_attachments WHERE id = $1', [attachmentId])
    return NextResponse.json({ message: 'Attachment removed' })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
