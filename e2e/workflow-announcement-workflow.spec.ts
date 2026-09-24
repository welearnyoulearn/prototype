/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Announcement workflow (issue #205): class targeting, drafts + scheduling, pinning, seen tracking,
// acknowledgement, translations, archive / deleted + audit trail, greeting cards — as seen by real
// teacher, student and parent logins, and by the admin in the browser.

type Res = { status: number; body: any }
const newCtx = () => pwRequest.newContext({ baseURL: BASE })
async function call(ctx: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, data?: unknown): Promise<Res> {
  const res = await ctx[method](url, data === undefined ? {} : { data })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status(), body }
}

const istDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

test.describe.serial('Announcement workflow — targeting, drafts, seen, acknowledge, cards', () => {
  const ts = Date.now() + 11
  const PASS = 'AnnFlow#2026x'
  let platform = ''
  let schoolId = 0, otherId = 0
  let admin: APIRequestContext, adminOther: APIRequestContext, anon: APIRequestContext
  let raoT: APIRequestContext, khanT: APIRequestContext            // Rao is class teacher of 10-A, Khan teaches nobody
  let ashaS: APIRequestContext, eshaS: APIRequestContext           // Asha 10-A, Esha 9-B
  let ashaP: APIRequestContext, eshaP: APIRequestContext           // their parents
  let ashaStudentId = 0
  const phone = (n: number) => `9${String(ts + n).slice(-9)}`
  const post = (as: APIRequestContext, body: Record<string, unknown>) => call(as, 'post', '/api/announcements', { school_id: schoolId, title: 'T', content: 'C', ...body })
  const titles = async (as: APIRequestContext, qs = '') => ((await call(as, 'get', `/api/announcements?school_id=${schoolId}${qs}`)).body as Array<{ title: string }>).map(x => x.title)

  test.beforeAll(async () => {
    test.setTimeout(240000)
    platform = await platformAdminCookie()
    // fee-management etc. are not needed; the notice board plan feature is (for the browser test)
    const tier = await (await fetch(`${BASE}/api/platform/features?tier=premium`, { headers: { Cookie: platform } })).json() as { enabled?: string[] }
    if (!(tier.enabled ?? []).includes('announcements')) {
      if (process.env.E2E_ENABLE_PLAN_FEATURES !== '1') throw new Error('announcements is off for the premium plan — set E2E_ENABLE_PLAN_FEATURES=1 on a throwaway database')
      const on = await fetch(`${BASE}/api/platform/features`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: platform }, body: JSON.stringify({ assignments: [{ feature_key: 'announcements', tier: 'premium', enabled: true }] }) })
      if (!on.ok) throw new Error(`could not enable announcements: ${on.status}`)
    }

    const school = await createSchool(platform, { name: `Notice Flow ${ts}`, email: `flow${ts}@e2etest.com`, phone: phone(90) })
    schoolId = school.id
    await setSubscription(platform, schoolId, 'premium')
    admin = await newCtx()
    expect((await call(admin, 'post', '/api/auth/login', { email: school.email, password: school.temp_password })).status).toBe(200)
    expect((await call(admin, 'post', '/api/auth/change-password', { newPassword: PASS })).status).toBe(200)
    expect((await call(admin, 'put', '/api/auth/profile', { full_name: `Flow Principal ${ts}`, phone: '9000000041' })).status).toBe(200)

    const other = await createSchool(platform, { name: `Notice Flow Other ${ts}`, email: `flowo${ts}@e2etest.com`, phone: phone(91) })
    otherId = other.id
    await setSubscription(platform, otherId, 'premium')
    adminOther = await newCtx()
    expect((await call(adminOther, 'post', '/api/auth/login', { email: other.email, password: other.temp_password })).status).toBe(200)
    expect((await call(adminOther, 'post', '/api/auth/change-password', { newPassword: PASS })).status).toBe(200)
    anon = await newCtx()

    const mk = async (grade: string, section: string) => (await call(admin, 'post', '/api/classes', { school_id: schoolId, grade, section })).body.id as number
    const c10a = await mk('10', 'A'); await mk('9', 'B'); await mk('8', 'C')

    const tEmail = (n: string) => `${n}${ts}@e2etest.com`
    const bulk = await call(admin, 'post', '/api/teachers/bulk', { school_id: schoolId, teachers: [
      { name: 'Ms Rao', email: tEmail('rao'), phone: phone(11), subject: 'Mathematics', staff_type: 'teaching' },
      { name: 'Mr Khan', email: tEmail('khan'), phone: phone(12), subject: 'Mathematics', staff_type: 'teaching' },
    ] })
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(201)
    const tList = bulk.body.teachers as { id: number }[]
    expect((await call(admin, 'put', `/api/classes/${c10a}`, { class_teacher_id: tList[0].id })).status).toBeLessThan(300)
    const teacherLogin = async (t: { id: number }, email: string) => {
      const reset = await call(admin, 'post', `/api/teachers/${t.id}/reset-credentials`)
      const ctx = await newCtx()
      expect((await call(ctx, 'post', '/api/teacher/auth/login', { email, password: reset.body.temp_password })).status).toBe(200)
      expect((await call(ctx, 'post', '/api/teacher/auth/change-password', { currentPassword: reset.body.temp_password, newPassword: PASS })).status).toBe(200)
      return ctx
    }
    raoT = await teacherLogin(tList[0], tEmail('rao'))
    khanT = await teacherLogin(tList[1], tEmail('khan'))

    const stu = (name: string, grade: string, section: string, roll: number, n: number) => ({
      name, grade, section, school_roll_number: roll,
      parent_name: `Parent of ${name}`, parent_phone: phone(n), parent_email: `p${n}${ts}@e2etest.com`,
    })
    const sb = await call(admin, 'post', '/api/students/bulk', { school_id: schoolId, students: [
      stu('Asha Rao', '10', 'A', 1, 1), stu('Bala Krishna', '10', 'A', 2, 2), stu('Esha Reddy', '9', 'B', 1, 3), stu('Dev Anand', '8', 'C', 1, 4),
    ] })
    expect(sb.status, JSON.stringify(sb.body)).toBe(201)
    const sCred = (name: string) => (sb.body.credentials.students as { name: string; login: string; temp_password: string }[]).find(c => c.name.startsWith(name))!
    const pCred = (n: number) => (sb.body.credentials.parents as { login: string; temp_password: string }[]).find(c => c.login === `p${n}${ts}@e2etest.com`)!
    const studentLogin = async (name: string) => {
      const c = sCred(name); const ctx = await newCtx()
      expect((await call(ctx, 'post', '/api/student/auth/login', { rollNumber: c.login, password: c.temp_password })).status).toBe(200)
      expect((await call(ctx, 'post', '/api/student/auth/change-password', { currentPassword: c.temp_password, newPassword: PASS })).status).toBe(200)
      return ctx
    }
    const parentLogin = async (n: number) => {
      const c = pCred(n); const ctx = await newCtx()
      expect((await call(ctx, 'post', '/api/parent/auth/login', { identifier: c.login, password: c.temp_password })).status).toBe(200)
      expect((await call(ctx, 'post', '/api/parent/auth/change-password', { currentPassword: c.temp_password, newPassword: PASS })).status).toBe(200)
      return ctx
    }
    ashaS = await studentLogin('Asha'); eshaS = await studentLogin('Esha')
    ashaP = await parentLogin(1); eshaP = await parentLogin(3)
    const roster = (await call(admin, 'get', `/api/students?school_id=${schoolId}`)).body as { id: number; name: string }[]
    ashaStudentId = roster.find(s => s.name.startsWith('Asha'))!.id
  })

  test.afterAll(async () => {
    for (const id of [schoolId, otherId]) if (id) await fetch(`${BASE}/api/schools/${id}`, { method: 'DELETE', headers: { Cookie: platform } }).catch(() => {})
  })

  test('1. Notices reach the right classes: parents, students and teachers only see what is addressed to them', async () => {
    await post(admin, { title: 'Parents of grade 10', target_audience: 'parents', target_classes: [{ grade: '10', section: null }] })
    await post(admin, { title: 'Students of 9-B', target_audience: 'students', target_classes: [{ grade: '9', section: 'B' }] })
    await post(admin, { title: 'Teachers of 10-A', target_audience: 'teachers', target_classes: [{ grade: '10', section: 'A' }] })
    await post(admin, { title: 'Everyone whole school' })
    await post(admin, { title: 'Teachers only (all)', target_audience: 'teachers' })

    expect(await titles(ashaP)).toEqual(expect.arrayContaining(['Parents of grade 10', 'Everyone whole school']))
    expect(await titles(eshaP)).not.toContain('Parents of grade 10')            // Esha is in 9-B
    expect(await titles(eshaP)).toContain('Everyone whole school')
    expect(await titles(eshaS)).toContain('Students of 9-B')
    expect(await titles(ashaS)).not.toContain('Students of 9-B')
    expect(await titles(ashaS)).not.toContain('Parents of grade 10')            // wrong role
    expect(await titles(raoT)).toContain('Teachers of 10-A')                    // class teacher of 10-A
    expect(await titles(khanT)).not.toContain('Teachers of 10-A')               // teaches no class
    expect(await titles(khanT)).toContain('Teachers only (all)')
    expect(await titles(ashaP)).not.toContain('Teachers only (all)')
  })

  test('2. "This will reach N people" matches who is actually addressed', async () => {
    const q = (aud: string, classes?: unknown) => call(admin, 'get', `/api/announcements/recipients?school_id=${schoolId}&audience=${aud}${classes ? `&classes=${encodeURIComponent(JSON.stringify(classes))}` : ''}`)
    expect((await q('parents', [{ grade: '10', section: null }])).body).toMatchObject({ parents: 2, students: 0, teachers: 0, total: 2 })
    expect((await q('students,parents', [{ grade: '9', section: 'B' }])).body).toMatchObject({ students: 1, parents: 1, total: 2 })
    expect((await q('teachers', [{ grade: '10', section: 'A' }])).body).toMatchObject({ teachers: 1 })
    expect((await q('all')).body).toMatchObject({ teachers: 2, students: 4, parents: 4, total: 10 })
    expect((await call(admin, 'get', `/api/announcements/recipients?school_id=${schoolId}&audience=aliens`)).status).toBe(400)
    expect((await call(admin, 'get', `/api/announcements/recipients?school_id=${schoolId}&classes=nope`)).status).toBe(400)
    expect((await call(ashaP, 'get', `/api/announcements/recipients?school_id=${schoolId}`)).status).toBe(403)     // staff only
    expect((await call(adminOther, 'get', `/api/announcements/recipients?school_id=${schoolId}`)).status).toBe(403)
  })

  test('3. Drafts and scheduling: hidden from everyone until they go live', async () => {
    const draft = (await post(admin, { title: 'Draft PTM', status: 'draft', target_audience: 'parents' })).body
    expect(draft.status).toBe('draft')
    expect(await titles(admin)).not.toContain('Draft PTM')
    expect(await titles(ashaP)).not.toContain('Draft PTM')
    expect(await titles(admin, '&scope=drafts')).toContain('Draft PTM')
    expect((await call(ashaP, 'post', `/api/announcements/${draft.id}/read`)).status).toBe(404)        // cannot even mark it seen

    const live = await call(admin, 'patch', `/api/announcements/${draft.id}`, { status: 'published' })
    expect(live.status).toBe(200)
    expect(await titles(ashaP)).toContain('Draft PTM')
    expect(await titles(admin, '&scope=drafts')).not.toContain('Draft PTM')

    const later = new Date(Date.now() + 86400000).toISOString()
    const sched = (await post(admin, { title: 'Scheduled tomorrow', publish_at: later, target_audience: 'parents' })).body
    expect(await titles(ashaP)).not.toContain('Scheduled tomorrow')
    expect(await titles(admin)).not.toContain('Scheduled tomorrow')
    expect(await titles(admin, '&scope=scheduled')).toContain('Scheduled tomorrow')
    expect((await call(ashaP, 'post', `/api/announcements/${sched.id}/read`)).status).toBe(404)
    // "publish now" = clear the schedule
    expect((await call(admin, 'patch', `/api/announcements/${sched.id}`, { publish_at: null })).status).toBe(200)
    expect(await titles(ashaP)).toContain('Scheduled tomorrow')
    // a schedule in the past just means now
    const past = (await post(admin, { title: 'Scheduled in the past', publish_at: new Date(Date.now() - 3600000).toISOString() })).body
    expect(past.publish_at).toBeNull()
    expect(await titles(ashaP)).toContain('Scheduled in the past')
  })

  test('4. Pinned notices stay above newer and more urgent ones', async () => {
    await post(admin, { title: 'Pinned normal', pinned: true })
    await post(admin, { title: 'Newest urgent', priority: 'urgent' })
    const t = await titles(ashaP)
    expect(t.indexOf('Pinned normal')).toBeLessThan(t.indexOf('Newest urgent'))
    const pinned = ((await call(ashaP, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ title: string; pinned: boolean }>).find(x => x.title === 'Pinned normal')
    expect(pinned?.pinned).toBe(true)
  })

  test('5. Seen tracking: opening a notice marks it seen, once, and the admin sees who has not', async () => {
    const n = (await post(admin, { title: 'Read me', target_audience: 'parents', target_classes: [{ grade: '10', section: null }] })).body
    const flag = async () => ((await call(ashaP, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ id: number; seen: boolean }>).find(x => x.id === n.id)!.seen
    expect(await flag()).toBe(false)
    expect((await call(ashaP, 'post', `/api/announcements/${n.id}/read`)).status).toBe(200)
    expect((await call(ashaP, 'post', `/api/announcements/${n.id}/read`)).status).toBe(200)     // repeat is fine
    expect(await flag()).toBe(true)

    const st = (await call(admin, 'get', `/api/announcements/${n.id}/stats`)).body
    expect(st.recipients).toBe(2)                                       // Asha's and Bala's parents
    expect(st.seen).toBe(1)
    expect(st.not_seen.map((p: { name: string }) => p.name)).toEqual(['Parent of Bala Krishna'])
    const list = (await call(admin, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ id: number; seen_count: number }>
    expect(list.find(x => x.id === n.id)?.seen_count).toBe(1)

    // not addressed to Esha's parent (9-B) — looks like it does not exist
    expect((await call(eshaP, 'post', `/api/announcements/${n.id}/read`)).status).toBe(404)
    // signed out / staff
    expect((await call(anon, 'post', `/api/announcements/${n.id}/read`)).status).toBe(401)
    expect((await call(admin, 'post', `/api/announcements/${n.id}/read`)).body).toMatchObject({ ok: true, skipped: true })
    // only staff see the reach numbers
    expect((await call(ashaP, 'get', `/api/announcements/${n.id}/stats`)).status).toBe(403)
    expect((await call(adminOther, 'get', `/api/announcements/${n.id}/stats`)).status).toBe(403)
  })

  test('6. Acknowledgement: "I have read this" is counted, and only for notices that ask for it', async () => {
    const n = (await post(admin, { title: 'Consent needed', requires_ack: true, target_audience: 'parents' })).body
    const plain = (await post(admin, { title: 'No ack needed', target_audience: 'parents' })).body
    expect((await call(ashaP, 'post', `/api/announcements/${plain.id}/ack`)).status).toBe(400)
    expect((await call(ashaP, 'post', `/api/announcements/${n.id}/ack`)).status).toBe(200)
    const mine = ((await call(ashaP, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ id: number; seen: boolean; acked: boolean }>).find(x => x.id === n.id)!
    expect(mine).toMatchObject({ seen: true, acked: true })          // acknowledging also marks it seen
    const st = (await call(admin, 'get', `/api/announcements/${n.id}/stats`)).body
    expect(st).toMatchObject({ requires_ack: true, acknowledged: 1, recipients: 4 })
    expect(st.not_acknowledged).toHaveLength(3)
    const other = ((await call(eshaP, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ id: number; acked: boolean }>).find(x => x.id === n.id)!
    expect(other.acked).toBe(false)                                   // Esha's parent has not
    expect((await call(anon, 'post', `/api/announcements/${n.id}/ack`)).status).toBe(401)
  })

  test('7. Templates and greeting cards are stored; Telugu / Hindi versions come back with the notice', async () => {
    const n = await post(admin, {
      title: 'Happy Pongal!', template_key: 'pongal', card_data: { headline: 'Happy Pongal!' }, announcement_type: 'event',
      translations: { te: { title: 'పొంగల్ శుభాకాంక్షలు!', content: 'అందరికీ పొంగల్ శుభాకాంక్షలు' } },
    })
    expect(n.status).toBe(201)
    expect(n.body).toMatchObject({ template_key: 'pongal', card_data: { headline: 'Happy Pongal!' } })
    const seen = ((await call(ashaP, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ title: string; translations: any; template_key: string }>).find(x => x.title === 'Happy Pongal!')!
    expect(seen.template_key).toBe('pongal')
    expect(seen.translations.te.title).toBe('పొంగల్ శుభాకాంక్షలు!')
    expect((await post(admin, { template_key: 'no-such-template' })).status).toBe(400)
    expect((await post(admin, { card_data: { headline: 'x' } })).status).toBe(400)         // card needs a template
    expect((await post(admin, { target_classes: [{ grade: '', section: null }] })).status).toBe(400)
    expect((await post(admin, { publish_at: 'tomorrow-ish' })).status).toBe(400)
    expect((await call(admin, 'get', `/api/announcements?school_id=${schoolId}&scope=nope`)).status).toBe(400)
  })

  test('8. Archive, past notices and the deleted trail (with who did what)', async () => {
    const old = (await post(admin, { title: 'Old news', expires_at: istDate(-1), target_audience: 'parents' })).body
    expect(await titles(ashaP)).not.toContain('Old news')
    expect(await titles(ashaP, '&scope=past')).toContain('Old news')                    // the reader's own archive
    expect(await titles(admin, '&scope=archive')).toContain('Old news')
    expect((await call(ashaP, 'get', `/api/announcements?school_id=${schoolId}&scope=archive`)).status).toBe(400)   // staff-only scope

    const doomed = (await post(admin, { title: 'Delete me', target_audience: 'parents' })).body
    expect((await call(admin, 'delete', `/api/announcements/${doomed.id}`)).status).toBe(200)
    expect(await titles(ashaP)).not.toContain('Delete me')
    expect((await call(ashaP, 'post', `/api/announcements/${doomed.id}/read`)).status).toBe(404)
    expect(await titles(admin, '&scope=deleted')).toContain('Delete me')
    expect(await titles(admin, '&scope=all')).not.toContain('Delete me')
    const st = (await call(admin, 'get', `/api/announcements/${doomed.id}/stats`)).body
    expect(st.history.map((h: { action: string }) => h.action)).toEqual(['deleted', 'created'])
    expect(st.history[0].by_name).toBe(`Flow Principal ${ts}`)
    void old
  })

  test('9. Only this school\'s staff can write; readers and other schools cannot', async () => {
    for (const [who, ctx] of [['teacher', raoT], ['student', ashaS], ['parent', ashaP], ['anon', anon], ['other school admin', adminOther]] as const) {
      expect((await post(ctx, { title: `Fake from ${who}` })).status, who).toBe(403)
    }
    const real = ((await call(admin, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ id: number }>)[0]
    for (const ctx of [raoT, ashaS, ashaP, anon, adminOther]) {
      expect((await call(ctx, 'patch', `/api/announcements/${real.id}`, { title: 'Hacked' })).status).toBe(403)
      expect((await call(ctx, 'delete', `/api/announcements/${real.id}`)).status).toBe(403)
    }
    expect(await titles(admin)).not.toContain('Hacked')
  })

  test('10. UI (admin): pick the Pongal card, target grade 10 parents, see the preview and the reach, publish', async ({ browser }) => {
    test.setTimeout(150000)
    const ctx = await browser.newContext()
    const state = await admin.storageState()
    await ctx.addCookies(state.cookies.map(c => ({ name: c.name, value: c.value, url: BASE })))
    const page = await ctx.newPage()
    await page.goto(`${BASE}/school-admin`)
    await page.getByText('Announcements', { exact: true }).first().click({ timeout: 90000 })
    await page.getByTestId('ann-tab-create').click({ timeout: 30000 })
    await page.getByTestId('ann-template-pongal').click()

    // The preview is the animated greeting card, with the school's name filled in
    await expect(page.getByTestId('ann-preview').getByTestId('greeting-card')).toBeVisible()
    await expect(page.getByTestId('ann-preview').getByTestId('greeting-headline')).toHaveText('Happy Pongal!')
    await expect(page.getByTestId('ann-content')).toHaveValue(new RegExp(`Notice Flow ${ts}`))

    // who gets it
    await page.getByTestId('ann-audience-parents').click()
    await page.getByTestId('ann-grade-10').click()
    await expect(page.getByTestId('ann-recipients')).toContainText('This will reach 2 people', { timeout: 15000 })
    await page.getByTestId('ann-section-10-A').click()             // deselect the only section => the grade is dropped (whole school again)
    await expect(page.getByTestId('ann-recipients')).toContainText('This will reach 4 people', { timeout: 15000 })
    await page.getByTestId('ann-grade-10').click()
    await expect(page.getByTestId('ann-recipients')).toContainText('This will reach 2 people', { timeout: 15000 })

    // "open as recipients see it" is the real card modal
    await page.getByTestId('ann-preview-open').click()
    await expect(page.getByTestId('notice-modal').getByTestId('greeting-card')).toBeVisible()
    await page.getByTestId('notice-close').click()

    await page.getByTestId('ann-headline').fill('Happy Pongal, Class 10 families!')
    await page.getByTestId('ann-submit').click()
    await expect(page.locator('[data-testid^="ann-card-"]', { hasText: 'Happy Pongal!' }).first()).toBeVisible({ timeout: 30000 })
    await ctx.close()

    const list = (await call(admin, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ title: string; template_key: string; card_data: { headline: string }; target_classes: unknown; target_audience: string }>
    const made = list.find(x => x.card_data?.headline === 'Happy Pongal, Class 10 families!')!
    expect(made).toMatchObject({ template_key: 'pongal', target_audience: 'parents', target_classes: [{ grade: '10', section: null }] })
  })

  test('11. UI (parent): the greeting card pops up once, the notice list shows unread, acknowledge works', async ({ browser }) => {
    test.setTimeout(150000)
    // the parent's own notices (Asha's parent is in grade 10)
    const ack = (await post(admin, { title: 'Please confirm the trip', requires_ack: true, target_audience: 'parents', target_classes: [{ grade: '10', section: null }] })).body
    // Earlier tests left other unseen pop-up-worthy notices (urgent ones) — mark them seen so this test is about the two under test
    const pongal = ((await call(ashaP, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ id: number; seen: boolean; card_data: { headline: string } | null }>)
    const pongalId = pongal.find(x => x.card_data?.headline === 'Happy Pongal, Class 10 families!')!.id
    for (const x of pongal) if (!x.seen && x.id !== pongalId && x.id !== ack.id) await call(ashaP, 'post', `/api/announcements/${x.id}/read`)

    const ctx = await browser.newContext()
    const state = await ashaP.storageState()
    await ctx.addCookies(state.cookies.map(c => ({ name: c.name, value: c.value, url: BASE })))
    const page = await ctx.newPage()
    await page.goto(`${BASE}/parent`)

    // Newest first: the notice that needs acknowledging opens by itself and asks for a tap
    const modal = page.getByTestId('notice-modal')
    await expect(modal).toBeVisible({ timeout: 90000 })
    await expect(modal.getByTestId('notice-ack')).toBeVisible()
    await modal.getByTestId('notice-ack').click()
    await expect(modal.getByTestId('notice-acked')).toBeVisible()
    await modal.getByTestId('notice-close').click()

    // then the Pongal greeting card pops up, animated, with the admin's headline
    await expect(modal).toBeVisible()
    await expect(modal.getByTestId('greeting-card')).toBeVisible()
    await expect(modal.getByTestId('greeting-headline')).toHaveText('Happy Pongal, Class 10 families!')
    await modal.getByTestId('notice-close').click()
    await expect(modal).toHaveCount(0)

    // seen / acknowledged are recorded server-side
    const mine = ((await call(ashaP, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ id: number; seen: boolean; acked: boolean; card_data: { headline: string } | null }>)
    expect(mine.find(x => x.id === ack.id)).toMatchObject({ seen: true, acked: true })
    expect(mine.find(x => x.card_data?.headline === 'Happy Pongal, Class 10 families!')?.seen).toBe(true)

    // reload: nothing pops up again, the list is there, search + filters work
    await page.reload()
    await expect(page.getByTestId('notice-center')).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('notice-modal')).toHaveCount(0)
    await page.getByTestId('notice-viewall').click()
    await page.getByTestId('notices-search').fill('confirm the trip')
    await expect(page.getByTestId('notice-panel').getByTestId(`notice-row-${ack.id}`)).toBeVisible()
    await page.getByTestId('notices-search').fill('')
    await page.getByTestId('notices-filter-action').click()
    await expect(page.getByTestId('notice-panel').getByTestId(`notice-row-${ack.id}`)).toHaveCount(0)   // already acknowledged
    await ctx.close()
    void ashaStudentId
  })

  test('12. Admin sees the reach after the parent opened it', async () => {
    const list = (await call(admin, 'get', `/api/announcements?school_id=${schoolId}`)).body as Array<{ id: number; title: string; seen_count: number; ack_count: number }>
    const trip = list.find(x => x.title === 'Please confirm the trip')!
    expect(trip).toMatchObject({ seen_count: 1, ack_count: 1 })
    const st = (await call(admin, 'get', `/api/announcements/${trip.id}/stats`)).body
    expect(st).toMatchObject({ recipients: 2, seen: 1, acknowledged: 1 })
    expect(st.by_role.parents).toMatchObject({ recipients: 2, seen: 1, acked: 1 })
  })
})
