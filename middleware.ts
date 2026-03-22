import { NextRequest, NextResponse } from 'next/server'

// Auth is disabled during feature development — all routes are public
export function middleware(req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
