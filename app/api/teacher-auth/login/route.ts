import { NextResponse } from 'next/server'

// Explicit tombstone for old clients. The retired employee-id flow used the
// employee id as a default password and allowed unactivated account claiming.
export async function POST() {
  return NextResponse.json(
    { error: 'This login method has been retired. Use the Teacher Portal email login.' },
    { status: 410 },
  )
}
