// Test support for the Daily Newspaper and Rewards Marketplace tests that need a real Postgres. Not used by the app.
//
// The tests only run when TEST_DATABASE_URL points at a throwaway database on this machine; any other host throws, so
// they can never touch Supabase:
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/wlyl_newspaper_test
//
// Running the whole initDB() is not used: on a completely empty database it stops at `ALTER TABLE fee_year_close`,
// which runs before that table is created (an existing problem in the fresh-database path, not in these features).
// Instead the existing tables these features build on are created here, copied from lib/db.ts (only the columns that
// matter), and then the feature's own migration runs on top.
import { Pool } from 'pg'
import { ensureNewspaperRewardsSchema } from './newspaperRewardsSchema'

export const testDbUrl = process.env.TEST_DATABASE_URL
if (testDbUrl && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(testDbUrl).hostname)) {
  throw new Error('TEST_DATABASE_URL must be a local database (127.0.0.1 or localhost)')
}
export const testDbOpts = { skip: testDbUrl ? false : 'set TEST_DATABASE_URL to a throwaway local Postgres to run the database tests' }

const BASE_TABLES = `
  CREATE TABLE IF NOT EXISTS app_bootstrap_state (key TEXT PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), schema_version INTEGER);
  CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL);
  CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL,
    grade VARCHAR(20), section VARCHAR(10), status VARCHAR(20) DEFAULT 'active', school_roll_number INTEGER);
  CREATE TABLE IF NOT EXISTS parents (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255));
  CREATE TABLE IF NOT EXISTS student_parents (
    id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE, UNIQUE(student_id, parent_id));
  CREATE TABLE IF NOT EXISTS plan_features (
    id SERIAL PRIMARY KEY, feature_key VARCHAR(50) NOT NULL, tier VARCHAR(20) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(feature_key, tier));
  CREATE TABLE IF NOT EXISTS student_points (
    id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, school_id INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL, points INTEGER NOT NULL DEFAULT 0, reference_id INTEGER, reference_type VARCHAR(50),
    earned_at TIMESTAMPTZ DEFAULT NOW(), points_type VARCHAR(20) DEFAULT 'academic');
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    recipient_student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    recipient_parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE, recipient_school_id INTEGER,
    type VARCHAR(50) NOT NULL, title VARCHAR(200), message TEXT, data JSONB, is_read BOOLEAN DEFAULT FALSE);
`

/** A pool on the throwaway database with the base tables and the feature's own tables in place. */
export async function openTestDb(): Promise<Pool> {
  if (!testDbUrl) throw new Error('TEST_DATABASE_URL is not set')
  // Same session timezone as lib/db.ts, so the IST maths is tested the way production runs it.
  const pool = new Pool({ connectionString: testDbUrl, max: 6, options: '-c timezone=Asia/Kolkata' })
  await pool.query(BASE_TABLES)
  await ensureNewspaperRewardsSchema(pool)
  return pool
}

let counter = 0
/** A new school with one active student. */
export async function makeStudent(pool: Pool, grade = '6'): Promise<{ studentId: number; schoolId: number }> {
  counter += 1
  const school = await pool.query<{ id: number }>('INSERT INTO schools (name) VALUES ($1) RETURNING id', [`Test school ${Date.now()}-${counter}`])
  const schoolId = school.rows[0].id
  const stu = await pool.query<{ id: number }>(
    `INSERT INTO students (school_id, name, grade, section) VALUES ($1, $2, $3, 'B') RETURNING id`, [schoolId, `Test student ${counter}`, grade])
  return { studentId: stu.rows[0].id, schoolId }
}

/** A further active student in an existing school. */
export async function addStudent(pool: Pool, schoolId: number, grade: string): Promise<number> {
  counter += 1
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO students (school_id, name, grade, section) VALUES ($1, $2, $3, 'B') RETURNING id`, [schoolId, `Test student ${counter}`, grade])
  return rows[0].id
}

/** Remove every edition for these dates (and, by cascade, its notes, questions and attempts) so a test starts clean. */
export async function resetEditions(pool: Pool, dates: readonly string[]): Promise<void> {
  await pool.query('DELETE FROM news_editions WHERE edition_date = ANY($1::date[])', [dates])
}
