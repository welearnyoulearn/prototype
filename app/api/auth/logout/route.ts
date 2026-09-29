import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookie, clearPlatformAuthCookie, getSessionIdFromCookie, revokeSession } from '@/lib/auth'
import { recordSessionEnd } from '@/lib/usageTracking'

export async function POST(req: NextRequest) {
  try {
    // Called from both School Admin and Platform Admin — clear whichever cookie is set.
    // The server-side session is revoked first so a copied cookie stops working too.
    const sid = await getSessionIdFromCookie()
    if (sid) await revokeSession(sid)
    await clearAuthCookie()
    await clearPlatformAuthCookie()

    const { usageSessionId } = await req.json().catch(() => ({ usageSessionId: null }))
    if (usageSessionId) await recordSessionEnd(usageSessionId)

    return NextResponse.json({ success: true })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
