import { test, expect } from '@playwright/test'
import { platformAdminCookie } from './fixtures/platform-admin'

// #358 — bills API guard rails. Unauthenticated callers (and the cron without its secret) are refused;
// a platform admin can list bills and a negative payment is rejected.

test.describe('Bill routes refuse callers without a session', () => {
  const cases: [method: string, path: string, body?: unknown][] = [
    ['GET',  '/api/platform/billing'],
    ['GET',  '/api/platform/billing?month=bad'],
    ['POST', '/api/platform/billing/1', { action: 'resend' }],
    ['POST', '/api/platform/billing/1', { action: 'record_payment', amount: -5 }], // bad body: auth still comes first
    ['GET',  '/api/billing/invoices'],
  ]
  for (const [method, path, body] of cases) {
    test(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`, async ({ request }) => {
      const res = await request.fetch(path, { method, data: body })
      expect([401, 403], `${method} ${path} → ${res.status()}`).toContain(res.status())
    })
  }

  test('cron without the secret', async ({ request }) => {
    test.skip(!process.env.CRON_SECRET, 'CRON_SECRET not set: the cron is open, as in local dev')
    for (const method of ['GET', 'POST']) {
      const res = await request.fetch('/api/cron/billing', { method })
      expect(res.status()).toBe(401)
    }
  })
})

test.describe('Platform admin', () => {
  let cookie = ''
  test.beforeAll(async () => { cookie = await platformAdminCookie() })

  test('GET /api/platform/billing lists bills', async ({ request }) => {
    const res = await request.get('/api/platform/billing', { headers: { Cookie: cookie } })
    expect(res.status()).toBe(200)
    const body = await res.json() as { month: string; nextRun: string; bills: unknown[] }
    expect(body.month).toMatch(/^\d{4}-\d{2}$/)
    expect(Date.parse(body.nextRun)).toBeGreaterThan(Date.now())
    expect(Array.isArray(body.bills)).toBe(true)
  })

  test('POST record_payment with a negative amount is 400', async ({ request }) => {
    const res = await request.post('/api/platform/billing/1', {
      headers: { Cookie: cookie },
      data: { action: 'record_payment', amount: -10, paidOn: '2026-10-01', method: 'upi' },
    })
    expect(res.status()).toBe(400)
  })
})
