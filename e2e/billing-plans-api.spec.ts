import { test, expect } from '@playwright/test'
import { platformAdminCookie } from './fixtures/platform-admin'

// #358 — plan prices and plan terms. Unauthenticated callers are refused before any
// validation; the public plan list needs no login and carries only public fields.

test.describe('Plan routes refuse callers without a session', () => {
  const cases: [method: string, path: string, body?: unknown][] = [
    ['GET', '/api/platform/plans'],
    ['PUT', '/api/platform/plans', { tier: 'basic', monthly: 499, yearly: 4990, description: '', shownOnWebsite: true, retired: false }],
    ['PUT', '/api/platform/plans', { tier: 'gold', monthly: -1 }], // bad body: auth still comes first
    ['GET', '/api/billing/plan'],
    ['PUT', '/api/schools/1/subscription', { tier: 'basic', billingPeriod: 'yearly', agreedPrice: 100 }],
  ]
  for (const [method, path, body] of cases) {
    test(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`, async ({ request }) => {
      const res = await request.fetch(path, { method, data: body })
      expect([401, 403], `${method} ${path} → ${res.status()}`).toContain(res.status())
    })
  }
})

test('GET /api/plans/public needs no login and returns only public fields', async ({ request }) => {
  const res = await request.get('/api/plans/public')
  expect(res.status()).toBe(200)
  const plans = await res.json() as Record<string, unknown>[]
  expect(Array.isArray(plans)).toBe(true)
  for (const p of plans) {
    expect(Object.keys(p).sort()).toEqual(['description', 'monthly', 'name', 'staffLimit', 'tier', 'yearly'])
  }
})

test.describe('Platform admin', () => {
  let cookie = ''
  test.beforeAll(async () => { cookie = await platformAdminCookie() })

  test('PUT /api/platform/plans with a negative monthly price is 400', async ({ request }) => {
    const res = await request.put('/api/platform/plans', {
      headers: { Cookie: cookie },
      data: { tier: 'basic', monthly: -5, yearly: null, description: '', shownOnWebsite: true, retired: false },
    })
    expect(res.status()).toBe(400)
  })
})
