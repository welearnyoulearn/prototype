import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { addStudent, makeStudent, openTestDb, resetEditions, testDbOpts } from '../newspaperTestDb'
import { buildEditions } from './build'
import { notifyNewEditions, NOTIFICATION_TYPE } from './notify'
import { acknowledgeRead, answerQuestion, getNewspaper } from './service'
import { fakeFetch, fakeModel, freshFeed, TEST_FEED_URL, TEST_SOURCES } from './testKit'

const opts = testDbOpts
let pool: Pool

before(async () => { if (!opts.skip) pool = await openTestDb() })
after(async () => { if (pool) await pool.end() })

const noticesFor = async (studentIds: number[]) => (await pool.query<{ recipient_student_id: number; title: string; message: string }>(
  `SELECT recipient_student_id, title, message FROM notifications WHERE type = $1 AND recipient_student_id = ANY($2::int[]) ORDER BY recipient_student_id`,
  [NOTIFICATION_TYPE, studentIds])).rows

test('one reminder to each student of a school with the newspaper on, whose grade has an edition and who has not answered', opts, async () => {
  const date = new Date(Date.UTC(2042, 0, 1 + (Date.now() % 400))).toISOString().slice(0, 10)
  await resetEditions(pool, [date])
  const built = new Date(`${date}T04:00:00+05:30`)
  await buildEditions({ db: pool, model: fakeModel(), sources: TEST_SOURCES, now: built, fetchImpl: fakeFetch({ [TEST_FEED_URL]: freshFeed(6, built) }) })

  const on = await makeStudent(pool, '6')                    // band 6-8, school ON
  const g4 = await addStudent(pool, on.schoolId, '4')        // band 3-5
  const g10 = await addStudent(pool, on.schoolId, '10')      // band 9-10
  const tiny = await addStudent(pool, on.schoolId, '1')      // no newspaper for grade 1
  const done = await addStudent(pool, on.schoolId, '7')      // already answered
  const off = await makeStudent(pool, '6')                   // school OFF

  const t0 = new Date(`${date}T06:30:00+05:30`)
  await getNewspaper(pool, { studentId: done, schoolId: on.schoolId, now: t0 })
  const t1 = new Date(t0.getTime() + 21_000)
  await acknowledgeRead(pool, { studentId: done, schoolId: on.schoolId, now: t1 })
  await answerQuestion(pool, { studentId: done, schoolId: on.schoolId, selectedIndex: 0, now: t1 })

  const all = [on.studentId, g4, g10, tiny, done, off.studentId]
  const deps = { db: pool, now: new Date(`${date}T07:00:00+05:30`), schoolHasFeature: async (schoolId: number) => schoolId === on.schoolId }

  const first = await notifyNewEditions(deps)
  assert.equal(first.date, date)
  assert.equal(first.editionsNotified, 3)
  const got = await noticesFor(all)
  assert.deepEqual(got.map(g => g.recipient_student_id).sort((a, b) => a - b), [on.studentId, g4, g10].sort((a, b) => a - b))
  assert.equal(got[0].title, '📰 Today’s newspaper is ready')
  assert.match(got[0].message, /4 short notes and one question/)

  const second = await notifyNewEditions(deps)
  assert.equal(second.editionsNotified, 0)
  assert.equal(second.notices, 0)
  assert.equal((await noticesFor(all)).length, 3, 'running it again sends nothing more')
})

test('a fallback edition is announced as Today\'s Big Idea', opts, async () => {
  const date = new Date(Date.UTC(2043, 0, 1 + (Date.now() % 400))).toISOString().slice(0, 10)
  await resetEditions(pool, [date])
  await buildEditions({ db: pool, model: fakeModel(), sources: TEST_SOURCES, now: new Date(`${date}T04:00:00+05:30`), fetchImpl: fakeFetch({}) })
  const s = await makeStudent(pool, '8')
  await notifyNewEditions({ db: pool, now: new Date(`${date}T07:00:00+05:30`), schoolHasFeature: async id => id === s.schoolId })
  const [notice] = await noticesFor([s.studentId])
  assert.equal(notice.title, '📰 Today’s Big Idea is ready')
  assert.match(notice.message, /One short read and one question/)
})
