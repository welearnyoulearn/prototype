import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { FEATURE, featureOff } from '@/lib/marketplace/http'
import { cancelOrder } from '@/lib/marketplace/service'

// POST /api/student/rewards/orders/{id}/cancel — cancel the student's own order before the month's run closes.
// The points come back once.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(session.schoolId, FEATURE)) return featureOff()
    const orderId = Number((await params).id)
    if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: 'Invalid order' }, { status: 400 })
    const r = await cancelOrder(pool, { studentId: session.studentId, schoolId: session.schoolId, orderId })
    if (!r.ok) return NextResponse.json({ error: r.reason === 'not_found' ? 'Order not found' : 'This order can no longer be cancelled' }, { status: r.reason === 'not_found' ? 404 : 409 })
    return NextResponse.json({ ok: true, balance: r.balance })
  } catch (err) {
    console.error('[student/rewards cancel]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
