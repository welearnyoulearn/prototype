import { test, expect } from '@playwright/test'
import { platformAdminCookie } from './fixtures/platform-admin'

// #358 — usage + pricing API guard rails. Unauthenticated callers are refused before
// any validation runs; a platform admin can read usage and bad months are rejected.

test.describe('Usage and pricing routes refuse callers without a session', () => {
  const cases: [method: string, path: string, body?: unknown][] = [
    ['GET',    '/api/platform/usage'],
    ['GET',    '/api/platform/usage?month=bad'],
    ['GET',    '/api/platform/usage/1'],
    ['GET',    '/api/platform/usage-meters'],
    ['PATCH',  '/api/platform/usage-meters', { key: 'whatsapp.message', name: 'x' }],
    ['GET',    '/api/platform/pricing'],
    ['PUT',    '/api/platform/pricing', { meterKey: 'whatsapp.message', tier: 'basic', inPlan: false }],
    ['PUT',    '/api/platform/pricing', { tier: 'gold', inPlan: 'maybe' }], // bad body: auth still comes first
    ['GET',    '/api/platform/schools/1/usage-overrides'],
    ['PUT',    '/api/platform/schools/1/usage-overrides', { meterKey: 'whatsapp.message', included: 10, note: 'test' }],
    ['DELETE', '/api/platform/schools/1/usage-overrides?meter=whatsapp.message'],
    ['GET',    '/api/billing/usage'],
  ]
  for (const [method, path, body] of cases) {
    test(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`, async ({ request }) => {
      const res = await request.fetch(path, { method, data: body })
      expect([401, 403], `${method} ${path} → ${res.status()}`).toContain(res.status())
    })
  }
})

test.describe('Platform admin', () => {
  let cookie = ''
  test.beforeAll(async () => { cookie = await platformAdminCookie() })

  test('GET /api/platform/usage lists the WhatsApp service', async ({ request }) => {
    const res = await request.get('/api/platform/usage', { headers: { Cookie: cookie } })
    expect(res.status()).toBe(200)
    const body = await res.json() as { month: string; meters: { key: string }[] }
    expect(body.month).toMatch(/^\d{4}-\d{2}$/)
    expect(body.meters.map(m => m.key)).toContain('whatsapp.message')
  })

  test('GET /api/platform/usage?month=2026-13 is 400', async ({ request }) => {
    const res = await request.get('/api/platform/usage?month=2026-13', { headers: { Cookie: cookie } })
    expect(res.status()).toBe(400)
  })
})
