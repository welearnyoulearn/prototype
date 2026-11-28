// Database load test for Student Search (#538). Runs ONLY against an empty throwaway database on this machine:
//   LOAD_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55538/wlyl_search_load npx tsx scripts/load-test-student-search.ts
// It times the feature's own queries. It does not include the web server, login checks, network or Supabase's
// connection limits.
import { Pool } from 'pg'
import { ensureStudentSearchSchema } from '../lib/studentSearch/schema'
import { listSearches, recordSearch } from '../lib/studentSearch/service'

const url = process.env.LOAD_TEST_DATABASE_URL
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('LOAD_TEST_DATABASE_URL must be a local database')

const STUDENTS = Number(process.env.STUDENTS ?? 100_000)
const ROWS = Number(process.env.ROWS ?? 3_000_000)
// Rows already past 30 days, as after a quiet night.
const EXPIRED = Number(process.env.EXPIRED ?? 100_000)
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 20)
const SEARCHES = Number(process.env.SEARCHES ?? 5_000)

const pool = new Pool({ connectionString: url, max: CONNECTIONS })

async function seed() {
  await pool.query(`
    DROP TABLE IF EXISTS student_searches, student_search_consents, student_parents, students, parents, schools, plan_features;
    CREATE TABLE schools (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE students (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name TEXT);
    CREATE TABLE parents (id SERIAL PRIMARY KEY, school_id INTEGER, name TEXT);
    CREATE TABLE student_parents (student_id INTEGER, parent_id INTEGER);
    CREATE TABLE plan_features (feature_key VARCHAR(50), tier VARCHAR(20), enabled BOOLEAN, UNIQUE(feature_key, tier));
    INSERT INTO schools (name) VALUES ('Load test school');
  `)
  await ensureStudentSearchSchema(pool)
  await pool.query(`INSERT INTO students (school_id, name) SELECT 1, 'S' || g FROM generate_series(1, $1::int) g`, [STUDENTS])
  await pool.query(`INSERT INTO student_search_consents (school_id, student_id, granted, notice_version) SELECT 1, id, TRUE, 'load' FROM students`)
  await pool.query(
    `INSERT INTO student_searches (school_id, student_id, query, created_at)
     SELECT 1, 1 + (g % $1::int), 'what is photosynthesis ' || g,
            CASE WHEN g <= $3::int THEN NOW() - INTERVAL '31 days' ELSE NOW() - INTERVAL '2 minutes' - (random() * INTERVAL '29 days') END
     FROM generate_series(1, $2::int) g`, [STUDENTS, ROWS, EXPIRED])
  await pool.query('ANALYZE')
}

async function run(label: string, total: number, task: (i: number) => Promise<unknown>) {
  const times: number[] = []
  let next = 0
  let failed = 0
  const started = performance.now()
  await Promise.all(Array.from({ length: CONNECTIONS }, async () => {
    while (next < total) {
      const i = next++
      const t = performance.now()
      try { await task(i) } catch (err) { failed++; if (failed === 1) console.error(err) }
      times.push(performance.now() - t)
    }
  }))
  times.sort((a, b) => a - b)
  const at = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1)
  const perSecond = Math.round(total / ((performance.now() - started) / 1000))
  console.log(`${label}: ${total} calls, ${perSecond}/s, p50 ${at(0.5)} ms, p95 ${at(0.95)} ms, p99 ${at(0.99)} ms, slowest ${at(1)} ms, failed ${failed}`)
}

async function main() {
  console.log(`Seeding ${STUDENTS} students and ${ROWS} saved searches (${EXPIRED} expired)…`)
  await seed()
  const child = (i: number) => ({ studentId: 1 + ((i * 7919) % STUDENTS), schoolId: 1 })
  await run('student search', SEARCHES, i => recordSearch(pool, child(i), `water cycle ${i}`))
  await run('parent history', Math.round(SEARCHES / 5), i => listSearches(pool, child(i)))
  const { rows: [size] } = await pool.query<{ bytes: string; n: string }>(
    `SELECT pg_total_relation_size('student_searches')::text AS bytes, COUNT(*)::text AS n FROM student_searches`)
  const perRow = Number(size.bytes) / Number(size.n)
  console.log(`storage: ${Math.round(perRow)} bytes per saved search with indexes; 15,000,000 searches ≈ ${(perRow * 15e6 / 1e9).toFixed(1)} GB`)
}

main().finally(() => pool.end())
