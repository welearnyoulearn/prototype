import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStudentId, generateUniqueStudentIds } from './studentOnboarding'

// studentOnboarding imports the DB pool lazily at call time only; these tests never query it.

const FORMAT = /^WLYL-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/

test('system ID is WLYL- plus 8 characters from the unambiguous alphabet (13 chars)', () => {
  for (let i = 0; i < 2000; i++) {
    const id = generateStudentId()
    assert.match(id, FORMAT)
    assert.equal(id.length, 13)
  }
})

test('system ID never contains look-alike characters (I, L, O, 0, 1)', () => {
  for (let i = 0; i < 2000; i++) assert.doesNotMatch(generateStudentId().slice(5), /[ILO01]/)
})

test('a large batch has no duplicates', async () => {
  const none = { query: async () => ({ rows: [] }) }
  const ids = await generateUniqueStudentIds(none, 5000)
  assert.equal(ids.length, 5000)
  assert.equal(new Set(ids.map(i => i.toLowerCase())).size, 5000)
})

test('ids that already exist in the database are regenerated', async () => {
  // Pretend every id starting with WLYL-A is taken (roughly 1 in 31 candidates).
  let calls = 0
  const db = {
    query: async (_sql: string, params: unknown[]) => {
      calls++
      const candidates = params[0] as string[]
      return { rows: candidates.filter(c => c.startsWith('wlyl-a')).map(id => ({ id })) }
    },
  }
  const ids = await generateUniqueStudentIds(db, 300)
  assert.equal(ids.length, 300)
  assert.equal(ids.filter(i => i.startsWith('WLYL-A')).length, 0)
  assert.equal(new Set(ids).size, 300)
  assert.ok(calls >= 2, 'at least one collision round was needed')
})

test('gives up with an error instead of returning a colliding id', async () => {
  const everythingTaken = { query: async (_s: string, p: unknown[]) => ({ rows: (p[0] as string[]).map(id => ({ id })) }) }
  await assert.rejects(() => generateUniqueStudentIds(everythingTaken, 3), /unique student ids/)
})
