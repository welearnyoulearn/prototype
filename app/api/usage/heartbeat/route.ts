import { NextRequest, NextResponse } from 'next/server'
import { recordHeartbeat } from '@/lib/usageTracking'

// Pinged periodically by the client-side heartbeat hook in every portal
// shell while a usage session is active. No auth check here — the session
// id is an opaque server-generated integer, not a capability, and a stray/
// forged ping only touches its own row's last_seen_at.
export async function POST(req: NextRequest) {
  try {
    const { usageSessionId } = await req.json()
    if (typeof usageSessionId === 'number') {
      await recordHeartbeat(usageSessionId)
    }
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
