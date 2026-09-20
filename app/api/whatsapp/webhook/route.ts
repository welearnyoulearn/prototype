import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import pool from '@/lib/db'

// Meta WhatsApp Cloud API webhook: delivery receipts (sent / delivered / read / failed)
// for messages we sent. Configure it in the Meta app (WhatsApp → Configuration) with
// this URL, WHATSAPP_VERIFY_TOKEN as the verify token, and subscribe to "messages".
// See docs/WHATSAPP-SETUP.md.

// GET — one-time handshake when the webhook is saved in the Meta dashboard.
export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  const p = req.nextUrl.searchParams
  if (verifyToken && p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === verifyToken) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

function signatureValid(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'hex')
  const actual = Buffer.from(header.slice('sha256='.length), 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

type StatusEvent = {
  id?: string
  status?: string
  timestamp?: string
  errors?: { title?: string; message?: string; code?: number }[]
}
type WebhookBody = {
  entry?: { changes?: { value?: { statuses?: StatusEvent[] } }[] }[]
}

const KNOWN_STATUSES = new Set(['sent', 'delivered', 'read', 'failed'])

// POST — delivery receipts. Only requests signed with the app secret are trusted.
export async function POST(req: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return new NextResponse('Webhook not configured', { status: 503 })

  const raw = await req.text()
  if (!signatureValid(raw, req.headers.get('x-hub-signature-256'), secret)) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  try {
    const body = JSON.parse(raw) as WebhookBody
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const s of change.value?.statuses ?? []) {
          if (!s.id || !s.status || !KNOWN_STATUSES.has(s.status)) continue
          const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date()
          const reason = s.errors?.[0] ? (s.errors[0].title || s.errors[0].message || `code ${s.errors[0].code}`) : null
          await pool.query(
            `UPDATE whatsapp_messages SET
               status = $2::text,
               delivered_at = CASE WHEN $2::text = 'delivered' THEN $3::timestamptz ELSE delivered_at END,
               read_at      = CASE WHEN $2::text = 'read'      THEN $3::timestamptz ELSE read_at END,
               failure_reason = CASE WHEN $2::text = 'failed' THEN $4::text ELSE failure_reason END
             WHERE provider_message_id = $1::text
               AND NOT (status = 'read' AND $2::text IN ('sent', 'delivered'))
               AND NOT (status = 'delivered' AND $2::text = 'sent')`,
            [s.id, s.status, at, reason]
          )
        }
      }
    }
  } catch (err) {
    // Always 200 once the signature is valid — Meta retries aggressively on errors.
    console.error('[whatsapp/webhook]', err)
  }
  return NextResponse.json({ ok: true })
}
