import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getParentSession, schoolHasFeature } from '@/lib/auth'
import { FEATURE, featureOff } from '@/lib/marketplace/http'
import { cancelOrder, parentOwnsChild } from '@/lib/marketplace/service'

const bodySchema = z.object({ student_id: z.number().int().positive() })

// POST /api/parent/rewards/orders/{id}/cancel { student_id } — cancel the child's order before the run closes.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parent = await getParentSession()
    if (!parent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(parent.schoolId, FEATURE)) return featureOff()
    const orderId = Number((await params).id)
    const body = bodySchema.safeParse(await req.json().catch(() => null))
    if (!Number.isInteger(orderId) || orderId <= 0 || !body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    if (!await parentOwnsChild(pool, parent.parentId, parent.schoolId, body.data.student_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const r = await cancelOrder(pool, { studentId: body.data.student_id, schoolId: parent.schoolId, orderId })
    if (!r.ok) return NextResponse.json({ error: r.reason === 'not_found' ? 'Order not found' : 'This order can no longer be cancelled' }, { status: r.reason === 'not_found' ? 404 : 409 })
    return NextResponse.json({ ok: true, balance: r.balance })
  } catch (err) {
    console.error('[parent/rewards cancel]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
