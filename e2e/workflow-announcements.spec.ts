import { test, expect } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Announcement Board (issue #203): only the school's own staff can write; audiences filter correctly;
// expiry is judged in India time; notices can be edited (and their expiry cleared); the browser flow works.

async function api(path: string, method: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function login(identifier: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: identifier, password }), redirect: 'manual',
  })
  const c = (res.headers.getSetCookie?.() ?? []).find(x => x.startsWith('wlyl-auth='))
  if (!c) throw new Error(`Login failed for ${identifier} — status ${res.status}`)
  return c.split(';')[0]
}

// A brand-new throwaway database has no plan features configured; set E2E_ENABLE_PLAN_FEATURES=1 there
// (platform-wide setting, so never changed on a shared database).
async function ensureAnnouncementsOn(platformCookie: string): Promise<void> {
  const tier = await api('/api/platform/features?tier=premium', 'GET', undefined, platformCookie)
  const enabled = (tier.data as { enabled?: string[] }).enabled ?? []
  if (enabled.includes('announcements')) return
  if (process.env.E2E_ENABLE_PLAN_FEATURES !== '1') throw new Error('announcements is off for the premium plan — set E2E_ENABLE_PLAN_FEATURES=1 on a throwaway database')
  const on = await api('/api/platform/features', 'POST', { assignments: [{ feature_key: 'announcements', tier: 'premium', enabled: true }] }, platformCookie)
  if (on.status !== 200) throw new Error(`could not enable announcements: ${on.status}`)
}

const istDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

type Ann = { id: number; title: string; priority: string; target_audience: string; created_by_name: string; expires_at: string | null; announcement_type: string }

test.describe.serial('Announcement Board', () => {
  const ts = Date.now()
  let platform = '', aId = 0, bId = 0, adminA = '', adminB = '', aName = ''
  const PASS = 'AnnBoard#2026x'

  const list = async (as: string, school: number, audience?: string) =>
    (await api(`/api/announcements?school_id=${school}${audience ? `&audience=${audience}` : ''}`, 'GET', undefined, as)).data as Ann[]
  const post = (as: string | undefined, body: Record<string, unknown>) => api('/api/announcements', 'POST', { school_id: aId, title: 'T', content: 'C', ...body }, as)

  async function provision(label: string, phone: string, name: string) {
    const s = await createSchool(platform, { name: `${label} ${ts}`, phone, email: `${label.toLowerCase().replace(/\W/g, '')}${ts}@test.com`, address: '5 Notice Rd' })
    await setSubscription(platform, s.id, 'premium')
    const first = await login(s.email, s.temp_password)
    expect((await api('/api/auth/change-password', 'POST', { newPassword: PASS }, first)).status).toBe(200)
    const cookie = await login(s.email, PASS)
    await api('/api/auth/profile', 'PUT', { full_name: name, phone: '9000000044' }, cookie)
    return { id: s.id as number, email: s.email as string, cookie }
  }

  test.beforeAll(async () => {
    test.setTimeout(150000)
    platform = await platformAdminCookie()
    await ensureAnnouncementsOn(platform)
    aName = `Principal Asha ${ts}`
    const a = await provision('Notice School A', `6${String(ts).slice(-9)}`, aName)
    const b = await provision('Notice School B', `7${String(ts).slice(-9)}`, `Other Admin ${ts}`)
    aId = a.id; adminA = a.cookie
    bId = b.id; adminB = b.cookie
  })

  test.afterAll(async () => {
    for (const id of [aId, bId]) if (id) await api(`/api/schools/${id}`, 'DELETE', undefined, platform).catch(() => {})
  })

  test('1. Nobody without a school-staff login can post, edit or delete', async () => {
    expect((await post(undefined, { title: 'Fake urgent notice', priority: 'urgent' })).status).toBe(403)
    const real = (await post(adminA, { title: 'Real notice' })).data as Ann
    expect((await api(`/api/announcements/${real.id}`, 'PATCH', { title: 'Hacked' })).status).toBe(403)
    expect((await api(`/api/announcements/${real.id}`, 'DELETE')).status).toBe(403)
    const after = (await list(adminA, aId)).find(x => x.id === real.id)
    expect(after?.title).toBe('Real notice')
    expect((await list(adminA, aId)).some(x => x.title === 'Fake urgent notice')).toBe(false)
  })

  test('2. Another school\'s admin cannot post to, edit or delete this school\'s notices', async () => {
    expect((await post(adminB, { title: 'Cross-school post' })).status).toBe(403)      // body says school A, login is school B
    const real = (await list(adminA, aId)).find(x => x.title === 'Real notice')!
    expect((await api(`/api/announcements/${real.id}`, 'PATCH', { title: 'Hacked by B' }, adminB)).status).toBe(403)
    expect((await api(`/api/announcements/${real.id}`, 'DELETE', undefined, adminB)).status).toBe(403)
    expect((await list(adminA, aId)).find(x => x.id === real.id)?.title).toBe('Real notice')
    expect((await api(`/api/announcements?school_id=${aId}`, 'GET', undefined, adminB)).status).toBe(403)   // reading is scoped too
  })

  test('3. Admin publishes; the author is the signed-in user, not something the client claims', async () => {
    const { status, data } = await post(adminA, { title: 'Republic Day', content: 'School closed', announcement_type: 'event', created_by_name: 'Somebody Else' })
    expect(status).toBe(201)
    const n = data as Ann
    expect(n).toMatchObject({ title: 'Republic Day', announcement_type: 'event', priority: 'normal', target_audience: 'all' })
    expect(n.created_by_name).toBe(aName)
  })

  test('4. Bad input is refused', async () => {
    expect((await post(adminA, { title: '   ' })).status).toBe(400)
    expect((await post(adminA, { content: '' })).status).toBe(400)
    expect((await post(adminA, { announcement_type: 'gossip' })).status).toBe(400)
    expect((await post(adminA, { priority: 'panic' })).status).toBe(400)
    expect((await post(adminA, { target_audience: 'teachers,aliens' })).status).toBe(400)
    expect((await post(adminA, { title: 'x'.repeat(201) })).status).toBe(400)
    expect((await post(adminA, { expires_at: '31/01/2030' })).status).toBe(400)
    expect((await api('/api/announcements', 'POST', 'not json', adminA)).status).toBe(400)
  })

  test('5. Audiences: each portal sees only its own notices; all three selected is stored as "all"', async () => {
    const t = (await post(adminA, { title: 'Staff meeting', target_audience: 'teachers' })).data as Ann
    const s = (await post(adminA, { title: 'Exam tips', target_audience: 'students' })).data as Ann
    const p = (await post(adminA, { title: 'PTM slots', target_audience: 'parents,teachers' })).data as Ann
    const every = (await post(adminA, { title: 'Everyone', target_audience: 'teachers,students,parents' })).data as Ann
    expect(every.target_audience).toBe('all')
    expect(p.target_audience).toBe('teachers,parents')            // stored in a stable order
    const titles = async (aud: string) => (await list(adminA, aId, aud)).map(x => x.title)
    expect(await titles('teachers')).toEqual(expect.arrayContaining(['Staff meeting', 'PTM slots', 'Everyone']))
    expect(await titles('teachers')).not.toContain('Exam tips')
    expect(await titles('students')).toEqual(expect.arrayContaining(['Exam tips', 'Everyone']))
    expect(await titles('students')).not.toEqual(expect.arrayContaining(['Staff meeting']))
    expect(await titles('parents')).toEqual(expect.arrayContaining(['PTM slots', 'Everyone']))
    expect(await titles('parents')).not.toContain('Staff meeting')
    void t; void s
  })

  test('6. Order: urgent first, then high, then normal', async () => {
    await post(adminA, { title: 'Sort normal' })
    await post(adminA, { title: 'Sort urgent', priority: 'urgent' })
    await post(adminA, { title: 'Sort high', priority: 'high' })
    const all = await list(adminA, aId)
    const idx = (t: string) => all.findIndex(x => x.title === t)
    expect(idx('Sort urgent')).toBeLessThan(idx('Sort high'))
    expect(idx('Sort high')).toBeLessThan(idx('Sort normal'))
  })

  test('7. Expiry uses India time: today is still shown, yesterday is gone', async () => {
    await post(adminA, { title: 'Expires today IST', expires_at: istDate(0) })
    await post(adminA, { title: 'Expired yesterday', expires_at: istDate(-1) })
    await post(adminA, { title: 'Expires tomorrow', expires_at: istDate(1) })
    const titles = (await list(adminA, aId)).map(x => x.title)
    expect(titles).toContain('Expires today IST')
    expect(titles).toContain('Expires tomorrow')
    expect(titles).not.toContain('Expired yesterday')
  })

  test('8. Editing: change fields, clear the expiry, refuse bad or empty changes', async () => {
    const n = (await post(adminA, { title: 'Draft notice', priority: 'normal', expires_at: istDate(2) })).data as Ann
    const edit = await api(`/api/announcements/${n.id}`, 'PATCH', { title: 'Final notice', priority: 'high', target_audience: 'students,parents', expires_at: null }, adminA)
    expect(edit.status).toBe(200)
    expect(edit.data).toMatchObject({ title: 'Final notice', priority: 'high', target_audience: 'students,parents', expires_at: null })
    expect((await api(`/api/announcements/${n.id}`, 'PATCH', { priority: 'panic' }, adminA)).status).toBe(400)
    expect((await api(`/api/announcements/${n.id}`, 'PATCH', {}, adminA)).status).toBe(400)
    expect((await api(`/api/announcements/${n.id}`, 'PATCH', { title: '' }, adminA)).status).toBe(400)
    expect((await api(`/api/announcements/abc`, 'PATCH', { title: 'x' }, adminA)).status).toBe(400)
    expect((await api(`/api/announcements/999999999`, 'PATCH', { title: 'x' }, adminA)).status).toBe(404)
    expect((await list(adminA, aId)).find(x => x.id === n.id)?.title).toBe('Final notice')
  })

  test('9. Delete removes it for everyone', async () => {
    const n = (await post(adminA, { title: 'To delete' })).data as Ann
    expect((await api(`/api/announcements/${n.id}`, 'DELETE', undefined, adminA)).status).toBe(200)
    expect((await list(adminA, aId)).some(x => x.id === n.id)).toBe(false)
    expect((await api(`/api/announcements/${n.id}`, 'DELETE', undefined, adminA)).status).toBe(404)
  })

  test('10. UI: publish, edit and delete from the notice board', async ({ browser }) => {
    test.setTimeout(120000)   // first visit compiles the whole school-admin page in dev
    const ctx = await browser.newContext()
    const [name, value] = adminA.split('=')
    await ctx.addCookies([{ name, value, url: BASE }])
    const page = await ctx.newPage()
    await page.goto(`${BASE}/school-admin`)
    await page.getByText('Announcements', { exact: true }).first().click({ timeout: 90000 })
    await page.getByTestId('ann-tab-create').click({ timeout: 30000 })

    await page.getByTestId('ann-title').fill('UI notice')
    await page.getByTestId('ann-content').fill('Written in the browser')
    await page.getByTestId('ann-audience-teachers').click()
    await page.getByTestId('ann-priority').selectOption('high')
    await page.getByTestId('ann-submit').click()
    const card = page.locator('[data-testid^="ann-card-"]', { hasText: 'UI notice' })
    await expect(card).toBeVisible({ timeout: 30000 })
    await card.click()

    // edit
    await card.locator('[data-testid^="ann-edit-"]').click()
    await expect(page.getByTestId('ann-title')).toHaveValue('UI notice')
    await page.getByTestId('ann-title').fill('UI notice (edited)')
    await page.getByTestId('ann-submit').click()
    const edited = page.locator('[data-testid^="ann-card-"]', { hasText: 'UI notice (edited)' })
    await expect(edited).toBeVisible({ timeout: 30000 })
    const saved = (await list(adminA, aId)).find(x => x.title === 'UI notice (edited)')!
    expect(saved).toMatchObject({ priority: 'high', target_audience: 'teachers', created_by_name: aName })

    // delete (with confirmation)
    await edited.click()
    await edited.locator('[data-testid^="ann-delete-"]').click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.locator('[data-testid^="ann-card-"]', { hasText: 'UI notice (edited)' })).toHaveCount(0)
    expect((await list(adminA, aId)).some(x => x.title === 'UI notice (edited)')).toBe(false)
    await ctx.close()
  })
})
