import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { sendMail } from '@/lib/email'
import { dispatchPendingPushes } from '@/lib/push'
import { buildOrderAlert, rewardsAlertRecipient } from '@/lib/marketplace/alert'
import { FEATURE, featureOff, refused } from '@/lib/marketplace/http'
import { getRewardsView, placeOrder } from '@/lib/marketplace/service'

// GET /api/student/rewards — the student's balance, this month's limit, the catalog (in points) and their orders.
// POST /api/student/rewards { item_id } — order an item; the points are held at once and WLYL is emailed.
// Who can call: the student themself; who they are comes from the session, never from the request.
export async function GET() {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(session.schoolId, FEATURE)) return featureOff()
    return NextResponse.json(await getRewardsView(pool, { studentId: session.studentId, schoolId: session.schoolId }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[student/rewards GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const bodySchema = z.object({ item_id: z.number().int().positive() })

export async function POST(req: Request) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(session.schoolId, FEATURE)) return featureOff()
    const body = bodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'item_id is required' }, { status: 400 })

    const placed = await placeOrder(pool, { studentId: session.studentId, schoolId: session.schoolId, itemId: body.data.item_id, placedBy: 'student' })
    if (!placed.ok) return refused(placed.reason)
    after(async () => {
      await dispatchPendingPushes()
      const mail = buildOrderAlert(placed, 'student')
      await sendMail(rewardsAlertRecipient(), mail.subject, mail.html, { schoolId: session.schoolId, source: 'rewards.order' }).catch(console.error)
    })
    return NextResponse.json({ ok: true, order: placed.order, balance: placed.balance, run: { label: placed.run.label, cutoffAt: placed.run.cutoffAt } })
  } catch (err) {
    console.error('[student/rewards POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
