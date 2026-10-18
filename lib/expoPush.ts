import { after } from 'next/server'
import { z } from 'zod'
import pool from './db'

// Expo push to the parent mobile app (#133). The in-app notifications row is the
// source of truth; push is only a nudge, so nothing here may fail the request that
// created the notification. Tokens Expo reports as DeviceNotRegistered are deleted.

// Ids + sound files must match the app's src/lib/push.ts channel list. Android binds the
// sound to the channel (channelId); iOS plays `sound`.
const PUSH_SOUNDS = {
  exams: 'exams_chime.wav',
  results: 'results_bells.wav',
  fees: 'fees_coin.wav',
  absent: 'absent_alert.wav',
  messages: 'message_ding.wav',
  birthday: 'birthday_jingle.wav',
} as const
export type PushKind = keyof typeof PUSH_SOUNDS

export type ParentPush = { title: string; body: string; data?: Record<string, string>; kind?: PushKind }

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100 // Expo's per-request limit

const TicketsSchema = z.object({
  data: z.array(z.object({
    status: z.string(),
    message: z.string().optional(),
    details: z.object({ error: z.string().optional() }).passthrough().optional(),
  }).passthrough()),
})

// Sends `msg` to every token and returns the tokens Expo says are gone. Never throws.
export async function sendExpo(tokens: string[], msg: ParentPush, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  }
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`

  // The app opens data.url on tap and falls back to its notifications screen.
  const data = msg.data ?? { url: '/notifications' }
  const kind = msg.kind ?? 'messages'
  const dead: string[] = []
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)
    try {
      const res = await fetchImpl(EXPO_SEND_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map(to => ({
          to, title: msg.title, body: msg.body, data, sound: PUSH_SOUNDS[kind], channelId: kind, priority: 'high',
        }))),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        console.error('[expoPush] send failed', res.status, await res.text().catch(() => ''))
        continue
      }
      const parsed = TicketsSchema.safeParse(await res.json().catch(() => null))
      if (!parsed.success) {
        console.error('[expoPush] unexpected response', parsed.error.issues[0]?.message)
        continue
      }
      // Tickets come back in the same order as the messages.
      parsed.data.data.forEach((ticket, j) => {
        if (ticket.status !== 'error') return
        if (ticket.details?.error === 'DeviceNotRegistered' && batch[j]) dead.push(batch[j])
        else console.error('[expoPush] ticket error', ticket.message, ticket.details?.error)
      })
    } catch (err) {
      console.error('[expoPush] batch failed', err)
    }
  }
  return dead
}

// Pushes to every registered phone of these parents. Never throws.
export async function pushToParents(parentIds: number[], msg: ParentPush): Promise<void> {
  try {
    const ids = [...new Set(parentIds)]
    if (ids.length === 0) return
    const { rows } = await pool.query<{ token: string }>(
      'SELECT token FROM expo_push_tokens WHERE parent_id = ANY($1::int[])', [ids],
    )
    if (rows.length === 0) return
    const dead = await sendExpo(rows.map(r => r.token), msg)
    if (dead.length > 0) await pool.query('DELETE FROM expo_push_tokens WHERE token = ANY($1::text[])', [dead])
  } catch (err) {
    console.error('[expoPush]', err)
  }
}

// For route handlers: push after the response is sent, so it never delays or fails the request.
export function pushToParentsAfter(parentIds: number[], msg: ParentPush): void {
  if (parentIds.length === 0) return
  after(() => pushToParents(parentIds, msg).catch(console.error))
}
