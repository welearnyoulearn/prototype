import test from 'node:test'
import assert from 'node:assert/strict'
import { isCrossSiteAuthMutation, parseTrustedOrigins, type CrossSiteInput } from './crossSite'

const trusted = parseTrustedOrigins('https://parent.example.com/, http://localhost:3002 ,not a url,ftp://x.example.com,')
const base: CrossSiteInput = {
  method: 'POST', pathname: '/api/parent/auth/login', secFetchSite: 'same-origin',
  origin: 'https://www.welearnyoulearn.com', host: 'www.welearnyoulearn.com', trustedOrigins: trusted,
}
const check = (over: Partial<CrossSiteInput>) => isCrossSiteAuthMutation({ ...base, ...over })

test('TRUSTED_APP_ORIGINS keeps only valid http(s) origins, normalised', () => {
  assert.deepEqual([...trusted].sort(), ['http://localhost:3002', 'https://parent.example.com'])
  assert.equal(parseTrustedOrigins(undefined).size, 0)
  assert.equal(parseTrustedOrigins('').size, 0)
})

test('a login from the platform\'s own site is allowed', () => {
  assert.equal(check({}), false)
})

test('a login posted from another site is refused, whatever the platform trusts', () => {
  assert.equal(check({ origin: 'https://evil.example.com', secFetchSite: 'cross-site' }), true)
  assert.equal(check({ origin: 'https://evil.example.com', secFetchSite: 'same-origin' }), true)
  assert.equal(check({ origin: 'https://parent.example.com.evil.com' }), true)
  assert.equal(check({ origin: 'http://parent.example.com' }), true) // same host, different scheme: not the trusted origin
})

test('the parent app\'s own origin is trusted, even though its host differs from ours', () => {
  assert.equal(check({ origin: 'https://parent.example.com' }), false)
  assert.equal(check({ origin: 'https://parent.example.com', secFetchSite: 'cross-site' }), false)
  assert.equal(check({ origin: 'http://localhost:3002' }), false)
})

test('with nothing trusted, the parent app origin is refused (the pre-allow-list behaviour)', () => {
  assert.equal(check({ origin: 'https://parent.example.com', trustedOrigins: new Set() }), true)
})

test('requests with no Origin (curl, server to server, mobile clients) are allowed', () => {
  assert.equal(check({ origin: null, secFetchSite: null }), false)
})

test('a malformed or opaque Origin is refused', () => {
  assert.equal(check({ origin: 'null' }), true)
  assert.equal(check({ origin: '::::' }), true)
})

test('only mutating requests to auth routes are guarded', () => {
  const evil = { origin: 'https://evil.example.com', secFetchSite: 'cross-site' }
  assert.equal(check({ ...evil, method: 'GET' }), false)
  assert.equal(check({ ...evil, pathname: '/api/exams' }), false)
  assert.equal(check({ ...evil, pathname: '/api/parent/fees' }), false)
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(check({ ...evil, method }), true, method)
  for (const pathname of ['/api/auth/login', '/api/teacher/auth/logout', '/api/student/auth/login', '/api/parent/auth/change-password', '/api/teacher-auth/x']) {
    assert.equal(check({ ...evil, pathname }), true, pathname)
  }
})
