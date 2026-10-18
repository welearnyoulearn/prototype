import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { proxy } from '../proxy'
import { JWT_SECRET, COOKIE_ADMIN, COOKIE_PLATFORM } from '../lib/auth-constants'
import { GET as usageDigest } from '../app/api/cron/usage-digest/route'
import { GET as birthdaySweep } from '../app/api/cron/birthday-sweep/route'
import { GET as logCleanup, POST as logCleanupPost } from '../app/api/internal/log-cleanup/route'

// Phase 0 security regressions (#397), exercised directly — no server or database:
//   1. /api/* on the admin.* host skipped the plan-lock and feature-entitlement checks.
//   2. Cron routes ran with no auth when CRON_SECRET was unset and accepted the raw secret.

test.describe('Admin host /api/* goes through the feature gate', () => {
  const realFetch = global.fetch
  const realNow = Date.now
  test.beforeAll(() => {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/internal/feature-entitlement')) {
        const p = new URL(url).searchParams
        return new Response(JSON.stringify({ enabled: !(p.get('school_id') === '7' && p.get('feature') === 'expenses') }), { status: 200 })
      }
      if (url.includes('/api/internal/plan-locked')) return new Response(JSON.stringify({ school_ids: [] }), { status: 200 })
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    // Jump past proxy.ts's caches so this block reads its own mocked answers.
    Date.now = () => realNow() + 20 * 60_000
  })
  test.afterAll(() => { global.fetch = realFetch; Date.now = realNow })

  const token = (role: string, schoolId: number) => jwt.sign({ userId: 1, role, schoolId, sid: 'x' }, JWT_SECRET)
  const call = (path: string, cookie?: string) =>
    proxy(new NextRequest(`https://admin.welearnyoulearn.com${path}`, {
      headers: { host: 'admin.welearnyoulearn.com', ...(cookie ? { cookie } : {}) },
    }))

  test('a school cookie is refused a feature its school lacks', async () => {
    const res = await call('/api/expenses', `${COOKIE_ADMIN}=${token('school_admin', 7)}`)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'FEATURE_DISABLED', feature: 'expenses' })
  })

  test('platform admin and static assets still pass', async () => {
    expect((await call('/api/expenses', `${COOKIE_PLATFORM}=${token('platform_admin', 0)}`)).status).not.toBe(403)
    expect((await call('/_next/static/x.js')).headers.get('location')).toBeNull()
    expect((await call('/')).headers.get('location')).toContain('/login?role=platform')
  })
})

test.describe('Cron routes fail closed', () => {
  const realSecret = process.env.CRON_SECRET
  test.afterAll(() => {
    if (realSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = realSecret
  })

  const handlers = { usageDigest, birthdaySweep, logCleanup, logCleanupPost }
  const req = (authorization?: string) =>
    new NextRequest('http://localhost:3000/api/cron/x', { headers: authorization ? { authorization } : {} })

  for (const [name, handler] of Object.entries(handlers)) {
    test(`${name}: 503 without CRON_SECRET, 401 for a missing or raw (non-Bearer) secret`, async () => {
      delete process.env.CRON_SECRET
      expect((await handler(req())).status).toBe(503)
      process.env.CRON_SECRET = 'phase0-secret'
      expect((await handler(req())).status).toBe(401)
      expect((await handler(req('phase0-secret'))).status).toBe(401)
      expect((await handler(req('Bearer wrong'))).status).toBe(401)
    })
  }
})
