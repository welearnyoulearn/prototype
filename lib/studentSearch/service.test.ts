// Needs a throwaway LOCAL Postgres:
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55538/wlyl_search_unit npx tsx --test lib/studentSearch/*.test.ts
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { ensureStudentSearchSchema } from './schema'
import { deleteSearches, getConsent, listSearches, parentOwnsChild, recordSearch, setConsent } from './service'

const url = process.env.TEST_DATABASE_URL
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('TEST_DATABASE_URL must be a local database')
const opts = { skip: url ? false : 'set TEST_DATABASE_URL to a throwaway local Postgres' }

let pool: Pool
const insert = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: number }>(`${sql} RETURNING id`, args)).rows[0].id

async function family() {
  const schoolId = await insert(`INSERT INTO schools (name) VALUES ('Test school')`)
  const studentId = await insert(`INSERT INTO students (school_id, name) VALUES ($1, 'Child')`, [schoolId])
  const parentId = await insert(`INSERT INTO parents (school_id, name) VALUES ($1, 'Parent')`, [schoolId])
  await insert(`INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`, [studentId, parentId])
  return { parentId, child: { studentId, schoolId } }
}

before(async () => {
  if (!url) return
  pool = new Pool({ connectionString: url, max: 3 })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255));
    CREATE TABLE IF NOT EXISTS students (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255));
    CREATE TABLE IF NOT EXISTS parents (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255));
    CREATE TABLE IF NOT EXISTS student_parents (id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES students(id) ON DELETE CASCADE, parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS plan_features (feature_key VARCHAR(50), tier VARCHAR(20), enabled BOOLEAN, UNIQUE(feature_key, tier));
  `)
  await ensureStudentSearchSchema(pool)
  await ensureStudentSearchSchema(pool) // safe to run twice
})
after(async () => { await pool?.end() })

test('the feature is seeded off for every plan', opts, async () => {
  const { rows } = await pool.query(`SELECT enabled FROM plan_features WHERE feature_key = 'student-search'`)
  assert.deepEqual(rows.map(r => r.enabled), [false, false, false])
})

test('nothing is searched or saved without consent', opts, async () => {
  const { child } = await family()
  assert.deepEqual(await recordSearch(pool, child, 'photosynthesis'), { ok: false, reason: 'no_consent' })
  assert.equal((await listSearches(pool, child)).length, 0)
})

test('with consent a search is saved; personal details are not', opts, async () => {
  const { parentId, child } = await family()
  await setConsent(pool, parentId, child, true)
  assert.deepEqual(await recordSearch(pool, child, 'water cycle'), { ok: true, flag: null })
  assert.deepEqual(await recordSearch(pool, child, 'call 9876543210'), { ok: true, flag: 'personal' })
  const saved = await listSearches(pool, child)
  assert.deepEqual(saved.map(s => s.query), ['(personal details, not saved)', 'water cycle'])
})

test('withdrawing consent stops search, deletes history and keeps the decisions', opts, async () => {
  const { parentId, child } = await family()
  await setConsent(pool, parentId, child, true)
  await recordSearch(pool, child, 'fractions')
  await setConsent(pool, parentId, child, false)
  assert.equal((await getConsent(pool, child))?.granted, false)
  assert.equal((await listSearches(pool, child)).length, 0)
  assert.equal((await recordSearch(pool, child, 'fractions')).ok, false)
  const { rows } = await pool.query('SELECT granted FROM student_search_consents WHERE student_id = $1 ORDER BY id', [child.studentId])
  assert.deepEqual(rows.map(r => r.granted), [true, false])
})

test('one family cannot reach another', opts, async () => {
  const a = await family()
  const b = await family()
  await setConsent(pool, a.parentId, a.child, true)
  await recordSearch(pool, a.child, 'solar system')
  assert.equal(await parentOwnsChild(pool, a.parentId, a.child), true)
  assert.equal(await parentOwnsChild(pool, b.parentId, a.child), false)
  const wrongSchool = { studentId: a.child.studentId, schoolId: b.child.schoolId }
  assert.equal(await parentOwnsChild(pool, a.parentId, wrongSchool), false)
  assert.equal(await getConsent(pool, wrongSchool), null)
  assert.equal((await listSearches(pool, wrongSchool)).length, 0)
  await deleteSearches(pool, wrongSchool)
  assert.equal((await listSearches(pool, a.child)).length, 1)
})

test('searches older than 30 days are deleted, and one minute is limited', opts, async () => {
  const { parentId, child } = await family()
  await setConsent(pool, parentId, child, true)
  await pool.query(`INSERT INTO student_searches (school_id, student_id, query, created_at) VALUES ($1, $2, 'old', NOW() - INTERVAL '31 days')`, [child.schoolId, child.studentId])
  assert.equal((await listSearches(pool, child)).length, 0)
  for (let i = 0; i < 20; i++) assert.equal((await recordSearch(pool, child, `topic ${i}`)).ok, true)
  assert.deepEqual(await recordSearch(pool, child, 'one more'), { ok: false, reason: 'too_many' })
})
