import { test, expect } from '@playwright/test'

// Guard rails for the Feedback API that need no seeded data and write
// nothing: public routes reject unknown codes and malformed payloads, and
// every admin route refuses callers without a school-staff session.
// (The full signed-in flow lives in workflow-feedback-management.spec.ts.)

// Real codes come from generateFeedbackCode() (letters/digits only), so a
// code containing dashes can never exist.
const UNKNOWN_CODE = 'NO-SUCH-CODE'

test.describe('Feedback — public routes', () => {
  test('resolve: unknown or missing code is 404 not_found', async ({ request }) => {
    for (const url of [`/api/feedback/resolve?code=${UNKNOWN_CODE}`, '/api/feedback/resolve']) {
      const res = await request.get(url)
      expect(res.status(), url).toBe(404)
      expect((await res.json()).error).toBe('not_found')
    }
  })

  test('submit: malformed payload is 400', async ({ request }) => {
    const res = await request.post('/api/feedback/submit', { data: { code: '', role: 'alien', is_anonymous: 'yes' } })
    expect(res.status()).toBe(400)
  })

  test('submit: neither ratings nor a form is 400', async ({ request }) => {
    const res = await request.post('/api/feedback/submit', { data: { code: UNKNOWN_CODE, role: 'parent', is_anonymous: true } })
    expect(res.status()).toBe(400)
  })

  test('submit: ratings and a form together is 400', async ({ request }) => {
    const res = await request.post('/api/feedback/submit', {
      data: {
        code: UNKNOWN_CODE, role: 'parent', is_anonymous: true,
        ratings: [{ category_key: 'food', rating: 4 }],
        advanced_form_type: 'meeting', advanced_form_data: { reason: 'x' },
      },
    })
    expect(res.status()).toBe(400)
  })

  test('submit: well-formed payload for an unknown code is 404', async ({ request }) => {
    const res = await request.post('/api/feedback/submit', {
      data: { code: UNKNOWN_CODE, role: 'parent', is_anonymous: true, ratings: [{ category_key: 'food', rating: 4 }] },
    })
    expect(res.status()).toBe(404)
  })

  test('submit: new PTM / staff-meeting form types pass validation (404 only because the code is unknown)', async ({ request }) => {
    for (const type of ['ptm', 'staff_meeting']) {
      const res = await request.post('/api/feedback/submit', {
        data: { code: UNKNOWN_CODE, role: 'parent', is_anonymous: true, advanced_form_type: type, advanced_form_data: { usefulness: 'Useful' } },
      })
      expect(res.status(), type).toBe(404)
    }
  })

  test('voice-upload-url: unsupported audio format is 400', async ({ request }) => {
    const res = await request.post('/api/feedback/voice-upload-url', { data: { code: UNKNOWN_CODE, content_type: 'audio/wav' } })
    expect(res.status()).toBe(400)
  })

  test('voice-upload-url: iOS audio/mp4 is accepted by validation (404 only because the code is unknown)', async ({ request }) => {
    const res = await request.post('/api/feedback/voice-upload-url', { data: { code: UNKNOWN_CODE, content_type: 'audio/mp4' } })
    expect(res.status()).toBe(404)
  })
})

test.describe('Feedback — admin routes refuse callers without a session', () => {
  const school = 'school_id=1'

  test('reads are 401', async ({ request }) => {
    for (const url of [
      `/api/feedback/qr-points?${school}`,
      `/api/feedback/stats?${school}&period=7d`,
      `/api/feedback/submissions?${school}&source=general`,
      `/api/feedback/issues?${school}&status=open`,
      `/api/feedback/categories?${school}`,
      `/api/feedback/settings?${school}`,
      `/api/feedback/export?${school}&source=all`,
      `/api/feedback/archive?${school}&source=archived`,
      `/api/feedback/qr?${school}`,
    ]) {
      const res = await request.get(url)
      expect(res.status(), url).toBe(401)
    }
  })

  test('writes are 401', async ({ request }) => {
    const cases: [string, string, Record<string, unknown>][] = [
      ['post', '/api/feedback/qr-points', { school_id: 1, kind: 'event', title: 'X', form_type: 'rating', roles: ['parent'] }],
      ['post', '/api/feedback/archive', { school_id: 1, action: 'archive', source: 'general' }],
      ['patch', '/api/feedback/settings', { school_id: 1, poster_quote: 'Hello' }],
      ['post', '/api/feedback/settings/regenerate-code', { school_id: 1 }],
      ['post', '/api/feedback/categories', { school_id: 1, role: 'parent', key: 'x', label: 'X' }],
    ]
    for (const [method, url, data] of cases) {
      const res = await request.fetch(url, { method, data })
      expect(res.status(), `${method} ${url}`).toBe(401)
    }
  })

  test('per-record routes are 401 or 404 — never a success', async ({ request }) => {
    // They look the record up first (404 if absent) and then check the caller.
    const cases: [string, string, Record<string, unknown> | undefined][] = [
      ['patch', '/api/feedback/qr-points/1', { is_active: true }],
      ['delete', '/api/feedback/qr-points/1', undefined],
      ['get', '/api/feedback/submissions/1', undefined],
      ['patch', '/api/feedback/issues/1', { status: 'resolved' }],
      ['get', '/api/feedback/voice/1', undefined],
    ]
    for (const [method, url, data] of cases) {
      const res = await request.fetch(url, { method, data })
      expect([401, 404], `${method} ${url}`).toContain(res.status())
    }
  })

  test('invalid archive request is rejected before touching data', async ({ request }) => {
    const res = await request.post('/api/feedback/archive', { data: { school_id: 1, action: 'wipe-everything', source: 'general' } })
    expect(res.status()).toBe(400)
  })
})
