import { NextRequest, NextResponse } from 'next/server'
import { logRequest, logError } from '@/lib/logger'
import { isValidIngestSecret } from '@/lib/auth-constants'

// POST /api/internal/log-ingest
// Called fire-and-forget from middleware (which runs on Edge and can't use pg directly).
// Body: { type: 'request' | 'error', secret: string, data: RequestLogRow | ErrorLogParams }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Rejects when INGEST_SECRET is unset in production — no guessable default to match.
    if (!isValidIngestSecret(body.secret)) {
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
