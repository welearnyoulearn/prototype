/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, request as pwRequest } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool } from './fixtures/platform-admin'

// Watchline (API monitoring) is a PER-SCHOOL switch, not a plan feature (issue #195):
//   • the plan feature-config matrix no longer has a Watchline row,
//   • the per-school switch (school_feature_overrides) still works: on → visible → off.
// Creates one school and deletes it at the end.

test.describe.serial('Watchline is per school only', () => {
  const ts = Date.now()
  let cookie = '', schoolId = 0

  test.beforeAll(async () => {
    test.setTimeout(120000)
    cookie = await platformAdminCookie()
    const school = await createSchool(cookie, { name: `Watchline E2E ${ts}`, email: `wl${ts}@e2etest.com`, phone: `98${String(ts).slice(-8)}` })
    schoolId = school.id
  })

  test.afterAll(async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE })
    if (schoolId) await ctx.delete(`/api/schools/${schoolId}`, { headers: { Cookie: cookie } }).catch(() => {})
    await ctx.dispose()
  })

  test('1. The plan feature-config matrix has no Watchline row', async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE })
    const res = await ctx.get('/api/platform/features', { headers: { Cookie: cookie } })
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain('attendance')            // the matrix is there…
    expect(text).not.toContain('api-monitoring')    // …without Watchline
    await ctx.dispose()
  })

  test('2. The per-school switch still works: on, visible, off', async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Cookie: cookie } })
    const url = `/api/platform/schools/${schoolId}/feature-overrides`

    expect((await ctx.post(url, { data: { feature_key: 'api-monitoring', enabled: true } })).status()).toBe(200)
    expect((await (await ctx.get(url)).json()).overrides['api-monitoring']).toBe(true)

    expect((await ctx.post(url, { data: { feature_key: 'api-monitoring', enabled: false } })).status()).toBe(200)
    expect((await (await ctx.get(url)).json()).overrides['api-monitoring']).toBe(false)

    expect((await ctx.delete(url, { data: { feature_key: 'api-monitoring' } })).status()).toBe(200)
    expect((await (await ctx.get(url)).json()).overrides['api-monitoring']).toBeUndefined()

    // Other keys that are not overridable are still refused
    expect((await ctx.post(url, { data: { feature_key: 'attendance', enabled: true } })).status()).toBe(400)
    await ctx.dispose()
  })

  test('3. Only a platform admin can change it', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE })
    expect((await anon.post(`/api/platform/schools/${schoolId}/feature-overrides`, { data: { feature_key: 'api-monitoring', enabled: true } })).status()).toBe(401)
    await anon.dispose()
  })
})
