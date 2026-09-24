import { NextResponse } from 'next/server'
import { getSession, touchSession } from '@/lib/auth'

// GET  — is this school-staff session still valid? Passive: not counted as activity, so
//        the idle poller can't keep an abandoned session alive.
// POST — activity heartbeat: the user is actively using the page (typing, reading,
//        scrolling) without necessarily calling an API. Sent by IdleSessionGuard.
export async function GET() {
  const session = await getSession({ passive: true })
  if (!session) return NextResponse.json({ active: false }, { status: 401 })
  return NextResponse.json({ active: true })
}

export async function POST() {
  const session = await touchSession()
  if (!session) return NextResponse.json({ active: false }, { status: 401 })
  return NextResponse.json({ active: true })
}
