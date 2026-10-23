import 'dotenv/config'
import { test, expect } from '@playwright/test'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'wlyl-dev-only-secret-not-for-production'

function platformAdminCookie(): string {
  const token = jwt.sign({
    userId: 1,
    role: 'platform_admin',
    firstLogin: false,
    profileCompleted: true,
  }, JWT_SECRET, { expiresIn: '5m' })
  return `wlyl-platform=${token}`
}

test.describe('API Health & Init', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.db).toBe('connected')
  })

  test('init endpoint returns success for platform admin', async ({ request }) => {
    const res = await request.get('/api/init', { headers: { Cookie: platformAdminCookie() } })
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
