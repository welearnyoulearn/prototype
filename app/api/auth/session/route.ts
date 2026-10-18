import { NextResponse } from 'next/server'
import { getSession, touchSession, getTeacherSession, getStudentSession, getParentSession } from '@/lib/auth'

// Covers school staff and the teacher/student/parent portals (whichever session the
// caller holds). GET  — is this session still valid? Passive: not counted as activity, so
//        the idle poller can't keep an abandoned session alive.
// POST — activity heartbeat: the user is actively using the page (typing, reading,
//        scrolling) without necessarily calling an API. Sent by IdleSessionGuard.
export async function GET() {
  const session = await getSession({ passive: true })
    ?? await getTeacherSession({ passive: true })
    ?? await getStudentSession({ passive: true })
    ?? await getParentSession({ passive: true })
  if (!session) return NextResponse.json({ active: false }, { status: 401 })
  return NextResponse.json({ active: true })
}

export async function POST() {
  // Non-passive portal getters bump last_seen_at, i.e. count as activity.
  const session = await touchSession() ?? await getTeacherSession() ?? await getStudentSession() ?? await getParentSession()
  if (!session) return NextResponse.json({ active: false }, { status: 401 })
  return NextResponse.json({ active: true })
}
