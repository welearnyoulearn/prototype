import { test, expect } from '@playwright/test'

test.describe('API Health & Init', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.db).toBe('connected')
  })

  test('init endpoint returns success', async ({ request }) => {
    const res = await request.get('/api/init')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.message).toBe('Database initialized successfully')
  })

  test('setup-admin GET reports admin exists', async ({ request }) => {
    const res = await request.get('/api/auth/setup-admin')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.exists).toBe(true)
  })
})
