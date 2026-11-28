// A database that already ran the earlier migrations must get the search tables on the next start. initDB() skips
// every migration once the recorded schema version is current, so this fails if SCHEMA_VERSION is not raised.
// Needs an EMPTY throwaway local database of its own:
//   UPGRADE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55538/wlyl_search_upgrade npx tsx --test lib/studentSearch/upgrade.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

const url = process.env.UPGRADE_TEST_DATABASE_URL
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('UPGRADE_TEST_DATABASE_URL must be a local database')

// The version the dev database had recorded before the Google AI button was added.
const RECORDED_ON_DEV = 78

test('an existing database gets the new search fields', { skip: url ? false : 'set UPGRADE_TEST_DATABASE_URL to an empty local database' }, async () => {
  process.env.DATABASE_URL = url
  const { default: pool, initDB } = await import('../db')
  try {
    await initDB()
    // Make the database look like dev did before the Google AI button: search tables without the new fields, no
    // switch for the button, and the older version recorded.
    await pool.query('ALTER TABLE student_searches DROP COLUMN ai_opened_at')
    await pool.query('ALTER TABLE student_search_consents DROP COLUMN ai_granted')
    await pool.query(`DELETE FROM plan_features WHERE feature_key = 'student-search-ai'`)
    await pool.query('UPDATE app_bootstrap_state SET schema_version = $1', [RECORDED_ON_DEV])

    await initDB()

    const { rows: [found] } = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM information_schema.columns WHERE column_name IN ('ai_opened_at', 'ai_granted')) AS fields,
              (SELECT COUNT(*)::int FROM plan_features WHERE feature_key = 'student-search-ai') AS plans`)
    assert.deepEqual(found, { fields: 2, plans: 3 })
  } finally {
    await pool.end()
  }
})
