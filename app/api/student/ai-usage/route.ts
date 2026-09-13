import { NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { resolveLimitStatus } from '@/lib/ai/limits'

// GET /api/student/ai-usage — today's AI Hub usage vs. daily limit, for the
// chat UI's usage indicator. Read-only: does NOT create a student_subscriptions
// row as a side effect beyond what resolveLimitStatus already does (first
// call creates the default 'free' row, same as /ask would on first use).
export async function GET() {
  try {
    await ensureDB()
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    try {
      const status = await resolveLimitStatus(pool, session.studentId, session.schoolId)
      return NextResponse.json(status)
    } catch (err) {
      // Same fail-open spirit as /ask — never let a usage-check bug block
      // the UI from rendering. Report a harmless default instead of erroring.
      console.error('[ai-usage] resolveLimitStatus failed — reporting a safe default:', err)
      return NextResponse.json({ tier: 'free', used: 0, limit: 3, blocked: false })
    }
  } catch (err: unknown) {
    console.error('[API] /api/student/ai-usage', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
