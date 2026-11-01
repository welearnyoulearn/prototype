import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { getNewspaper } from '@/lib/newspaper/service'

// GET /api/student/newspaper — today's newspaper for this student, with their progress.
// Who can call: the student themself. Their school, grade and identity come from the session, never from the
// request, and the correct answer is never in this response (only in the result after they answer).
export async function GET() {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(session.schoolId, 'daily-newspaper')) {
      return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'daily-newspaper' }, { status: 403 })
    }
    const showGoal = await schoolHasFeature(session.schoolId, 'rewards-marketplace')
    const view = await getNewspaper(pool, { studentId: session.studentId, schoolId: session.schoolId, showGoal })
    return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[student/newspaper]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
