import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'

import { openTestDb, makeStudent as makeTestStudent, testDbOpts } from './newspaperTestDb'

// These tests need a real Postgres (see lib/newspaperTestDb.ts): they run only against a throwaway local database.
const opts = testDbOpts

type Ledger = typeof import('./pointsLedger')
let pool: Pool
let ledger: Ledger
let schema: typeof import('./newspaperRewardsSchema')
let runId = 0
let itemId = 0

before(async () => {
  if (opts.skip) return
  pool = await openTestDb()
  ledger = await import('./pointsLedger')
  schema = await import('./newspaperRewardsSchema')

  const open = await pool.query<{ id: number }>('SELECT id FROM reward_runs WHERE closed_at IS NULL')
  runId = open.rows[0]?.id ?? (await pool.query<{ id: number }>(
    `INSERT INTO reward_runs (label, cutoff_at) VALUES ('Test run', NOW() + INTERVAL '10 days') RETURNING id`)).rows[0].id
  itemId = (await pool.query<{ id: number }>('SELECT id FROM reward_items ORDER BY id LIMIT 1')).rows[0].id
})

after(async () => {
  if (pool) await pool.end()
})

const makeStudent = () => makeTestStudent(pool)
let counter = 0 // unique edition dates for the newspaper-points test

async function seedPoints(studentId: number, schoolId: number, points: number) {
  await pool.query(`INSERT INTO student_points (student_id, school_id, action_type, points) VALUES ($1, $2, 'test_seed', $3)`, [studentId, schoolId, points])
}

async function makeOrder(studentId: number, schoolId: number, points: number, opts2: { status?: string; placedAgo?: string } = {}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(`
    INSERT INTO reward_orders (run_id, school_id, student_id, placed_by, item_id, item_name, points_cost, student_name, status, placed_at)
    VALUES ($1, $2, $3, 'student', $4, 'Test item', $5, 'Test student', $6, NOW() - $7::interval) RETURNING id`,
    [runId, schoolId, studentId, itemId, points, opts2.status ?? 'placed', opts2.placedAgo ?? '0 seconds'])
  return rows[0].id
}

const balance = (s: { studentId: number; schoolId: number }) => ledger.getBalance(pool, s.studentId, s.schoolId)
const reserve = (s: { studentId: number; schoolId: number }, orderId: number, points: number) =>
  ledger.withLedgerTransaction(pool, db => ledger.reserveOrderPoints(db, { ...s, orderId, points }))

test('the schema migrates, is idempotent, seeds the 7 starter items once and leaves both features OFF', opts, async () => {
  await schema.ensureNewspaperRewardsSchema(pool)
  await schema.ensureNewspaperRewardsSchema(pool)

  const items = await pool.query<{ name: string; points_cost: number }>('SELECT name, points_cost FROM reward_items ORDER BY sort_order')
  assert.equal(items.rows.length, 7)
  assert.deepEqual(items.rows.map(r => r.points_cost), [150, 150, 150, 250, 400, 500, 500])

  // WLYL owns the catalog afterwards: a rename is never undone by a later migration run.
  await pool.query(`UPDATE reward_items SET name = 'HB pencil' WHERE name = 'Pencil'`)
  await schema.ensureNewspaperRewardsSchema(pool)
  const after2 = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM reward_items`)
  assert.equal(after2.rows[0].n, 7)
  await pool.query(`UPDATE reward_items SET name = 'Pencil' WHERE name = 'HB pencil'`)

  const flags = await pool.query<{ feature_key: string; enabled: boolean }>(
    `SELECT feature_key, enabled FROM plan_features WHERE feature_key IN ('daily-newspaper', 'rewards-marketplace')`)
  assert.equal(flags.rows.length, 6)
  assert.ok(flags.rows.every(r => r.enabled === false))
})

test('newspaper points are paid once per child per edition, each action separately', opts, async () => {
  const s = await makeStudent()
  const ed = (await pool.query<{ id: number }>(
    `INSERT INTO news_editions (edition_date, grade_band) VALUES (CURRENT_DATE + ($1 || ' days')::interval, '6-8') RETURNING id`, [String(1000 + (++counter) + (Date.now() % 100000))])).rows[0].id

  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_answered', 2, ed), true)
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_answered', 2, ed), false)
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_correct', 3, ed), true)
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_correct', 3, ed), false)
  assert.equal(await ledger.awardNewsPoints(pool, s.studentId, s.schoolId, 'news_correct', 0, ed + 1), false)
  assert.equal(await balance(s), 5)
})

test('an order holds its points once; asking again changes nothing', opts, async () => {
  const s = await makeStudent()
  await seedPoints(s.studentId, s.schoolId, 500)
  const order = await makeOrder(s.studentId, s.schoolId, 150)

  assert.deepEqual(await reserve(s, order, 150), { ok: true, balance: 350 })
  assert.equal(await balance(s), 350)
  const again = await reserve(s, order, 150)
  assert.equal(again.ok, false)
  assert.equal(again.ok === false && again.reason, 'already_spent')
  assert.equal(await balance(s), 350)
})

test('an order is refused when the balance is too low and writes nothing', opts, async () => {
  const s = await makeStudent()
  await seedPoints(s.studentId, s.schoolId, 100)
  const order = await makeOrder(s.studentId, s.schoolId, 150)

  const r = await reserve(s, order, 150)
  assert.deepEqual(r, { ok: false, reason: 'insufficient', balance: 100 })
  assert.equal(await balance(s), 100)
})

test('the 500-point monthly limit counts this month only and ignores cancelled orders', opts, async () => {
  const s = await makeStudent()
  await seedPoints(s.studentId, s.schoolId, 5000)

  const first = await makeOrder(s.studentId, s.schoolId, 400)
  assert.equal((await reserve(s, first, 400)).ok, true)

  const second = await makeOrder(s.studentId, s.schoolId, 150)
  const blocked = await reserve(s, second, 150)
  assert.equal(blocked.ok === false && blocked.reason, 'monthly_limit')
  assert.equal(await balance(s), 4600)

  await pool.query(`UPDATE reward_orders SET status = 'cancelled' WHERE id = $1`, [first])
  assert.equal((await reserve(s, second, 150)).ok, true)

  // An order from an earlier month does not use this month's allowance.
  const old = await makeOrder(s.studentId, s.schoolId, 500, { placedAgo: '40 days' })
  const third = await makeOrder(s.studentId, s.schoolId, 350)
  void old
  assert.equal((await reserve(s, third, 350)).ok, true)
})

test('a refund gives back exactly what the order spent, once', opts, async () => {
  const s = await makeStudent()
  await seedPoints(s.studentId, s.schoolId, 300)
  const order = await makeOrder(s.studentId, s.schoolId, 250)
  assert.equal((await reserve(s, order, 250)).ok, true)
  assert.equal(await balance(s), 50)

  assert.equal(await ledger.withLedgerTransaction(pool, db => ledger.refundOrderPoints(db, s.studentId, s.schoolId, order)), true)
  assert.equal(await balance(s), 300)
  assert.equal(await ledger.withLedgerTransaction(pool, db => ledger.refundOrderPoints(db, s.studentId, s.schoolId, order)), false)
  assert.equal(await balance(s), 300)

  const neverSpent = await makeOrder(s.studentId, s.schoolId, 150)
  assert.equal(await ledger.withLedgerTransaction(pool, db => ledger.refundOrderPoints(db, s.studentId, s.schoolId, neverSpent)), false)
  assert.equal(await balance(s), 300)
})

test('two orders at once cannot spend the same points twice', opts, async () => {
  const s = await makeStudent()
  await seedPoints(s.studentId, s.schoolId, 150)
  const a = await makeOrder(s.studentId, s.schoolId, 150)
  const b = await makeOrder(s.studentId, s.schoolId, 150)

  const results = await Promise.all([reserve(s, a, 150), reserve(s, b, 150)])
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.equal(results.filter(r => !r.ok && r.reason === 'insufficient').length, 1)
  assert.equal(await balance(s), 0)
})

test('a second spend waits for the first transaction to finish (the per-child lock)', opts, async () => {
  const s = await makeStudent()
  await seedPoints(s.studentId, s.schoolId, 150)
  const a = await makeOrder(s.studentId, s.schoolId, 150)
  const b = await makeOrder(s.studentId, s.schoolId, 150)

  const clientA = await pool.connect()
  try {
    await clientA.query('BEGIN')
    const first = await ledger.reserveOrderPoints(clientA, { ...s, orderId: a, points: 150 }) // holds the lock until COMMIT
    assert.equal(first.ok, true)

    let settled = false
    const second = reserve(s, b, 150).then(r => { settled = true; return r })
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.equal(settled, false, 'the second spend must wait while the first transaction is open')

    await clientA.query('COMMIT')
    const result = await second
    assert.equal(result.ok === false && result.reason, 'insufficient')
  } finally {
    clientA.release()
  }
  assert.equal(await balance(s), 0)
})

test('the same order placed twice at once is spent once', opts, async () => {
  const s = await makeStudent()
  await seedPoints(s.studentId, s.schoolId, 1000)
  const order = await makeOrder(s.studentId, s.schoolId, 150)

  const results = await Promise.all([reserve(s, order, 150), reserve(s, order, 150), reserve(s, order, 150)])
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.equal(await balance(s), 850)
})

test('an error inside the transaction rolls the spend back', opts, async () => {
  const s = await makeStudent()
  await seedPoints(s.studentId, s.schoolId, 500)
  const order = await makeOrder(s.studentId, s.schoolId, 150)

  await assert.rejects(
    ledger.withLedgerTransaction(pool, async db => {
      const r = await ledger.reserveOrderPoints(db, { ...s, orderId: order, points: 150 })
      assert.equal(r.ok, true)
      throw new Error('boom')
    }),
    /boom/,
  )
  assert.equal(await balance(s), 500)
})

test('quiz and newspaper points are one balance: any ledger row counts, spending and refunds net out', opts, async () => {
  const s = await makeStudent()
  await pool.query(
    `INSERT INTO student_points (student_id, school_id, action_type, points, reference_type, reference_id) VALUES ($1, $2, 'daily_quiz_done', 5, 'daily_quiz_attempt', 1)`,
    [s.studentId, s.schoolId])
  await seedPoints(s.studentId, s.schoolId, 145)
  assert.equal(await balance(s), 150)
  const order = await makeOrder(s.studentId, s.schoolId, 150)
  assert.equal((await reserve(s, order, 150)).ok, true)
  assert.equal(await balance(s), 0)
})
