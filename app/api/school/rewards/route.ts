import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getSession, schoolHasFeature } from '@/lib/auth'
import { dispatchPendingPushes } from '@/lib/push'
import { FEATURE, featureOff } from '@/lib/marketplace/http'
import { cannotDeliver, markArrived, markCollected, schoolDeliveryView } from '@/lib/marketplace/service'

const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal']

async function schoolFromSession(): Promise<{ schoolId: number; userId: number } | NextResponse> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SCHOOL_ROLES.includes(session.role) || !session.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!await schoolHasFeature(Number(session.schoolId), FEATURE)) return featureOff()
  return { schoolId: Number(session.schoolId), userId: session.userId }
}

// GET /api/school/rewards — Rewards delivery: each parcel's state and the children still to hand out to, by class.
// Who can call: school admin, principal or vice principal of the school in the session; never another school.
export async function GET() {
  try {
    const who = await schoolFromSession()
    if (who instanceof NextResponse) return who
    return NextResponse.json(await schoolDeliveryView(pool, who.schoolId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[school/rewards GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('arrived'), run_id: z.number().int().positive() }),
  z.object({ action: z.literal('collected'), order_ids: z.array(z.number().int().positive()).min(1).max(500) }),
  z.object({ action: z.literal('cannot_deliver'), order_id: z.number().int().positive() }),
])

// POST /api/school/rewards
//   { action: "arrived", run_id }          the parcel reached school: children are told to collect from the office
//   { action: "collected", order_ids }     these children collected their items
//   { action: "cannot_deliver", order_id } it cannot be handed over; the child's points are refunded
export async function POST(req: Request) {
  try {
    const who = await schoolFromSession()
    if (who instanceof NextResponse) return who
    const body = bodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const b = body.data
    let result: Record<string, unknown>
    if (b.action === 'arrived') result = await markArrived(pool, { schoolId: who.schoolId, runId: b.run_id })
    else if (b.action === 'collected') result = await markCollected(pool, { schoolId: who.schoolId, orderIds: b.order_ids, by: who.userId })
    else {
      const r = await cannotDeliver(pool, { schoolId: who.schoolId, orderId: b.order_id })
      if (!r.ok) return NextResponse.json({ error: 'Order not found or already handled' }, { status: 404 })
      result = r
    }
    after(() => dispatchPendingPushes())
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[school/rewards POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
