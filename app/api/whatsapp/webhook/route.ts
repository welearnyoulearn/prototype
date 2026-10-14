import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'

// Meta WhatsApp delivery-status webhook. Public route; auth = verify token (GET)
// and HMAC signature (POST). Usage is counted at send time, never here.

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (verifyToken && q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === verifyToken) {
    return new NextResponse(q.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

function signatureValid(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'))
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  timestamp: z.string().regex(/^\d+$/),
  errors: z.array(z.object({ title: z.string().optional() })).optional(),
})

const payloadSchema = z.object({
  entry: z.array(z.object({
    changes: z.array(z.object({
      value: z.object({ statuses: z.array(statusSchema).optional() }),
    })).default([]),
  })).default([]),
})

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET
  const raw = await request.text()
  if (!secret || !signatureValid(raw, request.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let json: unknown
  try { json = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const statuses = parsed.data.entry.flatMap(e => e.changes.flatMap(c => c.value.statuses ?? []))
  try {
    for (const s of statuses) {
      const at = new Date(Number(s.timestamp) * 1000)
      // Only move forward: sent → delivered → read; failed may replace sent.
      if (s.status === 'delivered') {
        await pool.query(
          `UPDATE whatsapp_messages SET status='delivered', delivered_at=$2
            WHERE provider_message_id=$1 AND status='sent'`, [s.id, at])
      } else if (s.status === 'read') {
        await pool.query(
          `UPDATE whatsapp_messages SET status='read', read_at=$2, delivered_at=COALESCE(delivered_at,$2)
            WHERE provider_message_id=$1 AND status IN ('sent','delivered')`, [s.id, at])
      } else if (s.status === 'failed') {
        await pool.query(
          `UPDATE whatsapp_messages SET status='failed', failure_reason=$2
            WHERE provider_message_id=$1 AND status='sent'`,
          [s.id, (s.errors?.[0]?.title ?? 'failed').slice(0, 500)])
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] status update failed:', err instanceof Error ? err.message : err)
  }
  return NextResponse.json({ ok: true })
}
