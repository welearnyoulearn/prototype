import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Expo push token registration for the parent mobile app (#133):
// POST/DELETE /api/parent/push/expo — auth required, token validated, upsert, delete.
// Seeds one throwaway school (deleted at the end). Never run against production.

const OWNER_PASS = 'OwnerPass@123'
const PARENT_PASS = 'ParentPass@123'
const URL = '/api/parent/push/expo'

const newCtx = () => pwRequest.newContext({ baseURL: BASE })

async function call(ctx: APIRequestContext, method: 'post' | 'delete', url: string, data?: unknown): Promise<{ status: number; body: unknown }> {
  const res = await ctx[method](url, data === undefined ? {} : { data })
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status(), body }
}

test.describe.serial('Parent Expo push tokens', () => {
  const ts = Date.now()
  let platformCookie = ''
  let schoolId = 0
  let parent: APIRequestContext
  let anon: APIRequestContext

  test.beforeAll(async () => {
    test.setTimeout(180000)
    platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie, { name: `Expo Push E2E ${ts}`, email: `expo${ts}@e2etest.com`, phone: `96${String(ts).slice(-8)}` })
    schoolId = school.id
    await setSubscription(platformCookie, schoolId, 'premium')

    const owner = await newCtx()
    expect((await call(owner, 'post', '/api/auth/login', { email: school.email, password: school.temp_password })).status).toBe(200)
    expect((await call(owner, 'post', '/api/auth/change-password', { currentPassword: school.temp_password, newPassword: OWNER_PASS })).status).toBe(200)

    const parentEmail = `pexpo${ts}@e2etest.com`
    const sb = await call(owner, 'post', '/api/students/bulk', {
      school_id: schoolId,
      students: [{ name: 'Kid Expo', grade: '8', section: 'A', school_roll_number: 1, parent_name: 'Parent Expo', parent_phone: `95${String(ts).slice(-8)}`, parent_email: parentEmail }],
    })
    expect(sb.status, JSON.stringify(sb.body)).toBe(201)
    const creds = (sb.body as { credentials: { parents: { login: string; temp_password: string }[] } }).credentials.parents
    const c = creds.find(p => p.login === parentEmail)
    expect(c, 'parent credentials should be issued').toBeTruthy()
    await owner.dispose()

    parent = await newCtx()
    expect((await call(parent, 'post', '/api/parent/auth/login', { identifier: c!.login, password: c!.temp_password })).status).toBe(200)
    expect((await call(parent, 'post', '/api/parent/auth/change-password', { currentPassword: c!.temp_password, newPassword: PARENT_PASS })).status).toBe(200)
    anon = await newCtx()
  })

  test.afterAll(async () => {
    const c = await newCtx()
    if (schoolId) await c.delete(`/api/schools/${schoolId}`, { headers: { Cookie: platformCookie } }).catch(() => {})
    await c.dispose()
    await parent?.dispose()
    await anon?.dispose()
  })

  const token = `ExponentPushToken[e2e-${ts}]`

  test('requires a parent session', async () => {
    expect((await call(anon, 'post', URL, { token })).status).toBe(401)
    expect((await call(anon, 'delete', URL, { token })).status).toBe(401)
  })

  test('rejects malformed tokens', async () => {
    for (const bad of [undefined, '', 'not-a-token', 'ExponentPushToken[]', `ExponentPushToken[${'x'.repeat(300)}]`]) {
      expect((await call(parent, 'post', URL, { token: bad })).status, String(bad)).toBe(400)
    }
    expect((await call(parent, 'delete', URL, { token: 'nope' })).status).toBe(400)
  })

  test('registers (idempotently) and unregisters a token', async () => {
    expect((await call(parent, 'post', URL, { token })).status).toBe(201)
    expect((await call(parent, 'post', URL, { token })).status).toBe(201) // upsert, no duplicate error
    expect((await call(parent, 'post', URL, { token: `ExpoPushToken[e2e-${ts}]` })).status).toBe(201)
    expect((await call(parent, 'delete', URL, { token })).status).toBe(200)
    expect((await call(parent, 'delete', URL, { token: `ExpoPushToken[e2e-${ts}]` })).status).toBe(200)
  })
})
