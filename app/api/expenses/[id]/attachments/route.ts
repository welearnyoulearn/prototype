import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { recordUsage } from '@/lib/usage'

const bodySchema = z.object({
  file_url: z.string().min(1),
  file_name: z.string().max(255).nullish(),
  bytes: z.number().int().min(0).max(200 * 1_048_576).optional(), // Cloudinary upload result `bytes`
})

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

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'file_url required' }, { status: 400 })
    const { file_url, file_name, bytes } = parsed.data
    // Only a file this school uploaded through /api/upload/sign (folder expense-bills/school-{id}),
    // never an arbitrary URL that would later be shown to staff as "the bill".
    const cloud = process.env.CLOUDINARY_CLOUD_NAME
    const allowedPrefix = new RegExp(
      `^https://res\\.cloudinary\\.com/${cloud}/(image|raw|video)/upload/(v\\d+/)?expense-bills/school-${Number(expense.school_id)}/[^/?#]+$`
    )
    if (!cloud || !allowedPrefix.test(file_url)) {
      return NextResponse.json({ error: 'file_url must be an expense bill uploaded for this school' }, { status: 400 })
    }

    const { rows: [row] } = await pool.query(
      `INSERT INTO expense_attachments (expense_id, file_url, file_name) VALUES ($1, $2, $3) RETURNING *`,
      [id, file_url, file_name || null]
    )
    if (bytes) await recordUsage({
      schoolId: Number(expense.school_id), meterKey: 'storage.upload', quantity: Math.round(bytes / 1_048_576 * 1e4) / 1e4,
      source: 'upload.expense_bill', idempotencyKey: `upload:${file_url}`,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
