import test from 'node:test'
import assert from 'node:assert/strict'
import { sendExpo } from './expoPush'

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
  assert.equal(first.channelId, 'default')
  assert.equal(first.sound, 'default')
  assert.deepEqual(first.data, { url: '/notifications' })
  assert.equal((calls[0].init.headers as Record<string, string>)['Accept-Encoding'], 'gzip, deflate')
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
