import { NextResponse } from 'next/server'
import { clearTeacherAuthCookie, getPortalSessionIdFromCookie, revokePortalSession } from '@/lib/auth'

export async function POST() {
  try {
    const sid = await getPortalSessionIdFromCookie('teacher')
    if (sid) await revokePortalSession(sid)
    await clearTeacherAuthCookie()
    return NextResponse.json({ success: true })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
