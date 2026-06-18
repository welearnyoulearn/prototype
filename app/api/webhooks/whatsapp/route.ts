import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import pool from '@/lib/db'

// GET: Meta webhook verification challenge
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const token     = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// POST: Meta delivery status updates
export async function POST(req: NextRequest) {
  let rawBody = ''
  try { rawBody = await req.text() } catch { return NextResponse.json({ received: true }) }

  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (appSecret) {
    const signature = req.headers.get('x-hub-signature-256') ?? ''
    const expected  = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
    if (signature !== expected) return NextResponse.json({ received: true })
  }

  let payload: Record<string, unknown> = {}
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ received: true }) }

  try {
    const entries = payload.entry as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(entries)) return NextResponse.json({ received: true })

    for (const entry of entries) {
      const changes = entry.changes as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(changes)) continue
      for (const change of changes) {
        if (change.field !== 'messages') continue
        const value = change.value as Record<string, unknown>
        const statuses = value.statuses as Array<Record<string, unknown>> | undefined
        if (Array.isArray(statuses)) {
          for (const s of statuses) await handleStatusUpdate(s)
        }
      }
    }
  } catch (err) {
    console.error('[webhook/whatsapp]', err)
  }

  return NextResponse.json({ received: true })
}

async function handleStatusUpdate(s: Record<string, unknown>) {
  const providerId = s.id as string
  const metaStatus = s.status as string

  if (!providerId || !metaStatus) return
  if (!['sent', 'delivered', 'read', 'failed'].includes(metaStatus)) return

  const msgRes = await pool.query(
    `SELECT id, school_id, message_type, TO_CHAR(created_at, 'YYYY-MM') AS year_month
     FROM whatsapp_messages WHERE provider_message_id = $1 LIMIT 1`,
    [providerId]
  )
  if (msgRes.rows.length === 0) return

  const msg = msgRes.rows[0]
  const timestamp = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null

  await pool.query(
    `UPDATE whatsapp_messages SET
       status         = $1,
       delivered_at   = CASE WHEN $2 IN ('delivered','read') THEN COALESCE(delivered_at, $3::timestamptz) ELSE delivered_at END,
       read_at        = CASE WHEN $2 = 'read'    THEN COALESCE(read_at, $3::timestamptz) ELSE read_at END,
       failure_reason = CASE WHEN $2 = 'failed'  THEN $4 ELSE failure_reason END
     WHERE id = $5`,
    [metaStatus, metaStatus, timestamp, metaStatus === 'failed' ? JSON.stringify(s.errors ?? 'Failed') : null, msg.id]
  )

  if (metaStatus === 'delivered' || metaStatus === 'failed') {
    const d = metaStatus === 'delivered' ? 1 : 0
    const f = metaStatus === 'failed'    ? 1 : 0
    await pool.query(
      `INSERT INTO whatsapp_usage_summary (school_id, year_month, message_type, sent_count, delivered_count, failed_count)
       VALUES ($1,$2,$3,0,$4,$5)
       ON CONFLICT (school_id, year_month, message_type) DO UPDATE SET
         delivered_count = whatsapp_usage_summary.delivered_count + $4,
         failed_count    = whatsapp_usage_summary.failed_count    + $5`,
      [msg.school_id, msg.year_month, msg.message_type, d, f]
    )
  }
}
