import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { BillError, addAdjustment, recordPayment, resendBill, todayIST } from '@/lib/bills'

const paramsSchema = z.object({ billId: z.coerce.number().int().positive() })
const twoDecimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('record_payment'),
    amount: z.number().positive('Amount must be more than ₹0').max(1e8).refine(twoDecimals, 'Amount can have at most 2 decimals'),
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').refine(d => !Number.isNaN(Date.parse(d)), 'Invalid date')
      .refine(d => d <= todayIST(), "Payment date can't be in the future"),
    method: z.enum(['bank_transfer', 'upi', 'cheque', 'cash']),
    reference: z.string().trim().max(100).optional(),
  }).strict(),
  z.object({
    action: z.literal('add_adjustment'),
    amount: z.number().refine(n => n !== 0, 'Amount can’t be ₹0').refine(n => Math.abs(n) <= 1_000_000, 'Amount must be within ±₹10,00,000')
      .refine(twoDecimals, 'Amount can have at most 2 decimals'),
    description: z.string().trim().min(3, 'Description must be 3–200 characters').max(200, 'Description must be 3–200 characters'),
  }).strict(),
  z.object({ action: z.literal('resend') }).strict(),
])

// POST /api/platform/billing/[billId] — body BillAction: record a payment, add an adjustment for the next bill, or resend the email.
export async function POST(req: NextRequest, { params }: { params: Promise<{ billId: string }> }) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = paramsSchema.safeParse(await params)
  if (!p.success) return NextResponse.json({ error: 'Invalid bill id' }, { status: 400 })
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  const { billId } = p.data
  const b = parsed.data
  const actor = session.displayName ?? `user #${session.userId}`

  try {
    let result: unknown = { ok: true }
    let auditAction: string
    if (b.action === 'record_payment') {
      result = await recordPayment(billId, b, actor)
      auditAction = 'record_payment'
    } else if (b.action === 'add_adjustment') {
      await addAdjustment(billId, b.amount, b.description, actor)
      auditAction = 'add_adjustment'
    } else {
      await resendBill(billId)
      auditAction = 'resend_bill'
    }
    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, (SELECT email FROM users WHERE id = $1), $2, 'saas_invoice', $3, (SELECT invoice_number FROM saas_invoices WHERE id = $3), $4)`,
      [session.userId, auditAction, billId, JSON.stringify(b)],
    ).catch(err => console.error(`[audit/${auditAction}]`, err))
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BillError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[platform/billing POST]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
