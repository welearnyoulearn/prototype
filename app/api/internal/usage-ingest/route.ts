import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isValidIngestSecret } from '@/lib/auth-constants'
import { recordUsage } from '@/lib/usage'

const bodySchema = z.object({
  counts: z.array(z.object({
    schoolId: z.number().int().positive(),
    requests: z.number().int().positive(),
  })).max(1000),
})

// POST /api/internal/usage-ingest — API request counts flushed by proxy.ts (Edge, no pg).
// Header x-ingest-secret, same secret as the other internal routes.
export async function POST(req: NextRequest) {
  if (!isValidIngestSecret(req.headers.get('x-ingest-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  // Sequential: recordUsage takes its own pool connection (max 1 on Vercel). It never throws.
  for (const { schoolId, requests } of parsed.data.counts) {
    await recordUsage({ schoolId, meterKey: 'api.request', quantity: requests, source: 'proxy' })
  }
  return NextResponse.json({ ok: true })
}
