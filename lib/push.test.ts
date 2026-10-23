import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import * as push from './push'

// push.ts re-reads FIREBASE_SERVICE_ACCOUNT whenever it changes, so each scenario just sets it first.
function loadPush(env: string | undefined): typeof push {
  if (env === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT
  else process.env.FIREBASE_SERVICE_ACCOUNT = env
  return push
}

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const account = JSON.stringify({ project_id: 'demo', client_email: 'sa@demo.iam.gserviceaccount.com', private_key: privateKey })

type FetchCall = { url: string; init?: RequestInit }

// Replaces global fetch: Google's OAuth endpoint always succeeds, the FCM endpoint answers as told.
function stubFcm(fcmStatus: number, fcmBody: unknown) {
  const real = globalThis.fetch
  const calls: FetchCall[] = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url)
    calls.push({ url: target, init })
    if (target.startsWith('https://oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
    }
    return new Response(JSON.stringify(fcmBody), { status: fcmStatus })
  }) as typeof fetch
  return { calls, restore: () => { globalThis.fetch = real } }
}

test('push is off, and dispatch does nothing, when FIREBASE_SERVICE_ACCOUNT is unset', async () => {
  loadPush(undefined)
  assert.equal(push.isPushConfigured(), false)
  assert.equal(await push.dispatchPendingPushes(), 0)
  assert.equal(await push.sendPushToToken('x'.repeat(30), { title: 't', body: 'b' }), 'failed')
})

test('a malformed service account leaves push off', async () => {
  assert.equal(loadPush('{not json').isPushConfigured(), false)
  assert.equal(loadPush('{"project_id":"demo"}').isPushConfigured(), false)
})

test('accepts the service account as raw JSON or base64', async () => {
  assert.equal(loadPush(account).isPushConfigured(), true)
  assert.equal(loadPush(Buffer.from(account).toString('base64')).isPushConfigured(), true)
})

test('sendPushToToken reports sent / unregistered / failed from the FCM response', async () => {
  loadPush(account)
  const token = 'd'.repeat(40)

  let stub = stubFcm(200, { name: 'projects/demo/messages/1' })
  try {
    assert.equal(await push.sendPushToToken(token, { title: 'Hi', body: 'There', data: { a: '1' } }), 'sent')
    const sendCall = stub.calls.find(c => c.url.includes('fcm.googleapis.com'))
    assert.ok(sendCall, 'FCM was called')
    assert.match(sendCall.url, /projects\/demo\/messages:send$/)
    const sent = JSON.parse(String(sendCall.init?.body)) as { message: { token: string; notification: { title: string } } }
    assert.equal(sent.message.token, token)
    assert.equal(sent.message.notification.title, 'Hi')
  } finally { stub.restore() }

  stub = stubFcm(404, { error: { details: [{ errorCode: 'UNREGISTERED' }] } })
  try { assert.equal(await push.sendPushToToken(token, { title: 'Hi', body: 'There' }), 'unregistered') } finally { stub.restore() }

  stub = stubFcm(500, { error: {} })
  try { assert.equal(await push.sendPushToToken(token, { title: 'Hi', body: 'There' }), 'failed') } finally { stub.restore() }
})
