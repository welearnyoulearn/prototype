import { NextResponse } from 'next/server'
import { clearAuthCookie, clearPlatformAuthCookie } from '@/lib/auth'

export async function POST() {
  try {
    // Called from both School Admin and Platform Admin — clear whichever cookie is set.
    await clearAuthCookie()
    await clearPlatformAuthCookie()
    return NextResponse.json({ success: true })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
