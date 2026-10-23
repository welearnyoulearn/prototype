# Local Setup Sync

If you've been off the project for a few days (leave, other work, etc.), your local checkout can drift: new commits, new dependencies, new DB migrations, new required env vars. `sync-local` brings you back up to date in one manual step.

## Usage

```bash
npm run sync
```

or directly:

```bash
node scripts/sync-local.mjs
```

You'll be asked to confirm before anything happens:

```
This will pull latest, reinstall deps if needed, and run DB migrations
against your current DATABASE_URL. Continue? [y/N]
```

## What it does

1. **Checks your working tree.** If you have uncommitted changes, it stops and tells you to commit or `git stash -u` first — it will never pull over unsaved work.
2. **Pulls latest** on your current branch (`git pull --ff-only`). If your branch has diverged from remote, this fails safely rather than merging/rebasing for you.
3. **Reinstalls dependencies**, but only if `pnpm-lock.yaml` actually changed in the pull — skips the reinstall otherwise.
4. **Checks env vars.** Compares `.env.example` against your `.env`/`.env.local` and lists anything you're missing (it warns, it doesn't fetch values for you — get new secrets from the team).
5. **Runs pending DB migrations** via the app's own `initDB()` (same idempotent migrations that normally run on server startup) — so any schema changes made while you were away get applied locally.

## Manual use only — important

This script is **not** wired into any git hook, `postinstall`, `predev`, or CI step, and it never will be automatically. It:

- Refuses to run unless invoked from an interactive terminal (fails immediately if piped or run headlessly).
- Always asks for y/N confirmation before touching git, `node_modules`, or the database.

This is deliberate: step 5 runs DB migrations against whatever `DATABASE_URL` is currently configured in your `.env.local`. If that ever points at a shared environment instead of your local Postgres, running this silently/automatically could apply migrations somewhere they shouldn't run. Always run it yourself, on purpose, and double-check which DB your env file points at first (see `use-local-db.bat` / `use-supabase-db.bat`).

## Running just the migration step

If you only need to catch up on DB migrations (e.g. you already pulled manually):

```bash
npm run migrate
```

## When it fails

- **"You have uncommitted changes"** — commit or `git stash -u`, then re-run.
- **`git pull --ff-only` fails** — your local branch has diverged from remote (you have local commits not on remote, or someone force-pushed). Resolve manually (`git log`, `git rebase`/`merge` as appropriate), then re-run.
- **Migration step fails** — check `DATABASE_URL` / `.env.local` and that your local Postgres (or Supabase connection) is reachable.

## Files involved

| File | Purpose |
|---|---|
| `scripts/sync-local.mjs` | Main entry point — orchestrates all steps above |
| `scripts/run-migrations.ts` | Runs `initDB()` from `lib/db.ts` standalone |
