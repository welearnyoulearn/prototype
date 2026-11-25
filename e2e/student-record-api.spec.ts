import { test, expect } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// #496 — GET / PUT / DELETE /api/students/{id} must work on a database built only by the app's own migrations.

async function api(path: string, method: string, body?: object, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: Record<string, unknown>
  try { data = JSON.parse(text) } catch { data = { text } }
  return { status: res.status, data }
}

async function newSchool(tag: string) {
  const platform = await platformAdminCookie()
  const ts = Date.now()
  const school = await createSchool(platform, {
    name: `Record ${tag} ${ts}`, email: `record-${tag}-${ts}@test.invalid`, phone: `9${String(ts).slice(-9)}`,
  })
  await setSubscription(platform, school.id, 'premium')
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: school.email, password: school.temp_password }),
  })
  const cookie = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-auth='))?.split(';')[0]
  if (!cookie) throw new Error(`School admin login failed: ${res.status}`)
  return { id: school.id, cookie }
}

test.describe.serial('Student record API (#496)', () => {
  let school: { id: number; cookie: string }
  let other: { id: number; cookie: string }
  let studentId = 0

  test.beforeAll(async () => {
    test.setTimeout(120000)
    school = await newSchool('a')
    other = await newSchool('b')
    const created = await api('/api/students', 'POST',
      { school_id: school.id, name: 'Record Student', grade: '8', section: 'A', school_roll_number: 1,
        parent_name: 'Record Parent', parent_phone: `8${String(Date.now()).slice(-9)}` }, school.cookie)
    expect(created.status, JSON.stringify(created.data)).toBe(201)
    studentId = created.data.id as number
  })

  test('view returns the student without secrets', async () => {
    const res = await api(`/api/students/${studentId}`, 'GET', undefined, school.cookie)
    expect(res.status).toBe(200)
    expect(res.data.name).toBe('Record Student')
    expect(res.data).not.toHaveProperty('password_hash')
  })

  test('another school cannot view, edit or remove the student', async () => {
    for (const [method, body] of [['GET', undefined], ['PUT', { name: 'Hijacked' }], ['DELETE', undefined]] as const) {
      const res = await api(`/api/students/${studentId}`, method, body, other.cookie)
      expect([403, 404], `${method} returned ${res.status}`).toContain(res.status)
    }
  })

  test('edit saves', async () => {
    const res = await api(`/api/students/${studentId}`, 'PUT', { name: 'Record Renamed' }, school.cookie)
    expect(res.status).toBe(200)
    const after = await api(`/api/students/${studentId}`, 'GET', undefined, school.cookie)
    expect(after.data.name).toBe('Record Renamed')
  })

  test('remove, then restore', async () => {
    const removed = await api(`/api/students/${studentId}`, 'DELETE', undefined, school.cookie)
    expect(removed.status).toBe(200)
    expect((await api(`/api/students/${studentId}`, 'GET', undefined, school.cookie)).data.status).not.toBe('active')
    const restored = await api(`/api/students/${studentId}`, 'PUT', { status: 'active' }, school.cookie)
    expect(restored.status).toBe(200)
    expect(restored.data.status).toBe('active')
  })
})
