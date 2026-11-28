// Retention rules for notifications (#554). Needs a throwaway LOCAL database of its own:
//   RETENTION_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55539/wlyl_retention npx tsx --test lib/notificationRetention.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { purgeNotifications } from './notificationRetention'

const url = process.env.RETENTION_TEST_DATABASE_URL
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('RETENTION_TEST_DATABASE_URL must be a local database')

test('deletes only expired rows whose push has gone out', { skip: url ? false : 'set RETENTION_TEST_DATABASE_URL to a local database' }, async () => {
  const pool = new Pool({ connectionString: url })
  try {
    await pool.query(`DROP TABLE IF EXISTS notifications`)
    await pool.query(`CREATE TABLE notifications (id SERIAL PRIMARY KEY, name TEXT, is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), push_sent_at TIMESTAMPTZ)`)
    // name, is_read, age in days, pushed
    const rows: [string, boolean, number, boolean][] = [
      ['read 8d', true, 8, true],            // deleted: read and past 7 days
      ['read 3d', true, 3, true],            // kept: read but recent
      ['unread 8d', false, 8, true],         // kept: unread and under 30 days
      ['unread 31d', false, 31, true],       // deleted: past 30 days
      ['read 40d unpushed', true, 40, false],// kept: push still queued
      ['unread fresh', false, 0, false],     // kept
    ]
    for (const [name, read, days, pushed] of rows) {
      await pool.query(
        `INSERT INTO notifications (name, is_read, created_at, push_sent_at)
         VALUES ($1, $2, NOW() - make_interval(days => $3), CASE WHEN $4 THEN NOW() END)`, [name, read, days, pushed])
    }
    assert.equal(await purgeNotifications(pool), 2)
    const { rows: left } = await pool.query<{ name: string }>(`SELECT name FROM notifications ORDER BY id`)
    assert.deepEqual(left.map(r => r.name), ['read 3d', 'unread 8d', 'read 40d unpushed', 'unread fresh'])
    assert.equal(await purgeNotifications(pool), 0) // running twice is harmless
  } finally {
    await pool.query(`DROP TABLE IF EXISTS notifications`).catch(() => {})
    await pool.end()
  }
})
