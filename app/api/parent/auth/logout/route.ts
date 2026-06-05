import { NextResponse } from 'next/server'
import { clearParentAuthCookie } from '@/lib/auth'

export async function POST() {
  try {
    await clearParentAuthCookie()
    return NextResponse.json({ success: true })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
