import { test, expect } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Central Year Rollover (issue #199):
//   • Year Rollover is the only place the next year is created and the school moves to it
//   • it is blocked until Fee Management → Year-End is closed (backend 409 + popup)
//   • fee year-end no longer creates years or switches the active year
//   • after rollover: students promoted / graduated, dues carried, whole school on the new year,
//     old fee year can no longer be reopened

async function api(path: string, method: string, body?: object, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function loginSchoolAdmin(identifier: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: identifier, password }), redirect: 'manual',
  })
  const c = (res.headers.getSetCookie?.() ?? []).find(x => x.startsWith('wlyl-auth='))
  if (!c) throw new Error(`Login failed for ${identifier} — status ${res.status}`)
  return c.split(';')[0]
}

// The fee gate only applies to schools whose plan includes Fee Management, and the Year Rollover
// screen needs its own plan feature. A brand-new throwaway database has none configured; set
// E2E_ENABLE_PLAN_FEATURES=1 there (platform-wide setting, so never changed on a shared database).
async function ensureFeaturesOn(platformCookie: string): Promise<void> {
  const tier = await api('/api/platform/features?tier=premium', 'GET', undefined, platformCookie)
  const enabled = (tier.data as { enabled?: string[] }).enabled ?? []
  const missing = ['fee-management', 'year-rollover'].filter(k => !enabled.includes(k))
  if (missing.length === 0) return
  if (process.env.E2E_ENABLE_PLAN_FEATURES !== '1') throw new Error(`${missing.join(', ')} off for the premium plan — set E2E_ENABLE_PLAN_FEATURES=1 on a throwaway database`)
  const on = await api('/api/platform/features', 'POST', { assignments: missing.map(feature_key => ({ feature_key, tier: 'premium', enabled: true })) }, platformCookie)
  if (on.status !== 200) throw new Error(`could not enable ${missing.join(', ')}: ${on.status}`)
}

const GRADES = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

type Readiness = {
  current_year: { id: number; label: string } | null
  next_year: { id: number; label: string } | null
  fee_gate_required: boolean; fee_closed: boolean; rolled_over: boolean; can_run: boolean
}
type Year = { id: number; label: string; is_current: boolean }

async function enroll(schoolId: number, cookie: string, ts: number, name: string, grade: string, roll: number): Promise<number> {
  const { data } = await api('/api/students/bulk', 'POST', {
    school_id: schoolId,
    students: [{ name, grade, section: 'A', school_roll_number: roll, parent_name: `${name} Parent`, parent_phone: `9${String(ts + roll).slice(-9)}` }],
  }, cookie)
  return (data as { students: Array<{ id: number }> }).students[0].id
}

test.describe.serial('Year Rollover — central, gated by fee year-end', () => {
  const ts = Date.now()
  let schoolId = 0, cookie = '', email = '', pass = ''
  let AY = '', AY_NEXT = '', ayId = 0, nextId = 0
  let s9 = 0, s10 = 0, s5 = 0, s8 = 0

  const years = async () => (await api(`/api/academic-years?school_id=${schoolId}`, 'GET', undefined, cookie)).data as Year[]
  const readiness = async () => (await api(`/api/academic-years/rollover?school_id=${schoolId}&readiness=1`, 'GET', undefined, cookie)).data as Readiness
  const rollover = (from: number, to: number, as: string | null = cookie) => api('/api/academic-years/rollover', 'POST', {
    school_id: schoolId, from_year_id: from, to_year_id: to, final_grade: '10', grade_sequence: GRADES,
  }, as ?? undefined)

  test.beforeAll(async () => {
    test.setTimeout(120000)
    const platform = await platformAdminCookie()
    const s = await createSchool(platform, { name: `Rollover School ${ts}`, phone: `9${String(ts).slice(-9)}`, email: `roll${ts}@test.com`, address: '1 Rollover Lane' })
    schoolId = s.id; email = s.email; pass = s.temp_password
    await setSubscription(platform, schoolId, 'premium')
    await ensureFeaturesOn(platform)
    cookie = await loginSchoolAdmin(email, pass)
    await api('/api/auth/profile', 'PUT', { full_name: 'Roll Admin', phone: '9000000088' }, cookie)

    const current = (await years()).find(y => y.is_current)!
    AY = current.label; ayId = current.id
    const start = parseInt(AY.split('-')[0]) + 1
    AY_NEXT = `${start}-${String(start + 1).slice(2)}`

    s9 = await enroll(schoolId, cookie, ts, 'Nine Student', '9', 1)
    s10 = await enroll(schoolId, cookie, ts, 'Ten Student', '10', 1)
    s5 = await enroll(schoolId, cookie, ts, 'Five Student', '5', 1)
    s8 = await enroll(schoolId, cookie, ts, 'Eight Student', '8', 1)   // 8 -> 9 while 9 -> 10, same roll number 1 in each class

    // A monthly fee for grade 9 so the year has unpaid dues to carry
    const cat = (await api('/api/fees/categories', 'POST', { school_id: schoolId, name: 'Tuition', frequency: 'monthly', category_type: 'fixed' }, cookie)).data as { id: number }
    await api('/api/fees/structures', 'POST', { school_id: schoolId, academic_year: AY, structures: [{ fee_category_id: cat.id, grade: '9', amount: 5000, due_day: 10 }] }, cookie)
    await api('/api/fees/generate', 'POST', { school_id: schoolId, academic_year: AY }, cookie)
    await api(`/api/fees/year-end?school_id=${schoolId}&academic_year=${AY}`, 'GET', undefined, cookie).catch(() => {})
  })

  test.afterAll(async () => {
    await api(`/api/schools/${schoolId}`, 'DELETE', undefined, cookie).catch(() => {})
  })

  test('1. Before anything: not ready — no next year, fee year-end open', async () => {
    const r = await readiness()
    expect(r.current_year?.label).toBe(AY)
    expect(r.next_year).toBeNull()
    expect(r.fee_gate_required).toBe(true)
    expect(r.fee_closed).toBe(false)
    expect(r.can_run).toBe(false)
  })

  test('2. Fee year-end cannot create the next year any more (carry needs it to exist)', async () => {
    const { status, data } = await api('/api/fees/year-end', 'POST', {
      action: 'apply', school_id: schoolId, from_year: AY, to_year: AY_NEXT, decisions: [{ student_id: s9, decision: 'carry' }],
    }, cookie)
    expect(status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(data)).toBeTruthy()
    expect((await years()).find(y => y.label === AY_NEXT)).toBeUndefined()
  })

  test('3. Old one-shot fee rollover route is gone (POST)', async () => {
    const { status } = await api('/api/fees/year-rollover', 'POST', { school_id: schoolId, from_year: AY }, cookie)
    expect(status).toBe(405)
    expect((await years()).find(y => y.is_current)?.label).toBe(AY)   // nothing switched
  })

  test('4. Year Rollover creates the next year; readiness sees it', async () => {
    const { status } = await api('/api/academic-years', 'POST', {
      school_id: schoolId, label: AY_NEXT,
      start_date: `${AY_NEXT.slice(0, 4)}-04-01`, end_date: `${parseInt(AY_NEXT.slice(0, 4)) + 1}-03-31`,
    }, cookie)
    expect(status).toBe(201)
    const r = await readiness()
    expect(r.next_year?.label).toBe(AY_NEXT)
    nextId = r.next_year!.id
    expect(r.can_run).toBe(false)         // fee year-end still open
  })

  test('5. The active year cannot be switched by hand once one exists', async () => {
    const set = await api('/api/academic-years', 'POST', {
      school_id: schoolId, label: `${parseInt(AY_NEXT) + 5}-${String(parseInt(AY_NEXT) + 6).slice(2)}`,
      start_date: `${parseInt(AY_NEXT) + 5}-04-01`, end_date: `${parseInt(AY_NEXT) + 6}-03-31`, set_current: true,
    }, cookie)
    expect(set.status).toBe(409)
    const patch = await api(`/api/academic-years?id=${nextId}&school_id=${schoolId}`, 'PATCH', undefined, cookie)
    expect(patch.status).toBe(409)
    expect((await years()).find(y => y.is_current)?.label).toBe(AY)
  })

  test('6. Year creation / switching needs a school-admin login', async () => {
    const anon = await api('/api/academic-years', 'POST', { school_id: schoolId, label: '2098-99', start_date: '2098-04-01', end_date: '2099-03-31' })
    expect(anon.status).toBe(403)
    const anonPatch = await api(`/api/academic-years?id=${nextId}&school_id=${schoolId}`, 'PATCH')
    expect(anonPatch.status).toBe(403)
    const anonReady = await api(`/api/academic-years/rollover?school_id=${schoolId}&readiness=1`, 'GET')
    expect(anonReady.status).toBe(403)
    const anonRoll = await rollover(ayId, nextId, null)
    expect(anonRoll.status).toBe(403)
  })

  test('7. Rollover is BLOCKED while the fee year-end is not closed — nothing changes', async () => {
    const { status, data } = await rollover(ayId, nextId)
    expect(status).toBe(409)
    expect((data as { code: string }).code).toBe('FEES_NOT_CLOSED')
    expect((await years()).find(y => y.is_current)?.label).toBe(AY)
    const groups = (await api(`/api/students/promote?school_id=${schoolId}`, 'GET', undefined, cookie)).data as { groups: Array<{ grade: string; student_count: number }> }
    expect(groups.groups.map(g => g.grade).sort()).toEqual(['10', '5', '8', '9'])
  })

  test('8. Only the year AFTER the current one is accepted as the target', async () => {
    const far = `${parseInt(AY_NEXT) + 3}-${String(parseInt(AY_NEXT) + 4).slice(2)}`
    const created = await api('/api/academic-years', 'POST', {
      school_id: schoolId, label: far, start_date: `${parseInt(AY_NEXT) + 3}-04-01`, end_date: `${parseInt(AY_NEXT) + 4}-03-31`,
    }, cookie)
    expect(created.status).toBe(201)
    const { status } = await rollover(ayId, (created.data as { id: number }).id)
    expect(status).toBe(400)
    expect((await rollover(ayId, ayId)).status).toBe(400)
    expect((await rollover(nextId, ayId)).status).toBe(409)   // "from" is not the current year
  })

  test('9. Fee year-end: carry the dues, then close → ready', async () => {
    const apply = await api('/api/fees/year-end', 'POST', {
      action: 'apply', school_id: schoolId, from_year: AY, to_year: AY_NEXT, decisions: [{ student_id: s9, decision: 'carry' }],
    }, cookie)
    expect(apply.status).toBe(200)
    // Apply may already auto-close when nothing is left open; close explicitly otherwise
    const before = await readiness()
    if (!before.fee_closed) {
      const close = await api('/api/fees/year-end', 'POST', { action: 'close', school_id: schoolId, from_year: AY }, cookie)
      expect(close.status).toBe(200)
    }
    const r = await readiness()
    expect(r.fee_closed).toBe(true)
    expect(r.can_run).toBe(true)
    expect((await years()).find(y => y.is_current)?.label).toBe(AY)   // fee year-end did NOT switch the year
  })

  test('10. Rollover runs: promotes, graduates, switches the whole school to the new year', async () => {
    const { status, data } = await rollover(ayId, nextId)
    expect(status).toBe(200)
    const d = data as { promoted: number; graduated: number; snapshotted: number; roll_numbers_cleared: number }
    expect(d.promoted).toBe(3)       // grade 9 -> 10, grade 8 -> 9, grade 5 -> 6
    expect(d.graduated).toBe(1)      // grade 10
    expect(d.snapshotted).toBe(4)
    expect(d.roll_numbers_cleared).toBe(0)   // roll 1 of grade 9 moves into the graduating grade-10 class, whose roll 1 was freed

    const now = await years()
    expect(now.find(y => y.is_current)?.label).toBe(AY_NEXT)
    const cur = await api(`/api/academic-year/current?school_id=${schoolId}`, 'GET', undefined, cookie)
    expect(JSON.stringify(cur.data)).toContain(AY_NEXT)

    const groups = (await api(`/api/students/promote?school_id=${schoolId}`, 'GET', undefined, cookie)).data as { groups: Array<{ grade: string; student_count: number }> }
    expect(groups.groups.map(g => g.grade).sort()).toEqual(['10', '6', '9'])

    const hist = (await api(`/api/academic-years/rollover?school_id=${schoolId}&student_id=${s9}`, 'GET', undefined, cookie)).data as Array<{ academic_year: string; grade: string; promoted_to_grade: string; school_roll_number: number | null }>
    expect(hist.find(h => h.academic_year === AY)).toMatchObject({ grade: '9', promoted_to_grade: '10' })

    // Roll number 1 chains 8 -> 9 -> 10 without a unique-index clash, and is kept in each new class
    const all = (await api(`/api/students?school_id=${schoolId}`, 'GET', undefined, cookie)).data as Array<{ id: number; grade: string; status: string | null; school_roll_number: number | null }>
    expect(all.find(x => x.id === s9)).toMatchObject({ grade: '10', school_roll_number: 1 })
    expect(all.find(x => x.id === s8)).toMatchObject({ grade: '9', school_roll_number: 1 })
    expect(all.find(x => x.id === s5)).toMatchObject({ grade: '6', school_roll_number: 1 })
    expect(all.find(x => x.id === s10)).toMatchObject({ status: 'graduated', school_roll_number: null })
    // ...and the old roll number is kept in the class history
    expect(hist.find(h => h.academic_year === AY)).toMatchObject({ school_roll_number: 1 })
  })

  test('11. The carried dues are waiting in the new year', async () => {
    const { status, data } = await api(`/api/fees/year-end?school_id=${schoolId}&academic_year=${AY_NEXT}`, 'GET', undefined, cookie)
    expect(status).toBe(200)
    expect((data as { summary: { total_billed: number } }).summary.total_billed).toBeGreaterThan(0)
  })

  test('12. Running it again is refused; the old fee year can no longer be reopened', async () => {
    expect((await rollover(ayId, nextId)).status).toBe(409)
    const reopen = await api('/api/fees/year-end', 'POST', { action: 'reopen', school_id: schoolId, from_year: AY, reason: 'oops' }, cookie)
    expect(reopen.status).toBe(409)
    expect(JSON.stringify(reopen.data)).toContain('rolled over')
    const r = await readiness()
    expect(r.current_year?.label).toBe(AY_NEXT)
    expect(r.fee_closed).toBe(false)     // the NEW year's fee book is open again
  })

  test('13. A school without Fee Management is not gated', async () => {
    const platform = await platformAdminCookie()
    const s = await createSchool(platform, { name: `No Fee School ${ts}`, phone: `8${String(ts).slice(-9)}`, email: `nofee${ts}@test.com`, address: '2 Plain Road' })
    try {
      const c = await loginSchoolAdmin(s.email, s.temp_password)
      await api('/api/auth/profile', 'PUT', { full_name: 'Plain Admin', phone: '9000000077' }, c)
      const ys = (await api(`/api/academic-years?school_id=${s.id}`, 'GET', undefined, c)).data as Year[]
      const cur = ys.find(y => y.is_current)!
      const start = parseInt(cur.label.split('-')[0]) + 1
      const nl = `${start}-${String(start + 1).slice(2)}`
      const made = await api('/api/academic-years', 'POST', { school_id: s.id, label: nl, start_date: `${start}-04-01`, end_date: `${start + 1}-03-31` }, c)
      expect(made.status).toBe(201)
      await enroll(s.id, c, ts, 'Plain Student', '3', 1)
      const ready = (await api(`/api/academic-years/rollover?school_id=${s.id}&readiness=1`, 'GET', undefined, c)).data as Readiness
      expect(ready.fee_gate_required).toBe(false)
      expect(ready.can_run).toBe(true)
      const r = await api('/api/academic-years/rollover', 'POST', {
        school_id: s.id, from_year_id: cur.id, to_year_id: (made.data as { id: number }).id, final_grade: '10', grade_sequence: GRADES,
      }, c)
      expect(r.status).toBe(200)
    } finally {
      await api(`/api/schools/${s.id}`, 'DELETE', undefined, platform).catch(() => {})
    }
  })

  test('14. UI: the popup blocks the rollover until fee year-end is closed', async ({ browser }) => {
    // Fresh school state for the UI: use a second school with fee management on and an open fee year
    const platform = await platformAdminCookie()
    const s = await createSchool(platform, { name: `UI Roll School ${ts}`, phone: `7${String(ts).slice(-9)}`, email: `uiroll${ts}@test.com`, address: '3 UI Street' })
    try {
      await setSubscription(platform, s.id, 'premium')
      const first = await loginSchoolAdmin(s.email, s.temp_password)
      // The browser would otherwise stop on the "set your password" screen
      expect((await api('/api/auth/change-password', 'POST', { newPassword: 'RollUi#2026x' }, first)).status).toBe(200)
      const c = await loginSchoolAdmin(s.email, 'RollUi#2026x')
      await api('/api/auth/profile', 'PUT', { full_name: 'UI Admin', phone: '9000000066' }, c)
      const ys = (await api(`/api/academic-years?school_id=${s.id}`, 'GET', undefined, c)).data as Year[]
      const cur = ys.find(y => y.is_current)!
      const start = parseInt(cur.label.split('-')[0]) + 1
      await api('/api/academic-years', 'POST', { school_id: s.id, label: `${start}-${String(start + 1).slice(2)}`, start_date: `${start}-04-01`, end_date: `${start + 1}-03-31` }, c)
      await enroll(s.id, c, ts, 'UI Student', '4', 1)

      const ctx = await browser.newContext()
      const [name, value] = c.split('=')
      await ctx.addCookies([{ name, value, url: BASE }])
      const page = await ctx.newPage()
      await page.goto(`${BASE}/school-admin`)
      await page.getByText('Year Rollover', { exact: true }).first().click()
      await expect(page.getByTestId('step-fee-year-end')).toBeVisible({ timeout: 30000 })
      await expect(page.getByTestId('fee-gate-banner')).toBeVisible()
      await page.getByTestId('btn-review-rollover').click()
      await expect(page.getByTestId('fee-gate-modal')).toBeVisible()
      await expect(page.getByTestId('fee-gate-modal')).toContainText('Complete the fee year-end first')
      await page.getByTestId('btn-fee-gate-close').click()
      await expect(page.getByTestId('btn-execute-rollover')).toHaveCount(0)
      await ctx.close()
    } finally {
      await api(`/api/schools/${s.id}`, 'DELETE', undefined, platform).catch(() => {})
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Exceptions (issue #201): repeat a year / promote into another section
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial('Year Rollover — repeat a year / change section', () => {
  const ts = Date.now() + 7
  let schoolId = 0, cookie = '', email = '', tempPass = ''
  let AY = '', AY_NEXT = '', ayId = 0, nextId = 0
  let r6 = 0, m6 = 0, p6 = 0, s5 = 0, f10 = 0, g10 = 0

  const roll = (exceptions: unknown, as: string | null = cookie) => api('/api/academic-years/rollover', 'POST', {
    school_id: schoolId, from_year_id: ayId, to_year_id: nextId, final_grade: '10', grade_sequence: GRADES, exceptions,
  }, as ?? undefined)
  const roster = async () => (await api(`/api/students?school_id=${schoolId}`, 'GET', undefined, cookie)).data as Array<{ id: number; grade: string; section: string; status: string | null; school_roll_number: number | null }>

  test.beforeAll(async () => {
    test.setTimeout(120000)
    const platform = await platformAdminCookie()
    const sc = await createSchool(platform, { name: `Exceptions School ${ts}`, phone: `6${String(ts).slice(-9)}`, email: `exc${ts}@test.com`, address: '4 Exception Rd' })
    schoolId = sc.id; email = sc.email; tempPass = sc.temp_password
    await setSubscription(platform, schoolId, 'premium')
    await ensureFeaturesOn(platform)
    const first = await loginSchoolAdmin(email, tempPass)
    expect((await api('/api/auth/change-password', 'POST', { newPassword: 'RollExc#2026x' }, first)).status).toBe(200)
    cookie = await loginSchoolAdmin(email, 'RollExc#2026x')
    await api('/api/auth/profile', 'PUT', { full_name: 'Exc Admin', phone: '9000000055' }, cookie)

    const cur = ((await api(`/api/academic-years?school_id=${schoolId}`, 'GET', undefined, cookie)).data as Year[]).find(y => y.is_current)!
    AY = cur.label; ayId = cur.id
    const start = parseInt(AY) + 1
    AY_NEXT = `${start}-${String(start + 1).slice(2)}`
    const made = await api('/api/academic-years', 'POST', { school_id: schoolId, label: AY_NEXT, start_date: `${start}-04-01`, end_date: `${start + 1}-03-31` }, cookie)
    nextId = (made.data as { id: number }).id

    for (const [grade, section] of [['5', 'A'], ['6', 'A'], ['6', 'B'], ['7', 'A'], ['7', 'B'], ['10', 'A']]) {
      expect((await api('/api/classes', 'POST', { school_id: schoolId, grade, section }, cookie)).status).toBe(201)
    }
    let phone = 0
    const add = async (name: string, grade: string, section: string, rollNo: number) => {
      phone += 1
      const { data } = await api('/api/students/bulk', 'POST', {
        school_id: schoolId,
        students: [{ name, grade, section, school_roll_number: rollNo, parent_name: `${name} P`, parent_phone: `9${String(ts + phone).slice(-9)}` }],
      }, cookie)
      return (data as { students: Array<{ id: number }> }).students[0].id
    }
    s5 = await add('Five A', '5', 'A', 1)      // promotes into 6-A roll 1 — which the repeater keeps
    r6 = await add('Repeater Six', '6', 'A', 1)
    m6 = await add('Mover Six', '6', 'A', 2)
    p6 = await add('Plain Six', '6', 'B', 1)
    f10 = await add('Final Repeater', '10', 'A', 1)
    g10 = await add('Graduate Ten', '10', 'A', 2)
    // The fee year-end has to be closed before any rollover
    expect((await api('/api/fees/year-end', 'POST', { action: 'close', school_id: schoolId, from_year: AY }, cookie)).status).toBe(200)
  })

  test.afterAll(async () => {
    const platform = await platformAdminCookie()
    await api(`/api/schools/${schoolId}`, 'DELETE', undefined, platform).catch(() => {})
  })

  test('E1. Bad exceptions are refused and nothing changes', async () => {
    const before = await roster()
    expect((await roll([{ student_id: 999999999, action: 'repeat' }])).status).toBe(400)              // not this school's student
    expect((await roll([{ student_id: m6, action: 'move', to_section: 'Z' }])).status).toBe(400)     // section does not exist
    expect((await roll([{ student_id: g10, action: 'move', to_section: 'A' }])).status).toBe(400)    // graduating student
    expect((await roll([{ student_id: m6, action: 'jump' }])).status).toBe(400)                      // unknown action
    expect((await roll('nope')).status).toBe(400)                                                    // not a list
    expect((await roll([{ student_id: r6, action: 'repeat' }], null)).status).toBe(403)              // not logged in
    expect(await roster()).toEqual(before)
    const ready = (await api(`/api/academic-years/rollover?school_id=${schoolId}&readiness=1`, 'GET', undefined, cookie)).data as Readiness
    expect(ready.current_year?.label).toBe(AY)
  })

  test('E2. UI: set exceptions per student, search, and see the counts', async ({ browser }) => {
    const ctx = await browser.newContext()
    const [name, value] = cookie.split('=')
    await ctx.addCookies([{ name, value, url: BASE }])
    const page = await ctx.newPage()
    await page.goto(`${BASE}/school-admin`)
    await page.getByText('Year Rollover', { exact: true }).first().click()
    await expect(page.getByTestId('rollover-exceptions')).toBeVisible({ timeout: 30000 })
    await page.getByTestId('exceptions-search').fill('Repeater')
    await expect(page.getByTestId(`exception-row-${r6}`)).toBeVisible()
    await expect(page.getByTestId(`exception-row-${m6}`)).toHaveCount(0)
    await page.getByTestId(`exception-select-${r6}`).selectOption('repeat')
    await page.getByTestId('exceptions-search').fill('Mover')
    await page.getByTestId(`exception-select-${m6}`).selectOption('move:B')
    await page.getByTestId('exceptions-search').fill('')
    await expect(page.getByTestId('exceptions-count')).toHaveText('1 repeat · 1 section change')
    await page.getByTestId('exceptions-changes-only').check()
    await expect(page.getByTestId(`exception-row-${r6}`)).toBeVisible()
    await expect(page.getByTestId(`exception-row-${p6}`)).toHaveCount(0)
    // A graduating student can repeat instead; the choices are Graduates / Repeat
    await page.getByTestId('exceptions-changes-only').uncheck()
    await expect(page.getByTestId(`exception-select-${g10}`).locator('option')).toHaveCount(2)
    await ctx.close()
  })

  test('E3. Rollover with exceptions: repeat stays, move changes section, final-grade repeater stays active', async () => {
    const { status, data } = await roll([
      { student_id: r6, action: 'repeat' },
      { student_id: m6, action: 'move', to_section: 'B' },
      { student_id: f10, action: 'repeat' },
    ])
    expect(status).toBe(200)
    const d = data as { promoted: number; graduated: number; repeated: number; moved: number; snapshotted: number; roll_numbers_cleared: number }
    expect(d).toMatchObject({ promoted: 3, repeated: 2, moved: 1, graduated: 1, snapshotted: 6 })   // s5, m6, p6 promoted; r6, f10 repeat; g10 graduates
    expect(d.roll_numbers_cleared).toBe(1)                                                          // s5's roll 1 is taken in 6-A by the repeater

    const all = await roster()
    const by = (id: number) => all.find(x => x.id === id)!
    expect(by(r6)).toMatchObject({ grade: '6', section: 'A', school_roll_number: 1 })
    expect(by(m6)).toMatchObject({ grade: '7', section: 'B', school_roll_number: 2 })
    expect(by(p6)).toMatchObject({ grade: '7', section: 'B', school_roll_number: 1 })
    expect(by(s5)).toMatchObject({ grade: '6', section: 'A', school_roll_number: null })
    expect(by(f10)).toMatchObject({ grade: '10', section: 'A', school_roll_number: 1 })
    expect(by(f10).status === null || by(f10).status === 'active').toBe(true)
    expect(by(g10).status).toBe('graduated')
    const years = (await api(`/api/academic-years?school_id=${schoolId}`, 'GET', undefined, cookie)).data as Year[]
    expect(years.find(y => y.label === AY_NEXT)?.is_current).toBe(true)
  })

  test('E4. The class history records what happened to each student', async () => {
    type H = { academic_year: string; grade: string; outcome: string; promoted_to_grade: string | null; promoted_to_section: string | null }
    const hist = async (id: number) => ((await api(`/api/academic-years/rollover?school_id=${schoolId}&student_id=${id}`, 'GET', undefined, cookie)).data as H[]).find(h => h.academic_year === AY)!
    expect(await hist(r6)).toMatchObject({ grade: '6', outcome: 'repeated', promoted_to_grade: '6', promoted_to_section: 'A' })
    expect(await hist(m6)).toMatchObject({ grade: '6', outcome: 'moved', promoted_to_grade: '7', promoted_to_section: 'B' })
    expect(await hist(p6)).toMatchObject({ outcome: 'promoted', promoted_to_grade: '7', promoted_to_section: 'B' })
    expect(await hist(g10)).toMatchObject({ outcome: 'graduated', promoted_to_grade: null })
    expect(await hist(f10)).toMatchObject({ outcome: 'repeated', promoted_to_grade: '10' })
  })
})
