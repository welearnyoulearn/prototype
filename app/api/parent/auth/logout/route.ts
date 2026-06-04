import { NextResponse } from 'next/server'
import { clearParentAuthCookie } from '@/lib/auth'

export async function POST() {
  await clearParentAuthCookie()
  return NextResponse.json({ success: true })
}
