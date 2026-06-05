import { NextResponse } from 'next/server'
import { clearStudentAuthCookie } from '@/lib/auth'

export async function POST() {
  try {
    await clearStudentAuthCookie()
    return NextResponse.json({ success: true })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
