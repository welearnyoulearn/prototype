import test, { before } from 'node:test'
import assert from 'node:assert/strict'

// The Firebase config is read from NEXT_PUBLIC_* at import time, so set it before loading the module.
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key'
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo'
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '123'
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:123:web:abc'
process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY = 'test-vapid'
// Loaded before the tests rather than with a top-level await, which tsx can't compile here (#461).
let push: typeof import('./pushClient')
before(async () => { push = await import('./pushClient') })

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    has: (k: string) => map.has(k),
  }
}

// The code under test only touches these browser globals.
function fakeBrowser(permission: 'default' | 'granted' | 'denied', stored: Record<string, string> = {}) {
  const g = globalThis as Record<string, unknown>
  const saved = { window: g.window, Notification: g.Notification, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') }
  const local = memoryStorage(stored)
  const session = memoryStorage()
  g.window = { localStorage: local, sessionStorage: session, PushManager: class {}, Notification: { permission } }
  g.Notification = { permission }
  Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: {} }, configurable: true })
  return {
    local,
    restore() {
      g.window = saved.window
      g.Notification = saved.Notification
      if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator)
      else delete g.navigator
    },
  }
}

test('the bell offers push only where it can work, per permission state', () => {
  for (const [permission, expected] of [['default', 'off'], ['granted', 'on'], ['denied', 'blocked']] as const) {
    const browser = fakeBrowser(permission)
    try { assert.equal(push.getPushState(), expected) } finally { browser.restore() }
  }
})

test('a browser without service workers or PushManager reports unsupported', () => {
  const browser = fakeBrowser('default')
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
  try { assert.equal(push.getPushState(), 'unsupported') } finally { browser.restore() }
})

test('logout cleanup removes the stored token from the server and from this browser', async () => {
  const browser = fakeBrowser('granted', { wlyl_push_token: 'tok-1234567890123456789' })
  const realFetch = globalThis.fetch
  const calls: { url: string; method?: string; body?: string }[] = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method, body: String(init?.body) })
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  try {
    await push.unregisterPushDevice()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/devices')
    assert.equal(calls[0].method, 'DELETE')
    assert.deepEqual(JSON.parse(calls[0].body ?? '{}'), { token: 'tok-1234567890123456789' })
    assert.equal(browser.local.has('wlyl_push_token'), false)
  } finally {
    globalThis.fetch = realFetch
    browser.restore()
  }
})

test('logout cleanup does nothing, and does not fail, when push was never enabled', async () => {
  const browser = fakeBrowser('default')
  const realFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => { called = true; return new Response('{}') }) as typeof fetch
  try {
    await push.unregisterPushDevice()
    assert.equal(called, false)
  } finally {
    globalThis.fetch = realFetch
    browser.restore()
  }
})

test('"not now" hides the post-login card for the snooze period, then it comes back', () => {
  const browser = fakeBrowser('default')
  try {
    assert.equal(push.isPushPromptSnoozed(), false)
    push.snoozePushPrompt(7)
    assert.equal(push.isPushPromptSnoozed(), true)
    // An expired snooze no longer hides the card.
    browser.local.setItem('wlyl_push_prompt_until', String(Date.now() - 1000))
    assert.equal(push.isPushPromptSnoozed(), false)
    // Garbage in storage must not hide it forever either.
    browser.local.setItem('wlyl_push_prompt_until', 'not-a-number')
    assert.equal(push.isPushPromptSnoozed(), false)
  } finally { browser.restore() }
})
