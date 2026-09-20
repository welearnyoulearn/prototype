import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool } from './fixtures/platform-admin'
import {
  dbAvailable, closeDb, enableParentPortal, seedParent, plantCode, ageChallenges,
  challengeCount, latestChallenge, cleanup,
} from './fixtures/parent-otp-db'

// End-to-end parent WhatsApp-OTP password reset against a real server + database.
// WhatsApp itself is not involved: with no WHATSAPP_* env vars the dev server just logs
// the code, and this spec plants a known code straight into the challenge row.
//
// NEEDS a database it may write to (it creates a school + parent and deletes them again),
// so it is skipped when no DB env vars are present. Do not point it at production.

const OLD_PASS = 'OldPassw0rd!'
const NEW_PASS = 'BrandNewPass9!'

test.describe.serial('Parent password reset via WhatsApp OTP', () => {
  const ts = Date.now()
  // Deliberately messy legacy storage; the parent then types it differently again.
  const national = `7${String(ts).slice(-9)}`                      // 10 digits, starts with 7
  const stored = `+91 ${national.slice(0, 5)}-${national.slice(5)}`
  const phone = `91${national}`                                    // canonical form used by the API
  const unregistered = `916${String(ts).slice(-9)}`

  let api: APIRequestContext
  let platformCookie: string
  let schoolId: number

  const send = (p: string) => api.post('/api/parent/auth/otp/send', { data: { phone: p } })
  const verify = (p: string, code: string) => api.post('/api/parent/auth/otp/verify', { data: { phone: p, code } })
  const reset = (token: string, pw: string, confirm = pw) =>
    api.post('/api/parent/auth/otp/reset', { data: { token, newPassword: pw, confirmPassword: confirm } })
  const login = async (identifier: string, password: string) => {
    const c = await pwRequest.newContext({ baseURL: BASE })
    const res = await c.post('/api/parent/auth/login', { data: { identifier, password } })
    await c.dispose()
    return res.status()
  }

  test.beforeAll(async () => {
    test.skip(!dbAvailable(), 'Needs a database it may write to')
    test.setTimeout(120000)
    api = await pwRequest.newContext({ baseURL: BASE })
    platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie, { name: `Parent OTP Test School ${ts}` })
    schoolId = school.id
    await enableParentPortal(schoolId)
    await seedParent(schoolId, stored, OLD_PASS)
  })

  test.afterAll(async () => {
    await cleanup(phone).catch(() => {})
    await cleanup(unregistered).catch(() => {})
    if (platformCookie) await api.delete(`/api/schools/${schoolId}`, { headers: { Cookie: platformCookie } }).catch(() => {})
    await api?.dispose()
    await closeDb()
  })

  test('1. Parent can still sign in with their phone typed in any format', async () => {
    expect(await login(national, OLD_PASS)).toBe(200)
    expect(await login(`+91 ${national.slice(0, 5)} ${national.slice(5)}`, OLD_PASS)).toBe(200)
    expect(await login(national, 'wrong-password')).toBe(401)
  })

  test('2. Registered and unregistered numbers get identical responses', async () => {
    const registered = await send(national)
    const unknown = await send(unregistered.slice(2))
    expect(registered.status()).toBe(200)
    expect(unknown.status()).toBe(200)
    const a = await registered.json(); const b = await unknown.json()
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
    expect(a.resendAfter).toBe(b.resendAfter)

    // Only the registered number got a message queued for it.
    expect((await latestChallenge(phone))!.parent_ids.length).toBe(1)
    expect((await latestChallenge(unregistered))!.parent_ids.length).toBe(0)
  })

  test('3. Invalid numbers are refused with a clear message', async () => {
    for (const bad of ['5876543210', '12345', '+1 415 555 2671', 'abcdefghij']) {
      const res = await send(bad)
      expect(res.status(), bad).toBe(400)
      expect((await res.json()).error).toContain('10-digit Indian mobile')
    }
  })

  test('4. Resend is rate-limited (30 s cooldown, then 3 per hour)', async () => {
    const tooSoon = await send(national)
    expect(tooSoon.status()).toBe(429)
    expect((await tooSoon.json()).retryAfter).toBeGreaterThan(0)

    await ageChallenges(phone, 60)
    expect((await send(national)).status()).toBe(200)   // 2nd in the hour
    await ageChallenges(phone, 60)
    expect((await send(national)).status()).toBe(200)   // 3rd
    await ageChallenges(phone, 60)
    const fourth = await send(national)
    expect(fourth.status()).toBe(429)                    // 4th in an hour
    expect((await fourth.json()).error).toContain('Too many')
  })

  test('5. Wrong codes count down and then lock the challenge', async () => {
    await plantCode(phone, '482913')
    for (let left = 4; left >= 1; left--) {
      const res = await verify(national, '000000')
      expect(res.status()).toBe(400)
      expect((await res.json()).attemptsLeft).toBe(left)
    }
    const last = await verify(national, '000000')
    expect((await last.json()).reason).toBe('locked')
    // Even the right code no longer works once locked.
    const afterLock = await verify(national, '482913')
    expect(afterLock.status()).toBe(400)
    expect((await afterLock.json()).reason).toBe('locked')
  })

  test('6. Expired codes are refused', async () => {
    await ageChallenges(phone, 3600)                        // a fresh, unlocked request…
    expect((await send(national)).status()).toBe(200)
    await plantCode(phone, '135790')
    // …then age it past the 5-minute lifetime.
    await ageChallenges(phone, 6 * 60)
    const res = await verify(national, '135790')
    expect(res.status()).toBe(400)
    expect((await res.json()).reason).toBe('expired')
  })

  test('7. Full reset: correct code → new password → old one dead, code and ticket single-use', async () => {
    await ageChallenges(phone, 7200)
    expect((await send(national)).status()).toBe(200)
    await plantCode(phone, '246810')

    const ok = await verify(`+91 ${national}`, '246810')  // phone typed with a prefix this time
    expect(ok.status()).toBe(200)
    const { resetToken } = await ok.json()
    expect(resetToken).toBeTruthy()
    expect((await latestChallenge(phone))!.consumed_at).not.toBeNull()

    // The code can't be replayed.
    expect((await verify(national, '246810')).status()).toBe(400)

    // Validation on the last step.
    expect((await reset(resetToken, 'short1')).status()).toBe(400)
    expect((await reset(resetToken, NEW_PASS, 'DifferentPass9!')).status()).toBe(400)
    // A garbage token does nothing.
    expect((await reset('z'.repeat(48), NEW_PASS)).status()).toBe(400)

    const done = await reset(resetToken, NEW_PASS)
    expect(done.status()).toBe(200)

    // The ticket is single-use.
    expect((await reset(resetToken, 'AnotherPass9!')).status()).toBe(400)

    // Old password gone, new one works — in whichever format the phone is typed.
    expect(await login(national, OLD_PASS)).toBe(401)
    expect(await login(national, NEW_PASS)).toBe(200)
    expect(await login(`+91 ${national.slice(0, 5)}-${national.slice(5)}`, NEW_PASS)).toBe(200)
  })

  test('8. Codes are stored only as a 64-character hash', async () => {
    const row = await latestChallenge(phone)
    expect(row!.code_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await challengeCount(phone)).toBeGreaterThan(0)
  })
})
