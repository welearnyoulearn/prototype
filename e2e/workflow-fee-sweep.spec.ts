import { test, expect } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Fee-management sweep: every read endpoint answers the same four questions — does it need a login,
// does it refuse another school's admin, does it reject missing params, and does it return the shape
// the screen reads. Plus export, write-endpoint validation and cross-school id probing.

type Res = { status: number; data: any; text: string }
type Caller = (path: string, method?: string, body?: object) => Promise<Res>

const caller = (cookie: string): Caller => async (path, method = 'GET', body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' })
  const ct = r.headers.get('content-type') ?? ''
  const text = ct.includes('json') || ct.includes('text') ? await r.text() : ''
  let data: any; try { data = JSON.parse(text) } catch { data = text }
  return { status: r.status, data, text }
}
async function login(email: string, password: string): Promise<Caller> {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), redirect: 'manual' })
  const cookie = ((res.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-auth=')) ?? '').split(';')[0]
  if (!cookie) throw new Error(`Login failed for ${email}`)
  return caller(cookie)
}

const yr = new Date().getFullYear()
const YEAR = `${yr}-${String(yr + 1).slice(2)}`
let sid = 0, other = 0
let admin: Caller, outsider: Caller
const anon = caller('')
let stuA = 0

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const pc = await platformAdminCookie()
  const mk = async (n: string) => {
    const s = await createSchool(pc, { name: `E2E Fee Sweep ${n} ${Date.now()}`, phone: `9${String(Date.now() + n.length).slice(-9)}`, email: `sweep${n}${Date.now()}@test.com` })
    await setSubscription(pc, s.id, 'premium')
    return s
  }
  const a = await mk('A'), b = await mk('B')
  sid = a.id; other = b.id
  admin = await login(a.email, a.temp_password)
  outsider = await login(b.email, b.temp_password)
  await admin('/api/academic-years', 'POST', { school_id: sid, label: YEAR, start_date: `${yr}-04-01`, end_date: `${yr + 1}-03-31` })
  const en = await admin('/api/students/bulk', 'POST', { school_id: sid, students: [{ name: 'Sweep A', grade: '5', section: 'A', school_roll_number: 1, parent_name: 'P', parent_phone: `9${String(Date.now()).slice(-9)}` }] })
  stuA = en.data.students[0].id
  const cat = await admin('/api/fees/categories', 'POST', { school_id: sid, name: 'Tuition', frequency: 'monthly', category_type: 'fixed' })
  await admin('/api/fees/structures', 'POST', { school_id: sid, academic_year: YEAR, structures: [{ fee_category_id: cat.data.id, grade: '5', amount: 1000, due_day: 10 }] })
  expect((await admin('/api/fees/generate', 'POST', { school_id: sid, academic_year: YEAR })).status).toBe(200)
})

const reads: Array<{ name: string; path: (s: number) => string; needs: string[] }> = [
  { name: 'archive', path: s => `/api/fees/archive?school_id=${s}`, needs: ['school_id'] },
  { name: 'passout', path: s => `/api/fees/passout?school_id=${s}`, needs: ['school_id'] },
  { name: 'removed-students', path: s => `/api/fees/removed-students?school_id=${s}`, needs: ['school_id'] },
  { name: 'category-changelog', path: s => `/api/fees/category-changelog?school_id=${s}`, needs: ['school_id'] },
  { name: 'structure-history', path: s => `/api/fees/structure-history?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id'] },
  { name: 'assignment-history', path: s => `/api/fees/assignment-history?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id'] },
  { name: 'audit-log', path: s => `/api/fees/audit-log?school_id=${s}`, needs: ['school_id'] },
  { name: 'setup-status', path: s => `/api/fees/setup-status?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id', 'academic_year'] },
  { name: 'stats', path: s => `/api/fees/stats?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id'] },
  { name: 'reports', path: s => `/api/fees/reports?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id'] },
  { name: 'ledger', path: s => `/api/fees/ledger?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id'] },
  { name: 'categories', path: s => `/api/fees/categories?school_id=${s}`, needs: ['school_id'] },
  { name: 'structures', path: s => `/api/fees/structures?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id'] },
  { name: 'waivers', path: s => `/api/fees/waivers?school_id=${s}`, needs: ['school_id'] },
  { name: 'payments', path: s => `/api/fees/payments?school_id=${s}`, needs: ['school_id'] },
  { name: 'day-close', path: s => `/api/fees/day-close?school_id=${s}`, needs: ['school_id'] },
  { name: 'open-dues', path: s => `/api/fees/open-dues?school_id=${s}`, needs: ['school_id'] },
  { name: 'year-end settings', path: s => `/api/fees/year-end/settings?school_id=${s}`, needs: ['school_id'] },
  { name: 'writeoff-requests', path: s => `/api/fees/year-end/writeoff-requests?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id'] },
  { name: 'year-end', path: s => `/api/fees/year-end?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id', 'academic_year'] },
  { name: 'audit-report', path: s => `/api/fees/audit-report?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id'] },
  { name: 'export ledger', path: s => `/api/fees/export?school_id=${s}&academic_year=${YEAR}&type=ledger`, needs: ['school_id', 'academic_year'] },
  { name: 'export payments', path: s => `/api/fees/export?school_id=${s}&academic_year=${YEAR}&type=payments`, needs: ['school_id', 'academic_year'] },
  { name: 'year-end pack', path: s => `/api/fees/year-end/pack?school_id=${s}&academic_year=${YEAR}`, needs: ['school_id', 'academic_year'] },
  { name: 'passbook', path: s => `/api/fees/passbook?school_id=${s}&student_id=${stuA}`, needs: ['school_id', 'student_id'] },
]

test('SWEEP-01 every fee read endpoint works for the owner school', async () => {
  const bad: string[] = []
  for (const r of reads) {
    const res = await admin(r.path(sid))
    if (res.status !== 200) bad.push(`${r.name} → ${res.status} ${String(res.text).slice(0, 100)}`)
  }
  expect(bad).toEqual([])
})

test('SWEEP-02 every fee read endpoint refuses no login', async () => {
  const bad: string[] = []
  for (const r of reads) {
    const res = await anon(r.path(sid))
    if (![401, 403, 307, 302].includes(res.status)) bad.push(`${r.name} → ${res.status}`)
  }
  expect(bad).toEqual([])
})

test("SWEEP-03 every fee read endpoint refuses another school's admin", async () => {
  const bad: string[] = []
  for (const r of reads) {
    const res = await outsider(r.path(sid))
    if (res.status !== 403) bad.push(`${r.name} → ${res.status}`)
  }
  expect(bad).toEqual([])
})

test('SWEEP-04 missing parameters are a 400, not a 500', async () => {
  const bad: string[] = []
  for (const r of reads) {
    for (const n of r.needs) {
      const u = new URL(`${BASE}${r.path(sid)}`); u.searchParams.delete(n)
      const res = await admin(u.pathname + u.search)
      if (res.status !== 400) bad.push(`${r.name} without ${n} → ${res.status}`)
    }
  }
  expect(bad).toEqual([])
})

test("SWEEP-05 the screens' response shapes", async () => {
  const stats = (await admin(`/api/fees/stats?school_id=${sid}&academic_year=${YEAR}`)).data
  expect(stats.summary).toBeTruthy()
  const ledger = (await admin(`/api/fees/ledger?school_id=${sid}&academic_year=${YEAR}`)).data
  const rows = Array.isArray(ledger) ? ledger : ledger.rows ?? ledger.ledger
  expect(Array.isArray(rows) && rows.length).toBeGreaterThan(0)
  const pb = (await admin(`/api/fees/passbook?school_id=${sid}&student_id=${stuA}`)).data
  expect(pb.bills ?? pb.ledger).toBeTruthy()
  expect(typeof (await admin(`/api/fees/setup-status?school_id=${sid}&academic_year=${YEAR}`)).data).toBe('object')
})

test('SWEEP-06 export rejects an unknown type and survives an empty year', async () => {
  expect((await admin(`/api/fees/export?school_id=${sid}&academic_year=${YEAR}&type=nonsense`)).status).toBe(400)
  expect((await admin(`/api/fees/export?school_id=${sid}&academic_year=1999-00&type=ledger`)).status).toBeLessThan(500)
})

test("SWEEP-07 another school's student cannot be read through your own school_id", async () => {
  expect((await outsider(`/api/fees/passbook?school_id=${other}&student_id=${stuA}`)).status).toBe(404)
  const led = await outsider(`/api/fees/ledger?school_id=${other}&student_id=${stuA}`)
  const rows = Array.isArray(led.data) ? led.data : led.data.rows ?? led.data.ledger ?? []
  expect(rows.length).toBe(0)
})

test('SWEEP-08 write endpoints refuse no login and other schools, and validate input', async () => {
  const writes: Array<[string, string, object]> = [
    ['/api/fees/categories', 'POST', { school_id: sid, name: 'X', frequency: 'monthly', category_type: 'fixed' }],
    ['/api/fees/structures', 'POST', { school_id: sid, academic_year: YEAR, structures: [] }],
    ['/api/fees/generate', 'POST', { school_id: sid, academic_year: YEAR }],
    ['/api/fees/day-close', 'POST', { school_id: sid, actual_cash: 0 }],
    ['/api/fees/year-end', 'POST', { school_id: sid, from_year: YEAR, action: 'close' }],
    ['/api/fees/year-end/settings', 'PUT', { school_id: sid, writeoff_limit: 0, leave_open_days: 30 }],
  ]
  const bad: string[] = []
  for (const [p, m, b] of writes) {
    const no = await anon(p, m, b)
    if (![401, 403, 307, 302].includes(no.status)) bad.push(`${m} ${p} no login → ${no.status}`)
    const out = await outsider(p, m, b)
    if (out.status !== 403) bad.push(`${m} ${p} other school → ${out.status}`)
  }
  expect(bad).toEqual([])
  expect((await admin('/api/fees/categories', 'POST', { school_id: sid, name: 'Bad', frequency: 'weekly', category_type: 'fixed' })).status).toBe(400)
  expect((await admin('/api/fees/payments', 'POST', { school_id: sid })).status).toBe(400)
  expect((await admin('/api/fees/waivers', 'POST', { school_id: sid })).status).toBe(400)
  expect((await admin('/api/fees/year-end/settings', 'PUT', { school_id: sid, writeoff_limit: -5, leave_open_days: 30 })).status).toBe(400)
  expect((await admin('/api/fees/year-end/settings', 'PUT', { school_id: sid, writeoff_limit: 0, leave_open_days: 99999 })).status).toBe(400)
})
