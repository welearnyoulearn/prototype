import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { openTestDb, resetEditions, testDbOpts } from '../newspaperTestDb'
import { buildEditions } from './build'
import { BANK_CATEGORY, bankNote } from './bank'
import { fakeFetch, fakeModel, freshFeed, TEST_FEED_URL, TEST_SOURCES } from './testKit'
import type { ModelRequest } from '../newspaper/model'

const opts = testDbOpts
let pool: Pool
let n = 0

before(async () => { if (!opts.skip) pool = await openTestDb() })
after(async () => { if (pool) await pool.end() })

/** A date no other test uses, and the 04:00 IST instant on which the overnight job would run for it. */
async function freshDay() {
  n += 1
  const date = new Date(Date.UTC(2040, 0, 1 + n + (Date.now() % 300))).toISOString().slice(0, 10)
  await resetEditions(pool, [date])
  return { date, now: new Date(`${date}T04:00:00+05:30`) }
}

const counts = async (date: string) => (await pool.query<{ grade_band: string; source_mode: string; items: number; questions: number; categories: number }>(
  `SELECT e.grade_band, e.source_mode,
          (SELECT COUNT(*)::int FROM news_items i WHERE i.edition_id = e.id) AS items,
          (SELECT COUNT(*)::int FROM news_questions q WHERE q.edition_id = e.id) AS questions,
          (SELECT COUNT(DISTINCT category)::int FROM news_items i WHERE i.edition_id = e.id) AS categories
   FROM news_editions e WHERE e.edition_date = $1 ORDER BY e.grade_band`, [date])).rows

const deps = (now: Date, model = fakeModel(), feed?: string) => ({
  db: pool, model, sources: TEST_SOURCES, now,
  fetchImpl: fakeFetch(feed === undefined ? {} : { [TEST_FEED_URL]: feed }),
})

test('a normal night builds one live edition per grade band: 4 notes, 4 questions, 4 different categories', opts, async () => {
  const { date, now } = await freshDay()
  const report = await buildEditions(deps(now, fakeModel(), freshFeed(6, now)))
  assert.equal(report.date, date)
  assert.deepEqual(report.built.map(b => b.mode), ['live', 'live', 'live'])
  const rows = await counts(date)
  assert.deepEqual(rows.map(r => r.grade_band), ['3-5', '6-8', '9-10'])
  for (const r of rows) assert.deepEqual({ mode: r.source_mode, items: r.items, questions: r.questions, categories: r.categories }, { mode: 'live', items: 4, questions: 4, categories: 4 })
})

test('running it again changes nothing and does not call the model', opts, async () => {
  const { date, now } = await freshDay()
  await buildEditions(deps(now, fakeModel(), freshFeed(6, now)))
  const calls: ModelRequest[] = []
  const again = await buildEditions(deps(now, fakeModel({ calls }), freshFeed(6, now)))
  assert.deepEqual(again.built, [])
  assert.equal(again.alreadyThere.length, 3)
  assert.equal(calls.length, 0)
  assert.equal((await counts(date)).length, 3)
})

test('two builds at the same moment still leave exactly one edition per band', opts, async () => {
  const { date, now } = await freshDay()
  await Promise.all([
    buildEditions(deps(now, fakeModel(), freshFeed(6, now))),
    buildEditions(deps(now, fakeModel(), freshFeed(6, now))),
  ])
  assert.equal((await counts(date)).length, 3)
})

test('feeds down: every band gets the one-note fallback from the reviewed topic bank', opts, async () => {
  const { date, now } = await freshDay()
  const report = await buildEditions(deps(now))
  assert.deepEqual(report.built.map(b => b.mode), ['bank', 'bank', 'bank'])
  assert.match(report.built[0].reason ?? '', /only 0 usable stories/)
  assert.ok(report.feedErrors.length > 0)
  const rows = await counts(date)
  for (const r of rows) assert.deepEqual({ mode: r.source_mode, items: r.items, questions: r.questions }, { mode: 'bank', items: 1, questions: 1 })
  const { rows: [item] } = await pool.query<{ headline: string; category: string }>(
    `SELECT i.headline, i.category FROM news_items i JOIN news_editions e ON e.id = i.edition_id WHERE e.edition_date = $1 LIMIT 1`, [date])
  assert.equal(item.category, BANK_CATEGORY)
  assert.equal(item.headline, bankNote(date).headline)
})

test('the writer being down also falls back, and says why', opts, async () => {
  const { now } = await freshDay()
  const report = await buildEditions(deps(now, fakeModel({ failWriter: true }), freshFeed(6, now)))
  assert.deepEqual(report.built.map(b => b.mode), ['bank', 'bank', 'bank'])
  assert.match(report.built[0].reason ?? '', /writer is down/)
})

test('a checker that cannot run publishes nothing unchecked', opts, async () => {
  const { date, now } = await freshDay()
  const report = await buildEditions(deps(now, fakeModel({ failChecker: true }), freshFeed(6, now)))
  assert.deepEqual(report.built.map(b => b.mode), ['bank', 'bank', 'bank'])
  assert.equal((await counts(date)).every(r => r.items === 1), true)
})

test('notes the checker rejects are left out; three good notes are still a live edition', opts, async () => {
  const { date, now } = await freshDay()
  const verdictFor = (h: string) => (['3', '4', '5'].some(i => h.includes(`idea ${i} `)) ? 'unsupported' : 'ok') as 'ok' | 'unsupported'
  const report = await buildEditions(deps(now, fakeModel({ verdictFor }), freshFeed(6, now)))
  assert.deepEqual(report.built.map(b => `${b.mode}:${b.notes}`), ['live:3', 'live:3', 'live:3'])
  assert.equal(report.built[0].rejected.length, 3)
  assert.ok(report.built[0].rejected[0].includes('unsupported claim'))
  assert.equal((await counts(date))[0].items, 3)
})

test('only two good notes is not enough: the fallback is used instead', opts, async () => {
  const { date, now } = await freshDay()
  const report = await buildEditions(deps(now, fakeModel({ verdictFor: h => (h.includes('idea 0 ') || h.includes('idea 1 ') ? 'ok' : 'wrong_answer') }), freshFeed(6, now)))
  assert.deepEqual(report.built.map(b => b.mode), ['bank', 'bank', 'bank'])
  assert.match(report.built[0].reason ?? '', /only 2 notes passed/)
  assert.equal((await counts(date))[0].source_mode, 'bank')
})

test('too few usable stories means the fallback without calling the writer', opts, async () => {
  const { now } = await freshDay()
  const calls: ModelRequest[] = []
  const report = await buildEditions(deps(now, fakeModel({ calls }), freshFeed(2, now)))
  assert.deepEqual(report.built.map(b => b.mode), ['bank', 'bank', 'bank'])
  assert.equal(calls.length, 0)
})
