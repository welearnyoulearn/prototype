import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { acknowledgeRead } from '@/lib/newspaper/service'

// POST /api/student/newspaper/ack — "I've read it". Works only after the minimum reading time, once the newspaper
// has been opened, and before the question is answered.
export async function POST() {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(session.schoolId, 'daily-newspaper')) {
      return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'daily-newspaper' }, { status: 403 })
    }
    const result = await acknowledgeRead(pool, { studentId: session.studentId, schoolId: session.schoolId })
    if (result.ok) return NextResponse.json({ ok: true })
    const status = result.reason === 'closed' ? 410 : 409
    return NextResponse.json({ error: result.reason, waitSeconds: result.waitSeconds }, { status })
  } catch (err) {
    console.error('[student/newspaper/ack]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
