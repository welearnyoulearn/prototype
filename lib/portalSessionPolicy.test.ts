import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MOBILE_SESSION_DAYS,
  SESSION_IDLE_MINUTES,
  SESSION_MAX_HOURS,
  isMobileClient,
  parentLoginChanged,
  parentSessionLimits,
} from './portalSessionPolicy'

test('web parents keep the short session: 20 min idle, 12 h cap, browser-session cookie', () => {
  for (const mobile of [undefined, false]) {
    assert.deepEqual(parentSessionLimits(mobile), {
      idleMinutes: SESSION_IDLE_MINUTES,
      maxHours: SESSION_MAX_HOURS,
      cookieMaxAgeSeconds: null,
    })
  }
  assert.equal(SESSION_IDLE_MINUTES, 20)
  assert.equal(SESSION_MAX_HOURS, 12)
})

test('mobile parents stay signed in for life: 50 years, persistent cookie, no short idle timeout', () => {
  const limits = parentSessionLimits(true)
  assert.ok(MOBILE_SESSION_DAYS >= 50 * 365)
  assert.ok(limits.cookieMaxAgeSeconds! < 2 ** 31)
  assert.equal(limits.idleMinutes, MOBILE_SESSION_DAYS * 24 * 60)
  assert.equal(limits.maxHours, MOBILE_SESSION_DAYS * 24)
  assert.equal(limits.cookieMaxAgeSeconds, MOBILE_SESSION_DAYS * 24 * 60 * 60)
  assert.ok(limits.idleMinutes > SESSION_IDLE_MINUTES * 1000)
  // The cookie must outlive the session row, otherwise the phone would drop it first.
  assert.ok(limits.cookieMaxAgeSeconds! >= limits.maxHours * 3600)
})

test('only the exact "mobile" client header value opts in', () => {
  assert.equal(isMobileClient('mobile'), true)
  for (const v of [null, '', 'Mobile', 'web', 'true', '1', 'mobile ']) assert.equal(isMobileClient(v), false)
})

test('a new parent email or phone changes the login; the name or the same values do not', () => {
  const current = { email: 'old@example.com', phone: '9000000001' }
  const fields = (entries: Record<string, unknown>) => Object.entries(entries)
  assert.equal(parentLoginChanged(current, fields({ parent_email: 'new@example.com' })), true)
  assert.equal(parentLoginChanged(current, fields({ parent_phone: '9000000002' })), true)
  assert.equal(parentLoginChanged(current, fields({ parent_email: null })), true)
  assert.equal(parentLoginChanged(current, fields({ parent_name: 'New Name' })), false)
  assert.equal(parentLoginChanged(current, fields({ parent_email: 'old@example.com', parent_phone: '9000000001' })), false)
  assert.equal(parentLoginChanged({ email: null, phone: null }, fields({ parent_email: null })), false)
})
