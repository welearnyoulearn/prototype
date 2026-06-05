import { NextRequest, NextResponse } from 'next/server'

type RouteHandler<C = unknown> = (req: NextRequest, ctx: C) => Promise<NextResponse>

/**
 * Wraps any API route handler in a try/catch.
 * Any unhandled exception returns { error: 'Internal server error' } as JSON
 * instead of crashing with an HTML 500 page.
 */
export function route<C = unknown>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    try {
      return await handler(req, ctx)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[API Error] ${req.method} ${req.nextUrl.pathname} —`, msg)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
