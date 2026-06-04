import { NextResponse } from 'next/server'
import { clearTeacherAuthCookie } from '@/lib/auth'

export async function POST() {
  await clearTeacherAuthCookie()
  return NextResponse.json({ success: true })
}
