// Push delivery for notifications: Firebase Cloud Messaging (HTTP v1) for browsers, and Expo's push service
// for the parent mobile app (lib/expoPush.ts), from one dispatcher.
//
// The notifications table stays the source of truth (history, read state, the bell). This file only
// wakes devices up. It talks to FCM directly with fetch + jose instead of firebase-admin: that SDK is
// heavy for a serverless cold start, and all we need is "mint an OAuth token, POST one message".
//
// Delivery is an outbox. Anything that INSERTs into notifications leaves push_sent_at NULL;
// dispatchPendingPushes() claims those rows, looks up the recipients' device_tokens and sends. Callers
// run it after their response (next/server after()), so a push problem can never fail a request.
//
// Env: FIREBASE_SERVICE_ACCOUNT — the service-account JSON (raw, or base64 of it). Unset = no Firebase
// sends (browser devices are skipped), so it is safe to deploy before Firebase exists. Expo needs no key
// here (its Firebase/APNs credentials live in EAS), so devices registered with platform 'expo' are always
// pushed.

import { z } from 'zod'
import { SignJWT, importPKCS8 } from 'jose'
import pool from '@/lib/db'
import { mobilePushLink, pushLinkFor, type PushRole } from '@/lib/pushLinks'
import { pushKindFor, sendExpo } from '@/lib/expoPush'

const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
})
type ServiceAccount = z.infer<typeof serviceAccountSchema>

const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
// Pushes older than this are dropped instead of delivered — a "class starts in 10 minutes" alert
// arriving a day late is worse than none.
const MAX_PUSH_AGE_HOURS = 24
const SEND_CONCURRENCY = 10
const BODY_MAX = 200

// Parsed once per distinct env value (the key import and JSON parse are not free on every send).
let cachedAccount: { raw: string; account: ServiceAccount | null } | null = null
function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim() ?? ''
  if (cachedAccount?.raw === raw) return cachedAccount.account
  let account: ServiceAccount | null = null
  if (raw) {
    try {
      const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
      const parsed = serviceAccountSchema.safeParse(JSON.parse(json))
      if (parsed.success) account = parsed.data
      else console.error('[push] FIREBASE_SERVICE_ACCOUNT is missing project_id / client_email / private_key')
    } catch {
      console.error('[push] FIREBASE_SERVICE_ACCOUNT is not valid JSON')
    }
  }
  cachedAccount = { raw, account }
  cachedAccessToken = null
  return account
}

export function isPushConfigured(): boolean {
  return serviceAccount() !== null
}

let cachedAccessToken: { value: string; expiresAt: number } | null = null
async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Date.now()
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > now) return cachedAccessToken.value

  const key = await importPKCS8(account.private_key, 'RS256')
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(TOKEN_URI)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)

  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`Google OAuth token request failed (${res.status})`)
  const body = await res.json() as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('Google OAuth token response had no access_token')
  cachedAccessToken = { value: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 }
  return body.access_token
}

export type PushMessage = {
  title: string
  body: string
  /** FCM data values must be strings. */
  data?: Record<string, string>
}

export type PushResult = 'sent' | 'unregistered' | 'failed'

/** Sends one message to one device token. Never throws. */
export async function sendPushToToken(token: string, message: PushMessage): Promise<PushResult> {
  const account = serviceAccount()
  if (!account) return 'failed'
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(account)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          data: message.data ?? {},
        },
      }),
    })
    if (res.ok) return 'sent'
    const err = await res.json().catch(() => null) as { error?: { details?: { errorCode?: string }[] } } | null
    const dead = res.status === 404 || err?.error?.details?.some(d => d.errorCode === 'UNREGISTERED')
    if (dead) return 'unregistered'
    console.error('[push] FCM send failed', res.status)
    return 'failed'
  } catch (e) {
    console.error('[push] FCM send error', e)
    return 'failed'
  }
}

export type PushDrainOptions = { batchSize?: number; maxBatches?: number }

/**
 * dispatchPendingPushes() in a loop, for jobs that create many notifications at once (cron sweeps
 * that notify a whole school). Stops once nothing is pending, or after maxBatches.
 */
export async function drainPendingPushes({ batchSize = 100, maxBatches = 20 }: PushDrainOptions = {}): Promise<number> {
  let sent = 0
  try {
    for (let i = 0; i < maxBatches; i++) {
      const { rowCount } = await pool.query(`SELECT 1 FROM notifications WHERE push_sent_at IS NULL LIMIT 1`)
      if (!rowCount) break
      sent += await dispatchPendingPushes(batchSize)
    }
  } catch (e) {
    console.error('[push] drainPendingPushes failed', e)
  }
  return sent
}

type PendingRow = {
  id: number
  type: string
  title: string | null
  message: string | null
  school_id: number | null
  data: unknown
  recipient_teacher_id: number | null
  recipient_student_id: number | null
  recipient_parent_id: number | null
  recipient_school_id: number | null
}

function recipientOf(r: PendingRow): { role: PushRole; id: number } | null {
  if (r.recipient_teacher_id) return { role: 'teacher', id: r.recipient_teacher_id }
  if (r.recipient_student_id) return { role: 'student', id: r.recipient_student_id }
  if (r.recipient_parent_id) return { role: 'parent', id: r.recipient_parent_id }
  if (r.recipient_school_id) return { role: 'school', id: r.recipient_school_id }
  return null
}

type Device = { recipient_role: string; recipient_id: number; token: string; platform: string }

/**
 * Pushes every notification that has not been pushed yet. Safe to call from several places at once
 * and as often as you like: rows are claimed with FOR UPDATE SKIP LOCKED and stamped before sending,
 * so each notification is attempted at most once. Browser devices go through Firebase (only when
 * FIREBASE_SERVICE_ACCOUNT is set), mobile-app devices through Expo. Returns how many device sends
 * were accepted.
 */
export async function dispatchPendingPushes(limit = 100): Promise<number> {
  try {
    // Too old to be useful now — mark them done without sending.
    await pool.query(
      `UPDATE notifications SET push_sent_at = NOW()
        WHERE push_sent_at IS NULL AND created_at < NOW() - make_interval(hours => $1)`,
      [MAX_PUSH_AGE_HOURS]
    )

    const { rows } = await pool.query<PendingRow>(
      `UPDATE notifications SET push_sent_at = NOW()
        WHERE id IN (
          SELECT id FROM notifications WHERE push_sent_at IS NULL
          ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
        )
        RETURNING id, type, title, message, school_id, data,
                  recipient_teacher_id, recipient_student_id, recipient_parent_id, recipient_school_id`,
      [limit]
    )
    if (rows.length === 0) return 0

    const targets = rows.flatMap(r => { const t = recipientOf(r); return t ? [{ row: r, ...t }] : [] })
    if (targets.length === 0) return 0

    const { rows: devices } = await pool.query<Device>(
      `SELECT d.recipient_role, d.recipient_id, d.token, d.platform
         FROM device_tokens d
         JOIN unnest($1::text[], $2::int[]) AS r(role, id) ON d.recipient_role = r.role AND d.recipient_id = r.id`,
      [targets.map(t => t.role), targets.map(t => t.id)]
    )
    const devicesByRecipient = new Map<string, Device[]>()
    for (const d of devices) {
      const key = `${d.recipient_role}:${d.recipient_id}`
      devicesByRecipient.set(key, [...(devicesByRecipient.get(key) ?? []), d])
    }

    const firebaseOn = isPushConfigured()
    const fcmJobs: { token: string; message: PushMessage }[] = []
    const expoJobs: { tokens: string[]; title: string; body: string; url: string; type: string; id: string }[] = []
    for (const t of targets) {
      const mine = devicesByRecipient.get(`${t.role}:${t.id}`) ?? []
      if (mine.length === 0) continue
      const title = t.row.title ?? 'New notification'
      const body = (t.row.message ?? '').slice(0, BODY_MAX)
      // Deep link for the parent apps; other portals have none.
      const link = pushLinkFor(t.role, t.row.type, t.row.data)
      const expoTokens = mine.filter(d => d.platform === 'expo').map(d => d.token)
      if (expoTokens.length > 0) {
        expoJobs.push({ tokens: expoTokens, title, body, url: mobilePushLink(link), type: t.row.type, id: String(t.row.id) })
      }
      if (!firebaseOn) continue
      for (const d of mine) {
        if (d.platform === 'expo') continue
        fcmJobs.push({
          token: d.token,
          message: { title, body, data: { notification_id: String(t.row.id), type: t.row.type, ...(link ? { url: link } : {}) } },
        })
      }
    }

    let sent = 0
    const dead: string[] = []
    for (let i = 0; i < fcmJobs.length; i += SEND_CONCURRENCY) {
      const batch = fcmJobs.slice(i, i + SEND_CONCURRENCY)
      const results = await Promise.all(batch.map(j => sendPushToToken(j.token, j.message)))
      results.forEach((result, n) => {
        if (result === 'sent') sent++
        else if (result === 'unregistered') dead.push(batch[n].token)
      })
    }
    for (const job of expoJobs) {
      const gone = await sendExpo(job.tokens, {
        title: job.title,
        body: job.body,
        data: { url: job.url, type: job.type, notification_id: job.id },
        kind: pushKindFor(job.type),
      })
      sent += job.tokens.length - gone.length
      dead.push(...gone)
    }
    if (dead.length > 0) await pool.query(`DELETE FROM device_tokens WHERE token = ANY($1::text[])`, [dead])
    return sent
  } catch (e) {
    console.error('[push] dispatchPendingPushes failed', e)
    return 0
  }
}
