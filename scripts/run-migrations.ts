// Runs the app's idempotent DB migrations (lib/db.ts initDB) without booting
// the full Next.js server. Invoked by scripts/sync-local.mjs.
//
// MANUAL USE ONLY — do not call from hooks, postinstall, or CI. Runs against
// whatever DATABASE_URL/.env.local currently points to.
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()

async function main() {
  const { initDB } = await import('../lib/db')
  await initDB()
  console.log('Migrations complete.')
  process.exit(0)
}

main()
