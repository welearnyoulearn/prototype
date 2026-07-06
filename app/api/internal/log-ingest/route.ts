import { NextRequest, NextResponse } from 'next/server'
import { logRequest, logError } from '@/lib/logger'

const INGEST_SECRET = process.env.INGEST_SECRET || 'watchline-internal'

// POST /api/internal/log-ingest
// Called fire-and-forget from middleware (which runs on Edge and can't use pg directly).
// Body: { type: 'request' | 'error', secret: string, data: RequestLogRow | ErrorLogParams }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.secret !== INGEST_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (body.type === 'request') {
      logRequest(body.data)
    } else if (body.type === 'error') {
      logError(body.data)
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
