#!/usr/bin/env node
// Brings a developer's local checkout up to date after time away:
// pulls latest, reinstalls deps if the lockfile changed, warns about new
// env vars, and runs pending DB migrations via lib/db.ts's initDB().
//
// MANUAL USE ONLY. This must never be wired into a git hook, postinstall,
// predev, or CI step — it pulls, installs, and runs DB migrations against
// whatever DATABASE_URL is currently configured, which can be a shared
// environment. Only a developer who explicitly runs it should trigger it.
//
// Usage: node scripts/sync-local.mjs   (or: npm run sync)

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

// Manual-only gate: refuse to proceed unless run from an interactive
// terminal with explicit confirmation. This prevents the script from doing
// anything if it's ever accidentally wired into a hook, postinstall, or CI
// step in the future.
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('sync-local.mjs must be run manually from an interactive terminal. Aborting.')
  process.exit(1)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await rl.question(
  '\nThis will pull latest, reinstall deps if needed, and run DB migrations against your current DATABASE_URL. Continue? [y/N] '
)
rl.close()
if (answer.trim().toLowerCase() !== 'y') {
  console.log('Aborted.')
  process.exit(1)
}

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', ...opts })
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim()
}

function step(title) {
  console.log(`\n=== ${title} ===`)
}

// 1. Refuse to run with uncommitted changes that could be clobbered by pull
step('Checking working tree')
const status = runCapture('git status --porcelain')
if (status) {
  console.log('You have uncommitted changes:\n' + status)
  console.log('\nCommit or stash them before syncing (git stash -u), then re-run this script.')
  process.exit(1)
}

const branch = runCapture('git rev-parse --abbrev-ref HEAD')
console.log(`On branch: ${branch}`)

// 2. Pull latest
step('Pulling latest changes')
const lockBefore = existsSync('pnpm-lock.yaml') ? readFileSync('pnpm-lock.yaml', 'utf8') : null
run('git pull --ff-only')
const lockAfter = existsSync('pnpm-lock.yaml') ? readFileSync('pnpm-lock.yaml', 'utf8') : null

// 3. Reinstall deps only if the lockfile actually changed
if (lockBefore !== lockAfter) {
  step('Lockfile changed — reinstalling dependencies')
  run('pnpm install')
} else {
  console.log('\nLockfile unchanged — skipping install')
}

// 4. Warn about new/removed env vars vs .env.example
step('Checking env vars against .env.example')
if (existsSync('.env.example')) {
  const exampleVars = new Set(
    readFileSync('.env.example', 'utf8')
      .split('\n')
      .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=/)?.[1])
      .filter(Boolean)
  )
  const localFiles = ['.env', '.env.local'].filter(existsSync)
  const localVars = new Set()
  for (const f of localFiles) {
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^([A-Z_][A-Z0-9_]*)=/)
      if (m) localVars.add(m[1])
    }
  }
  const missing = [...exampleVars].filter(v => !localVars.has(v))
  if (missing.length) {
    console.log('Missing env vars (present in .env.example, not in your .env/.env.local):')
    missing.forEach(v => console.log(`  - ${v}`))
  } else {
    console.log('All example env vars are present locally.')
  }
} else {
  console.log('No .env.example found — skipping.')
}

// 5. Run pending DB migrations (idempotent, safe to run every time)
step('Running database migrations (initDB)')
try {
  run('npx tsx scripts/run-migrations.ts')
} catch (err) {
  console.log('\nMigration step failed. Check your DATABASE_URL / local Postgres connection.')
  process.exit(1)
}

console.log('\nLocal setup is up to date.')
