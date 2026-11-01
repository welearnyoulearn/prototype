import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getParentSession, schoolHasFeature } from '@/lib/auth'
import { sendMail } from '@/lib/email'
import { dispatchPendingPushes } from '@/lib/push'
import { buildOrderAlert, rewardsAlertRecipient } from '@/lib/marketplace/alert'
import { FEATURE, featureOff, refused } from '@/lib/marketplace/http'
import { getRewardsView, parentOwnsChild, placeOrder } from '@/lib/marketplace/service'

// GET /api/parent/rewards?student_id= — a child's balance, limit, catalog and orders.
// POST /api/parent/rewards { student_id, item_id } — order for the child from the child's own points.
// Who can call: a parent, for a child linked to them in their school. Any other child is answered as "not found".
export async function GET(req: NextRequest) {
  try {
    const parent = await getParentSession()
    if (!parent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(parent.schoolId, FEATURE)) return featureOff()
    const studentId = Number(req.nextUrl.searchParams.get('student_id'))
    if (!Number.isInteger(studentId) || studentId <= 0) return NextResponse.json({ error: 'student_id required' }, { status: 400 })
    if (!await parentOwnsChild(pool, parent.parentId, parent.schoolId, studentId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(await getRewardsView(pool, { studentId, schoolId: parent.schoolId }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[parent/rewards GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const bodySchema = z.object({ student_id: z.number().int().positive(), item_id: z.number().int().positive() })

export async function POST(req: NextRequest) {
  try {
    const parent = await getParentSession()
    if (!parent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(parent.schoolId, FEATURE)) return featureOff()
    const body = bodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'student_id and item_id are required' }, { status: 400 })
    if (!await parentOwnsChild(pool, parent.parentId, parent.schoolId, body.data.student_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const placed = await placeOrder(pool, { studentId: body.data.student_id, schoolId: parent.schoolId, itemId: body.data.item_id, placedBy: 'parent' })
    if (!placed.ok) return refused(placed.reason)
    after(async () => {
      await dispatchPendingPushes()
      const mail = buildOrderAlert(placed, 'parent')
      await sendMail(rewardsAlertRecipient(), mail.subject, mail.html, { schoolId: parent.schoolId, source: 'rewards.order' }).catch(console.error)
    })
    return NextResponse.json({ ok: true, order: placed.order, balance: placed.balance, run: { label: placed.run.label, cutoffAt: placed.run.cutoffAt } })
  } catch (err) {
    console.error('[parent/rewards POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
