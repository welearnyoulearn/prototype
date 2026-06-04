import { NextResponse } from 'next/server'
import { clearStudentAuthCookie } from '@/lib/auth'

export async function POST() {
  await clearStudentAuthCookie()
  return NextResponse.json({ success: true })
}
