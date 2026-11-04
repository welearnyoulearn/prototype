import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { answerQuestion } from '@/lib/newspaper/service'

const bodySchema = z.object({ selected_index: z.number().int().min(0).max(3) })

// POST /api/student/newspaper/answer { selected_index } — grades the answer on the server, pays the points once and
// returns the right answer with its explanation. Works only after "I've read it", and only once.
export async function POST(req: Request) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(session.schoolId, 'daily-newspaper')) {
      return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'daily-newspaper' }, { status: 403 })
    }
    const body = bodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'selected_index must be 0, 1, 2 or 3' }, { status: 400 })

    const result = await answerQuestion(pool, { studentId: session.studentId, schoolId: session.schoolId, selectedIndex: body.data.selected_index })
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.reason === 'closed' ? 410 : 409 })
    return NextResponse.json({ ok: true, result: result.result, balance: result.balance })
  } catch (err) {
    console.error('[student/newspaper/answer]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
