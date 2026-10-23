import test from 'node:test'
import assert from 'node:assert/strict'
import { pushKindFor, sendExpo } from './expoPush'

type Call = { url: string; init: RequestInit }

// A fake Expo endpoint: answers every batch with one ticket per message, using `ticketFor`.
function fakeFetch(calls: Call[], ticketFor: (to: string) => object): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const msgs = JSON.parse(String(init?.body)) as { to: string }[]
    return new Response(JSON.stringify({ data: msgs.map(m => ticketFor(m.to)) }), { status: 200 })
  }) as typeof fetch
}

test('sends in batches of 100 with the Android channel, sound and default tap url', async () => {
  const calls: Call[] = []
  const tokens = Array.from({ length: 250 }, (_, i) => `ExponentPushToken[t${i}]`)
  const dead = await sendExpo(tokens, { title: 'Hi', body: 'There' }, fakeFetch(calls, () => ({ status: 'ok', id: 'x' })))

  assert.deepEqual(dead, [])
  assert.equal(calls.length, 3)
  const sizes = calls.map(c => (JSON.parse(String(c.init.body)) as unknown[]).length)
  assert.deepEqual(sizes, [100, 100, 50])
  assert.equal(calls[0].url, 'https://exp.host/--/api/v2/push/send')
  const first = (JSON.parse(String(calls[0].init.body)) as Record<string, unknown>[])[0]
  assert.equal(first.channelId, 'messages')
  assert.equal(first.sound, 'message_ding.wav')
  assert.deepEqual(first.data, { url: '/notifications' })
  assert.equal((calls[0].init.headers as Record<string, string>)['Accept-Encoding'], 'gzip, deflate')
})

test('uses the channel and sound of the push kind', async () => {
  const calls: Call[] = []
  await sendExpo(['ExponentPushToken[a]'], { title: 'x', body: 'y', kind: 'exams' }, fakeFetch(calls, () => ({ status: 'ok', id: 'x' })))
  const msg = (JSON.parse(String(calls[0].init.body)) as Record<string, unknown>[])[0]
  assert.equal(msg.channelId, 'exams')
  assert.equal(msg.sound, 'exams_chime.wav')
})

test('returns only DeviceNotRegistered tokens as dead', async () => {
  const calls: Call[] = []
  const tokens = ['ExponentPushToken[ok]', 'ExponentPushToken[gone]', 'ExponentPushToken[rate]']
  const dead = await sendExpo(tokens, { title: 'Hi', body: 'There', data: { url: '/exams' } }, fakeFetch(calls, to =>
    to.includes('gone') ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
    : to.includes('rate') ? { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } }
    : { status: 'ok', id: 'x' }))
  assert.deepEqual(dead, ['ExponentPushToken[gone]'])
  assert.deepEqual((JSON.parse(String(calls[0].init.body)) as Record<string, unknown>[])[0].data, { url: '/exams' })
})

test('never throws when Expo is down', async () => {
  const failing = (async () => { throw new Error('network') }) as typeof fetch
  assert.deepEqual(await sendExpo(['ExponentPushToken[a]'], { title: 'x', body: 'y' }, failing), [])
  const http500 = (async () => new Response('oops', { status: 500 })) as typeof fetch
  assert.deepEqual(await sendExpo(['ExponentPushToken[a]'], { title: 'x', body: 'y' }, http500), [])
})

test('each notification type gets the sound channel the app expects', () => {
  for (const type of ['exam_scheduled', 'exam_updated', 'exam_cancelled', 'exam_reminder_7day', 'exam_reminder_1day', 'exam_reminder_today']) assert.equal(pushKindFor(type), 'exams', type)
  assert.equal(pushKindFor('marks_released'), 'results')
  assert.equal(pushKindFor('ack_nudge'), 'results')
  assert.equal(pushKindFor('fee_writeoff_request'), 'fees')
  assert.equal(pushKindFor('birthday'), 'birthday')
  assert.equal(pushKindFor('student_absent'), 'absent')
  assert.equal(pushKindFor('teacher_broadcast'), 'messages')
  assert.equal(pushKindFor('anything_new'), 'messages')
})
