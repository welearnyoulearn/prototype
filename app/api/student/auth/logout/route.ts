import { NextRequest, NextResponse } from 'next/server'
import { clearStudentAuthCookie, getPortalSessionIdFromCookie, revokePortalSession } from '@/lib/auth'
import { recordSessionEnd } from '@/lib/usageTracking'

export async function POST(req: NextRequest) {
  try {
    const sid = await getPortalSessionIdFromCookie('student')
    if (sid) await revokePortalSession(sid)
    await clearStudentAuthCookie()

    const { usageSessionId } = await req.json().catch(() => ({ usageSessionId: null }))
    if (usageSessionId) await recordSessionEnd(usageSessionId)

    return NextResponse.json({ success: true })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
