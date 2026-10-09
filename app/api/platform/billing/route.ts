import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { getBills } from '@/lib/bills'
import { monthBoundsIST, nextMonth } from '@/lib/usage'
import type { BillsResponse } from '@/lib/billingTypes'

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()

// GET /api/platform/billing?month=YYYY-MM — bills dated that month plus every unpaid older bill, and the last automatic run.
export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const m = monthSchema.safeParse(req.nextUrl.searchParams.get('month') ?? undefined)
  if (!m.success) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })

  try {
    const { month } = monthBoundsIST(m.data)
    const [bills, run] = await Promise.all([
      getBills({ month }),
      pool.query<{ at: string; month: string; created: number; failed: NonNullable<BillsResponse['lastRun']>['failed'] }>(
        `SELECT ran_at AS at, to_char(bill_month, 'YYYY-MM') AS month, created, failed FROM billing_runs ORDER BY ran_at DESC, id DESC LIMIT 1`),
    ])
    // Next run: the 1st at 06:00 IST of this IST month if still ahead, else of next month.
    const current = monthBoundsIST().month
    const thisRun = new Date(`${current}-01T06:00:00+05:30`)
    const nextRun = (Date.now() < thisRun.getTime() ? thisRun : new Date(`${nextMonth(current)}-01T06:00:00+05:30`)).toISOString()
    const r = run.rows[0]
    const body: BillsResponse = {
      month,
      lastRun: r ? { at: new Date(r.at).toISOString(), month: r.month, created: r.created, failed: r.failed } : null,
      nextRun,
      gstDetailsPending: !process.env.BILLING_GSTIN,
      bills,
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[platform/billing GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
