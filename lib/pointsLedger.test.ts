import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { openTestDb, makeStudent as makeTestStudent, testDbOpts } from './newspaperTestDb'

// These tests need a real Postgres (see lib/newspaperTestDb.ts): they run only against a throwaway local database.
const opts = testDbOpts

let pool: Pool
let ledger: typeof import('./pointsLedger')
let schema: typeof import('./newspaperSchema')

before(async () => {
  if (opts.skip) return
  pool = await openTestDb()
  ledger = await import('./pointsLedger')
  schema = await import('./newspaperSchema')
})

after(async () => {
  if (pool) await pool.end()
})

const makeStudent = () => makeTestStudent(pool)
let counter = 0
const newEdition = async () => (await pool.query<{ id: number }>(
  `INSERT INTO news_editions (edition_date, grade_band) VALUES (CURRENT_DATE + ($1 || ' days')::interval, '6-8') RETURNING id`,
  [String(1000 + (++counter) + (Date.now() % 100000))])).rows[0].id
const balance = (s: { studentId: number; schoolId: number }) => ledger.getBalance(pool, s.studentId, s.schoolId)

test('the schema migrates, is idempotent and leaves the newspaper OFF at every tier', opts, async () => {
  await schema.ensureNewspaperSchema(pool)
  await schema.ensureNewspaperSchema(pool)
  const flags = await pool.query<{ enabled: boolean }>(`SELECT enabled FROM plan_features WHERE feature_key = 'daily-newspaper'`)
  assert.equal(flags.rows.length, 3)
  assert.ok(flags.rows.every(r => r.enabled === false))
})

test('newspaper points are paid once per child per edition, each action separately', opts, async () => {
  const s = await makeStudent()
  const ed = await newEdition()
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_answered', 2, ed), true)
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_answered', 2, ed), false)
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_correct', 3, ed), true)
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_correct', 3, ed), false)
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_correct', 0, ed + 1), false)
  assert.equal(await balance(s), 5)
})

test('the same award at the same moment is paid once', opts, async () => {
  const s = await makeStudent()
  const ed = await newEdition()
  const r = await Promise.all([1, 2, 3].map(() => ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_answered', 2, ed)))
  assert.equal(r.filter(Boolean).length, 1)
  assert.equal(await balance(s), 2)
})

test('an error inside the transaction rolls the award back', opts, async () => {
  const s = await makeStudent()
  const ed = await newEdition()
  await assert.rejects(
    ledger.withLedgerTransaction(pool, async db => {
      assert.equal(await ledger.awardNewsPoints(db, s.studentId, s.schoolId, 'news_answered', 2, ed), true)
      throw new Error('boom')
    }),
    /boom/,
  )
  assert.equal(await balance(s), 0)
})

test('quiz and newspaper points are one balance', opts, async () => {
  const s = await makeStudent()
  await pool.query(
    `INSERT INTO student_points (student_id, school_id, action_type, points, reference_type, reference_id) VALUES ($1, $2, 'daily_quiz_done', 5, 'daily_quiz_attempt', 1)`,
    [s.studentId, s.schoolId])
  await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_answered', 2, await newEdition())
  assert.equal(await balance(s), 7)
})
