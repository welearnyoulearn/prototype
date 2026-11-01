import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { makeStudent, openTestDb, resetEditions, testDbOpts } from '../newspaperTestDb'
import { buildEditions } from './build'
import { acknowledgeRead, answerQuestion, getNewspaper, MIN_READ_SECONDS, pickQuestionIndex, type NewspaperView } from './service'
import { fakeFetch, fakeModel, freshFeed, TEST_FEED_URL, TEST_SOURCES } from './testKit'
import { getBalance } from '../pointsLedger'

const opts = testDbOpts
let pool: Pool
let n = 0

before(async () => { if (!opts.skip) pool = await openTestDb() })
after(async () => { if (pool) await pool.end() })

/** An edition day with all three bands built, and a clock on that day. */
async function day() {
  n += 1
  const date = new Date(Date.UTC(2041, 0, 1 + n + (Date.now() % 300))).toISOString().slice(0, 10)
  await resetEditions(pool, [date])
  const built = new Date(`${date}T04:00:00+05:30`)
  await buildEditions({ db: pool, model: fakeModel(), sources: TEST_SOURCES, now: built, fetchImpl: fakeFetch({ [TEST_FEED_URL]: freshFeed(6, built) }) })
  const at = (hhmm: string, plusDays = 0) => new Date(new Date(`${date}T${hhmm}:00+05:30`).getTime() + plusDays * 86_400_000)
  return { date, at }
}

const reading = (v: NewspaperView) => { assert.equal(v.state, 'reading'); return v as Extract<NewspaperView, { items: unknown }> }

test('grades without a newspaper see "unavailable"; a day without an edition is "not ready"', opts, async () => {
  const { at } = await day()
  const small = await makeStudent(pool, '1')
  assert.deepEqual(await getNewspaper(pool, { ...small, now: at('07:00') }), { state: 'unavailable' })
  const other = await makeStudent(pool, '7')
  assert.deepEqual(await getNewspaper(pool, { ...other, now: at('07:00', 400) }), { state: 'not_ready' })
})

test('the whole flow: read, wait, "I read it", answer, points once, then done', opts, async () => {
  const { at } = await day()
  const s = await makeStudent(pool, '6')

  const first = reading(await getNewspaper(pool, { ...s, now: at('07:00') }))
  assert.equal(first.items.length, 4)
  assert.equal(first.edition.band, '6-8')
  assert.equal(first.secondsUntilCanAcknowledge, MIN_READ_SECONDS)
  assert.equal(first.question, null, 'the question is not shown until they say they read it')
  assert.equal(first.pointsAvailable, 5)

  const early = new Date(at('07:00').getTime() + 5000)
  assert.deepEqual(await acknowledgeRead(pool, { ...s, now: early }), { ok: false, reason: 'too_soon', waitSeconds: 15 })
  assert.deepEqual(await answerQuestion(pool, { ...s, selectedIndex: 0, now: early }), { ok: false, reason: 'not_acknowledged' })

  const later = new Date(at('07:00').getTime() + MIN_READ_SECONDS * 1000)
  assert.deepEqual(await acknowledgeRead(pool, { ...s, now: later }), { ok: true })
  assert.deepEqual(await acknowledgeRead(pool, { ...s, now: later }), { ok: true }, 'asking again is harmless')

  const q = await getNewspaper(pool, { ...s, now: later })
  assert.equal(q.state, 'question')
  const asked = (q as Extract<NewspaperView, { question: unknown }>).question
  assert.ok(asked && asked.options.length === 4)
  const json = JSON.stringify(q)
  assert.ok(!/correct_?index/i.test(json) && !json.includes('They explored an idea.'), 'the answer key and explanation are not sent before answering')

  // Find the right option the way the test knows it: the fake model's key is the note's id modulo 4.
  const key = Number(/note (\d+)\?/.exec(asked.stem)?.[1]) % 4
  const wrong = (key + 1) % 4
  const ans = await answerQuestion(pool, { ...s, selectedIndex: wrong, now: later })
  assert.ok(ans.ok)
  assert.deepEqual(ans.ok && ans.result, { selectedIndex: wrong, correctIndex: key, correct: false, explanation: 'They explored an idea.', pointsAwarded: 2 })
  assert.equal(ans.ok && ans.balance, 2)

  assert.deepEqual(await answerQuestion(pool, { ...s, selectedIndex: key, now: later }), { ok: false, reason: 'already_answered' })
  assert.equal(await getBalance(pool, s.studentId, s.schoolId), 2, 'a second try pays nothing')

  const done = await getNewspaper(pool, { ...s, now: later })
  assert.equal(done.state, 'done')
  assert.equal((done as Extract<NewspaperView, { result: unknown }>).result?.pointsAwarded, 2)
})

test('a correct answer pays 5: 2 for answering and 3 for being right', opts, async () => {
  const { at } = await day()
  const s = await makeStudent(pool, '9')
  const t0 = at('08:00')
  await getNewspaper(pool, { ...s, now: t0 })
  const t1 = new Date(t0.getTime() + 21_000)
  await acknowledgeRead(pool, { ...s, now: t1 })
  const q = (await getNewspaper(pool, { ...s, now: t1 })) as Extract<NewspaperView, { question: unknown }>
  const key = Number(/note (\d+)\?/.exec(q.question!.stem)?.[1]) % 4
  const ans = await answerQuestion(pool, { ...s, selectedIndex: key, now: t1 })
  assert.equal(ans.ok && ans.result.pointsAwarded, 5)
  assert.equal(await getBalance(pool, s.studentId, s.schoolId), 5)
})

test('two answers at the same moment pay once', opts, async () => {
  const { at } = await day()
  const s = await makeStudent(pool, '4')
  const t0 = at('08:00')
  await getNewspaper(pool, { ...s, now: t0 })
  const t1 = new Date(t0.getTime() + 21_000)
  await acknowledgeRead(pool, { ...s, now: t1 })
  const results = await Promise.all([0, 1, 2, 3].map(i => answerQuestion(pool, { ...s, selectedIndex: i, now: t1 })))
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.equal(results.filter(r => !r.ok && r.reason === 'already_answered').length, 3)
  const balance = await getBalance(pool, s.studentId, s.schoolId)
  assert.ok(balance === 2 || balance === 5, `balance ${balance}`)
})

test('"I read it" needs the newspaper to have been opened first', opts, async () => {
  const { at } = await day()
  const s = await makeStudent(pool, '6')
  assert.deepEqual(await acknowledgeRead(pool, { ...s, now: at('09:00') }), { ok: false, reason: 'closed' })
})

test('the window runs 06:00 to 06:00: yesterday until 05:59, nothing once the next 06:00 comes with no new edition', opts, async () => {
  const { at } = await day()
  const s = await makeStudent(pool, '6')
  assert.equal((await getNewspaper(pool, { ...s, now: at('07:00') })).state, 'reading')
  assert.equal((await getNewspaper(pool, { ...s, now: at('05:59', 1) })).state, 'reading', 'still today\'s edition just before 06:00 next day')
  assert.equal((await getNewspaper(pool, { ...s, now: at('06:00', 1) })).state, 'not_ready')
  assert.deepEqual(await answerQuestion(pool, { ...s, selectedIndex: 0, now: at('06:00', 1) }), { ok: false, reason: 'closed' })
})

test('a pulled note disappears at once and a pulled edition closes; a restored one comes back', opts, async () => {
  const { date, at } = await day()
  const s = await makeStudent(pool, '6')
  const v = reading(await getNewspaper(pool, { ...s, now: at('07:00') }))
  const pulledItem = v.items[0].id
  await pool.query(`UPDATE news_items SET status = 'pulled' WHERE id = $1`, [pulledItem])
  const after1 = reading(await getNewspaper(pool, { ...s, now: at('07:01') }))
  assert.equal(after1.items.length, 3)
  assert.ok(!after1.items.some(i => i.id === pulledItem))

  await pool.query(`UPDATE news_editions SET status = 'pulled' WHERE edition_date = $1 AND grade_band = '6-8'`, [date])
  assert.equal((await getNewspaper(pool, { ...s, now: at('07:02') })).state, 'not_ready')
  await pool.query(`UPDATE news_editions SET status = 'published' WHERE edition_date = $1 AND grade_band = '6-8'`, [date])
  await pool.query(`UPDATE news_items SET status = 'active' WHERE id = $1`, [pulledItem])
  assert.equal(reading(await getNewspaper(pool, { ...s, now: at('07:03') })).items.length, 4)
})

test('if the note their question was about is pulled before they answer, they get another question', opts, async () => {
  const { at } = await day()
  const s = await makeStudent(pool, '6')
  const t0 = at('07:00')
  await getNewspaper(pool, { ...s, now: t0 })
  const { rows: [att] } = await pool.query<{ question_id: number; item_id: number }>(
    `SELECT a.question_id, q.item_id FROM news_attempts a JOIN news_questions q ON q.id = a.question_id WHERE a.student_id = $1`, [s.studentId])
  await pool.query(`UPDATE news_items SET status = 'pulled' WHERE id = $1`, [att.item_id])
  const t1 = new Date(t0.getTime() + 21_000)
  await getNewspaper(pool, { ...s, now: t1 })
  await acknowledgeRead(pool, { ...s, now: t1 })
  const q = (await getNewspaper(pool, { ...s, now: t1 })) as Extract<NewspaperView, { question: unknown }>
  assert.ok(q.question)
  assert.notEqual(q.question.id, att.question_id)
  await pool.query(`UPDATE news_items SET status = 'active' WHERE id = $1`, [att.item_id])
})

test('neighbouring students get different questions, the same student always the same one', () => {
  assert.equal(pickQuestionIndex(7, 3, 4), pickQuestionIndex(7, 3, 4))
  const seen = new Set(Array.from({ length: 100 }, (_, i) => pickQuestionIndex(1000 + i, 55, 4)))
  assert.equal(seen.size, 4)
  assert.equal(pickQuestionIndex(5, 5, 1), 0)
  assert.throws(() => pickQuestionIndex(1, 1, 0))
})
