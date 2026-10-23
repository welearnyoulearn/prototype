import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'
import { dbAvailable, closeDb, latestInviteToken, ageSessions, minutesSinceSeen } from './fixtures/db'

// Per-person school staff login: email-only sign-in, server-side sessions (logout,
// deactivation, idle timeout), invite-by-link, and the "last used account" login card.
// Each APIRequestContext below is its own browser cookie jar, i.e. its own person/computer.

const OWNER_PASS = 'OwnerPass@123'
const STAFF_PASS = 'StaffPass@123'

async function newClient(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE })
}

async function login(ctx: APIRequestContext, email: string, password: string) {
  return ctx.post('/api/auth/login', { data: { email, password } })
}

async function meStatus(ctx: APIRequestContext) {
  return (await ctx.get('/api/auth/me')).status()
}

async function authCookieValue(ctx: APIRequestContext): Promise<string> {
  const c = (await ctx.storageState()).cookies.find(x => x.name === 'wlyl-auth')
  if (!c) throw new Error('No wlyl-auth cookie in this client')
  return c.value
}

/** A client that replays a captured cookie value, as a stolen/copied cookie would. */
async function replayClient(cookieValue: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Cookie: `wlyl-auth=${cookieValue}` } })
}

test.describe.serial('School staff login — per-person accounts & sessions', () => {
  const ts = Date.now()
  const ownerName = 'Test Owner'
  const principalName = 'Priya Principal'
  const principalEmail = `principal${ts}@sessiontest.com`

  let platformCookie: string
  let schoolId: number
  let schoolCode: string
  let ownerEmail: string
  let ownerTempPass: string
  let owner: APIRequestContext

  test.beforeAll(async () => {
    test.setTimeout(120000)
    platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie, {
      name: `Sessions Test School ${ts}`,
      email: `owner${ts}@sessiontest.com`,
      phone: `98765${String(ts).slice(-5)}`,
    })
    schoolId = school.id
    schoolCode = school.school_code
    ownerEmail = school.email
    ownerTempPass = school.temp_password
    await setSubscription(platformCookie, schoolId, 'premium')

    // Owner's first login: temp password → own password → profile (so /school-admin loads).
    owner = await newClient()
    const first = await login(owner, ownerEmail, ownerTempPass)
    expect(first.status()).toBe(200)
    expect((await owner.post('/api/auth/change-password', { data: { newPassword: OWNER_PASS } })).status()).toBe(200)
    expect((await owner.put('/api/auth/profile', { data: { full_name: ownerName, phone: '9000000011' } })).status()).toBe(200)
  })

  test.afterAll(async () => {
    test.setTimeout(240000)
    const cleanup = await newClient()
    await cleanup.delete(`/api/schools/${schoolId}`, { headers: { Cookie: platformCookie } }).catch(() => {})
    await cleanup.dispose()
    await owner.dispose()
    await closeDb()
  })

  test('1. School ID is no longer a login — email only', async () => {
    const ctx = await newClient()
    // Old-style body (identifier) is rejected outright…
    const legacy = await ctx.post('/api/auth/login', { data: { identifier: schoolCode, password: OWNER_PASS } })
    expect(legacy.status()).toBe(400)
    // …and the school code typed into the email field matches nothing.
    const byCode = await login(ctx, schoolCode, OWNER_PASS)
    expect(byCode.status()).toBe(401)
    // The owner's email works.
    expect((await login(ctx, ownerEmail, OWNER_PASS)).status()).toBe(200)
    await ctx.dispose()
  })

  test('2. Login cookie is a browser-session cookie (dies when the browser closes)', async () => {
    const ctx = await newClient()
    const res = await login(ctx, ownerEmail, OWNER_PASS)
    const setCookie = res.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie').map(h => h.value)
    const auth = setCookie.find(c => c.startsWith('wlyl-auth='))
    expect(auth).toBeTruthy()
    expect(auth!).toMatch(/HttpOnly/i)
    expect(auth!).not.toMatch(/max-age|expires/i)
    await ctx.dispose()
  })

  test('3. Logout revokes the session on the server — a copied cookie stops working', async () => {
    const ctx = await newClient()
    await login(ctx, ownerEmail, OWNER_PASS)
    const cookie = await authCookieValue(ctx)

    const stolen = await replayClient(cookie)
    expect(await meStatus(stolen)).toBe(200)

    expect((await ctx.post('/api/auth/logout', { data: {} })).status()).toBe(200)
    expect(await meStatus(ctx)).toBe(401)
    // The server-side session is dead, not just the browser's copy.
    expect(await meStatus(stolen)).toBe(401)
    await ctx.dispose(); await stolen.dispose()
  })

  test('4. Logging in again in the same browser ends the previous session', async () => {
    const ctx = await newClient()
    await login(ctx, ownerEmail, OWNER_PASS)
    const firstCookie = await authCookieValue(ctx)
    const firstReplay = await replayClient(firstCookie)
    expect(await meStatus(firstReplay)).toBe(200)

    await login(ctx, ownerEmail, OWNER_PASS)          // second login, same browser
    expect(await meStatus(ctx)).toBe(200)             // new session works
    expect(await meStatus(firstReplay)).toBe(401)     // old one is gone
    await ctx.dispose(); await firstReplay.dispose()
  })

  test('5. Owner invites a principal — one-time set-password link, no password emailed', async () => {
    test.skip(!dbAvailable(), 'Needs DB access to read the emailed invite token')

    const res = await owner.post('/api/school-admin/staff-accounts', {
      data: { full_name: principalName, email: principalEmail, role: 'principal' },
    })
    expect(res.status()).toBe(201)

    // Nobody knows a password yet — guesses fail.
    const guess = await newClient()
    expect((await login(guess, principalEmail, 'anything-at-all')).status()).toBe(401)
    expect((await login(guess, principalEmail, ownerTempPass)).status()).toBe(401)

    // Link is valid for ~48 hours and works exactly once.
    const { token, hoursLeft } = await latestInviteToken(principalEmail)
    expect(hoursLeft).toBeGreaterThan(47)
    expect(hoursLeft).toBeLessThanOrEqual(48)

    const set = await guess.post('/api/auth/reset-password', { data: { token, newPassword: STAFF_PASS } })
    expect(set.status()).toBe(200)
    const reuse = await guess.post('/api/auth/reset-password', { data: { token, newPassword: 'AnotherPass@123' } })
    expect(reuse.status()).toBe(400)

    // The principal now signs in with their own email + password, under their own name.
    const principal = await newClient()
    const ok = await login(principal, principalEmail, STAFF_PASS)
    expect(ok.status()).toBe(200)
    const body = await ok.json()
    expect(body.role).toBe('principal')
    expect(body.account).toMatchObject({ name: principalName, email: principalEmail })
    const me = await (await principal.get('/api/auth/me')).json()
    expect(me.full_name).toBe(principalName)
    await principal.dispose(); await guess.dispose()
  })

  test('6. Two people, two computers — sessions are independent and each is named', async () => {
    test.skip(!dbAvailable(), 'Depends on the invited principal from the previous test')

    const ownerPc = await newClient()
    const principalPc = await newClient()
    await login(ownerPc, ownerEmail, OWNER_PASS)
    await login(principalPc, principalEmail, STAFF_PASS)

    const ownerMe = await (await ownerPc.get('/api/auth/me')).json()
    const principalMe = await (await principalPc.get('/api/auth/me')).json()
    expect(ownerMe.email).toBe(ownerEmail)
    expect(principalMe.email).toBe(principalEmail)

    // One logging out doesn't touch the other.
    await principalPc.post('/api/auth/logout', { data: {} })
    expect(await meStatus(principalPc)).toBe(401)
    expect(await meStatus(ownerPc)).toBe(200)
    await ownerPc.dispose(); await principalPc.dispose()
  })

  test('7. Idle for 20+ minutes logs the session out', async () => {
    test.skip(!dbAvailable(), 'Needs DB access to age the session')

    const ctx = await newClient()
    await login(ctx, principalEmail, STAFF_PASS)
    expect(await meStatus(ctx)).toBe(200)

    await ageSessions(principalEmail, 19)
    expect(await meStatus(ctx)).toBe(200)   // still inside the window (and this call counts as activity)

    await ageSessions(principalEmail, 21)
    expect(await meStatus(ctx)).toBe(401)   // past the idle limit
    await ctx.dispose()
  })

  test('8. Background polling does not keep an idle session alive; real activity does', async () => {
    test.skip(!dbAvailable(), 'Needs DB access to read the session clock')

    const ctx = await newClient()
    await login(ctx, principalEmail, STAFF_PASS)
    await ageSessions(principalEmail, 15)

    // The passive status check the idle guard polls with must NOT reset the idle clock…
    expect((await ctx.get('/api/auth/session')).status()).toBe(200)
    expect(await minutesSinceSeen(principalEmail)).toBeGreaterThan(14)

    // …and neither must the notification bell's 30s poll.
    await ctx.get(`/api/notifications?recipient_school_id=${schoolId}`)
    expect(await minutesSinceSeen(principalEmail)).toBeGreaterThan(14)

    // The activity heartbeat (user typing/reading) does reset it.
    expect((await ctx.post('/api/auth/session')).status()).toBe(200)
    expect(await minutesSinceSeen(principalEmail)).toBeLessThan(1)
    await ctx.dispose()
  })

  test('9. Deactivating a staff member ends their session immediately', async () => {
    test.skip(!dbAvailable(), 'Depends on the invited principal')

    const principalPc = await newClient()
    await login(principalPc, principalEmail, STAFF_PASS)
    expect(await meStatus(principalPc)).toBe(200)

    const list = await (await owner.get(`/api/school-admin/staff-accounts?school_id=${schoolId}`)).json() as { id: number; email: string }[]
    const principal = list.find(s => s.email === principalEmail)
    expect(principal).toBeTruthy()

    const del = await owner.delete('/api/school-admin/staff-accounts', { data: { id: principal!.id } })
    expect(del.status()).toBe(200)

    expect(await meStatus(principalPc)).toBe(401)                                        // live session is gone
    expect((await login(principalPc, principalEmail, STAFF_PASS)).status()).toBe(403)    // and can't sign back in
    await principalPc.dispose()
  })

  test('10. Setting a new password (invite resend / reset) signs out old sessions', async () => {
    test.skip(!dbAvailable(), 'Needs DB access to read the emailed token')

    // Reactivate, sign in, then have the owner resend the link and the person use it.
    const list = await (await owner.get(`/api/school-admin/staff-accounts?school_id=${schoolId}`)).json() as { id: number; email: string }[]
    const principal = list.find(s => s.email === principalEmail)!
    expect((await owner.patch('/api/school-admin/staff-accounts', { data: { id: principal.id } })).status()).toBe(200)

    const principalPc = await newClient()
    expect((await login(principalPc, principalEmail, STAFF_PASS)).status()).toBe(200)

    expect((await owner.post('/api/school-admin/staff-accounts/resend', { data: { id: principal.id } })).status()).toBe(200)
    const { token } = await latestInviteToken(principalEmail)
    const other = await newClient()
    expect((await other.post('/api/auth/reset-password', { data: { token, newPassword: 'FreshPass@1234' } })).status()).toBe(200)

    expect(await meStatus(principalPc)).toBe(401)
    expect((await login(other, principalEmail, 'FreshPass@1234')).status()).toBe(200)
    await principalPc.dispose(); await other.dispose()
  })

  test('11. Login page shows the last-used account; clicking it still asks for the password', async ({ page }) => {
    test.setTimeout(120000)

    // Sign in through the real form.
    await page.goto('/login?role=school')
    await expect(page.getByTestId('btn-last-used-account')).toHaveCount(0)   // nothing remembered yet
    await page.getByTestId('auth-email-address-input').fill(ownerEmail)
    await page.getByTestId('auth-password-input').fill(OWNER_PASS)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 60000 })

    // Opening the login page while still signed in must NOT sign anyone in or auto-continue,
    // and there is no "you're still signed in as…" shortcut any more.
    await page.goto('/login?role=school')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('existing-session-notice')).toHaveCount(0)
    await expect(page.getByTestId('btn-continue-to-dashboard')).toHaveCount(0)

    // After logout the last-used account is offered by name and email.
    await page.request.post('/api/auth/logout', { data: {} })
    await page.goto('/login?role=school')
    await expect(page.getByTestId('btn-last-used-account')).toBeVisible()
    await expect(page.getByTestId('last-used-name')).toHaveText(ownerName)
    await expect(page.getByTestId('last-used-email')).toHaveText(ownerEmail)
    await expect(page.getByTestId('login-form')).toHaveCount(0)

    // Clicking it asks only for the password (email is fixed), and a wrong one is refused.
    await page.getByTestId('btn-last-used-account').click()
    await expect(page.getByTestId('auth-email-address-input')).toHaveCount(0)
    await page.getByTestId('auth-password-input').fill('definitely-wrong')
    await page.getByTestId('auth-submit-btn').click()
    await expect(page.getByTestId('auth-error-text')).toBeVisible()
    expect(await meStatus(page.request)).toBe(401)   // no session was created

    // The right password gets in.
    await page.getByTestId('auth-password-input').fill(OWNER_PASS)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 60000 })
  })

  test('12. "Use a different account" gives the normal email + password form', async ({ page }) => {
    // Seed the remembered account the way a previous login would have.
    await page.goto('/login?role=school')
    await page.evaluate(([name, email]) => {
      localStorage.setItem('wlyl_last_staff_account', JSON.stringify({ name, email, role: 'school_admin' }))
    }, [ownerName, ownerEmail])
    await page.reload()

    await expect(page.getByTestId('btn-last-used-account')).toBeVisible()
    await page.getByTestId('btn-use-different-account').click()
    await expect(page.getByTestId('login-form')).toBeVisible()
    await expect(page.getByTestId('auth-email-address-input')).toBeVisible()
    await expect(page.getByTestId('auth-email-address-input')).toHaveValue('')
  })

  test('13. Idle guard sends an expired session back to the login page', async ({ page }) => {
    test.skip(!dbAvailable(), 'Needs DB access to age the session')
    test.setTimeout(180000)

    await page.goto('/login?role=school')
    await page.getByTestId('auth-email-address-input').fill(ownerEmail)
    await page.getByTestId('auth-password-input').fill(OWNER_PASS)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 60000 })
    await page.goto('/school-admin')

    await ageSessions(ownerEmail, 30)
    // Coming back to the tab triggers an immediate session check.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForURL(/\/login\?.*reason=timeout/, { timeout: 30000 })
    await expect(page.getByTestId('session-timeout-notice')).toBeVisible()
  })
})
