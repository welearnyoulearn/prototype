import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { drainPendingPushes } from '@/lib/push'
import { closeRun, listItems, markSent, platformOverview } from '@/lib/marketplace/service'

// GET /api/platform/rewards — the open run's item counts per school and the shopping list, every parcel's state
// (Ordered · Sent · At school · Collected · Waiting), totals and the catalog. Platform admins only.
export async function GET() {
  try {
    if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const [overview, items] = await Promise.all([platformOverview(pool), listItems(pool)])
    return NextResponse.json({ ...overview, items }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[platform/rewards GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('close_run') }),
  z.object({ action: z.literal('mark_sent'), run_id: z.number().int().positive(), school_id: z.number().int().positive() }),
])

// POST /api/platform/rewards
//   { action: "close_run" }                      freeze this month's orders and open next month's run
//   { action: "mark_sent", run_id, school_id }   WLYL sent that school's parcel; the school and families are told
export async function POST(req: Request) {
  try {
    if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = bodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    if (body.data.action === 'close_run') {
      const r = await closeRun(pool)
      if (!r.ok) return NextResponse.json({ error: 'There is no open run' }, { status: 409 })
      return NextResponse.json(r)
    }
    const r = await markSent(pool, { runId: body.data.run_id, schoolId: body.data.school_id })
    if (r.sent > 0) after(() => drainPendingPushes())
    return NextResponse.json({ ok: true, ...r })
  } catch (err) {
    console.error('[platform/rewards POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
