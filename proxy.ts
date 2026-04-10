import { NextRequest, NextResponse } from 'next/server'

// Auth disabled — will be implemented after all features are complete
export function proxy(_req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
