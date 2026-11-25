// A database that already ran the earlier migrations must get the search tables on the next start. initDB() skips
// every migration once the recorded schema version is current, so this fails if SCHEMA_VERSION is not raised.
// Needs an EMPTY throwaway local database of its own:
//   UPGRADE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55538/wlyl_search_upgrade npx tsx --test lib/studentSearch/upgrade.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

const url = process.env.UPGRADE_TEST_DATABASE_URL
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('UPGRADE_TEST_DATABASE_URL must be a local database')

// The version dev recorded before Student Search was added.
const VERSION_BEFORE_SEARCH = 74

test('an existing database gets the search tables', { skip: url ? false : 'set UPGRADE_TEST_DATABASE_URL to an empty local database' }, async () => {
  process.env.DATABASE_URL = url
  const { default: pool, initDB } = await import('../db')
  try {
    await initDB()
    // Put the database back to how it looked before this feature was deployed.
    await pool.query('DROP TABLE IF EXISTS student_searches, student_search_consents')
    await pool.query(`DELETE FROM plan_features WHERE feature_key = 'student-search'`)
    await pool.query('UPDATE app_bootstrap_state SET schema_version = $1', [VERSION_BEFORE_SEARCH])

    await initDB()

    const { rows: [found] } = await pool.query(
      `SELECT to_regclass('student_searches') IS NOT NULL AS searches, to_regclass('student_search_consents') IS NOT NULL AS consents,
              (SELECT COUNT(*)::int FROM plan_features WHERE feature_key = 'student-search') AS plans`)
    assert.deepEqual(found, { searches: true, consents: true, plans: 3 })
  } finally {
    await pool.end()
  }
})
