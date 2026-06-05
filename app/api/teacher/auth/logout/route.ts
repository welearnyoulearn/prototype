import { NextResponse } from 'next/server'
import { clearTeacherAuthCookie } from '@/lib/auth'

export async function POST() {
  try {
    await clearTeacherAuthCookie()
    return NextResponse.json({ success: true })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
