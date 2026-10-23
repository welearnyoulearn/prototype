import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'This legacy endpoint has been retired. Use /api/teacher/auth/change-password.' },
    { status: 410 },
  )
}
