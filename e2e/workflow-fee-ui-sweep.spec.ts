import { test, expect, type Page } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Opens every Fee Management tab (desktop and phone width) and fails on page errors, server errors,
// failed fee API calls, or a page that scrolls sideways.

const yr = new Date().getFullYear()
const YEAR = `${yr}-${String(yr + 1).slice(2)}`
const TABS = ['overview', 'setup', 'collect', 'students', 'reports', 'yearend', 'archive', 'leavers']

let cookie = ''
let sid = 0
const call = async (path: string, method = 'GET', body?: object) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: cookie }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, data: await r.json().catch(() => null) }
}

test.describe.configure({ mode: 'serial', timeout: 120000 })

test.beforeAll(async () => {
  test.setTimeout(180000)
  const pc = await platformAdminCookie()
  const s = await createSchool(pc, { name: `E2E Fee UI ${Date.now()}`, phone: `9${String(Date.now()).slice(-9)}`, email: `feeui${Date.now()}@test.com` })
  sid = s.id
  await setSubscription(pc, sid, 'premium')
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: s.email, password: s.temp_password }), redirect: 'manual' })
  cookie = ((res.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-auth=')) ?? '').split(';')[0]
  await call('/api/academic-years', 'POST', { school_id: sid, label: YEAR, start_date: `${yr}-04-01`, end_date: `${yr + 1}-03-31` })
  const en = await call('/api/students/bulk', 'POST', { school_id: sid, students: [1, 2, 3].map(i => ({ name: `UI Student ${"ABC"[i - 1]}`, grade: '5', section: 'A', school_roll_number: i, parent_name: 'P', parent_phone: `9${String(Date.now()).slice(-7)}0${i}` })) })
  expect(en.status, JSON.stringify(en.data).slice(0, 300)).toBe(201)
  const cat = await call('/api/fees/categories', 'POST', { school_id: sid, name: 'Tuition', frequency: 'monthly', category_type: 'fixed' })
  await call('/api/fees/structures', 'POST', { school_id: sid, academic_year: YEAR, structures: [{ fee_category_id: cat.data.id, grade: '5', amount: 1000, due_day: 10 }] })
  await call('/api/fees/generate', 'POST', { school_id: sid, academic_year: YEAR })
  const led = await call(`/api/fees/ledger?school_id=${sid}&academic_year=${YEAR}`)
  const rows = Array.isArray(led.data) ? led.data : led.data.rows ?? led.data.ledger
  await call('/api/fees/payments', 'POST', { school_id: sid, ledger_id: rows[0].id, amount: 400, payment_mode: 'cash', paid_date: new Date().toISOString().slice(0, 10) })
})

async function open(page: Page) {
  await page.context().addCookies([{ name: 'wlyl-auth', value: cookie.split('=')[1], url: BASE }])
  await page.goto(`${BASE}/school-admin`)
  await page.getByText('Fee Management', { exact: false }).first().click()
  await expect(page.getByTestId('tab-overview')).toBeVisible({ timeout: 30000 })
}

for (const [label, size] of [['desktop', { width: 1366, height: 800 }], ['phone', { width: 390, height: 800 }]] as const) {
  test(`FEEUI-${label} every tab opens cleanly`, async ({ page }) => {
    await page.setViewportSize(size)
    const problems: string[] = []
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0, 160)}`) })
    page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400 && r.status() !== 401) problems.push(`${r.status()} ${r.url().replace(BASE, '')}`) })
    await open(page)
    for (const t of TABS) {
      await page.getByTestId(`tab-${t}`).click()
      await page.waitForTimeout(1200)
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (sideways > 4) problems.push(`${label}: tab ${t} scrolls sideways by ${sideways}px`)
    }
    expect(problems).toEqual([])
  })
}

test('FEEUI-closegate selected-but-unapplied decisions are called out when closing', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 })
  await open(page)
  await page.getByTestId('tab-yearend').click()
  const carry = page.locator('[data-testid^="btn-yearend-decision-carry-"]').first()
  await expect(carry).toBeVisible({ timeout: 30000 })
  await page.getByTestId('btn-close-year').click()
  await expect(page.getByTestId('close-gate')).toBeVisible()
  await expect(page.getByTestId('close-gate-unapplied')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel' }).last().click()
  await carry.click()
  await page.getByTestId('btn-close-year').click()
  await expect(page.getByTestId('close-gate-unapplied')).toContainText('has not been applied')
  await expect(page.getByTestId('close-gate')).toContainText('carry selected, not applied')
})
