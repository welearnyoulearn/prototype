# Feature: Database Backup & Restore (Cloudflare R2)

**Portal:** Platform Admin / Infrastructure
**Status:** Built
**Last updated:** 2026-07-01

---

## What it does

Automatically backs up the Supabase Postgres database to Cloudflare R2 once a day, and provides a safe restore that re-inserts only rows that have gone missing — it never overwrites or deletes live data.

## How it works

- **Backup (automatic):** A Vercel Cron job hits `POST /api/cron/backup` daily at 02:30 UTC. The route streams every public table row-by-row (via `pg-query-stream`) through gzip into an R2 multipart upload at `db/supabase-<timestamp>.jsonl.gz` — memory stays flat regardless of DB size — updates a `db/latest.json` pointer, and prunes to the newest 14 backups.
- **Restore (manual, non-destructive):** Call `POST /api/restore`. It reads a backup (the latest by default, or a specific `key`), compares each table's live primary-key set against the backup, and re-inserts only the missing rows with `INSERT ... ON CONFLICT DO NOTHING`. Pass `{"dryRun":true}` to see what *would* be inserted without writing. It never runs `UPDATE`, `DELETE` or `TRUNCATE`, so an edited row (same PK) is left untouched.

Both routes require `Authorization: Bearer $CRON_SECRET`.

## Key files

| File | Purpose |
|------|---------|
| `app/api/cron/backup/route.ts` | Daily backup + 14-backup retention |
| `app/api/restore/route.ts` | Gap-fill-only restore (missing rows only) |
| `lib/r2.ts` | Shared Cloudflare R2 (S3-compatible) client |
| `lib/backup.ts` | Shared bearer auth + table/PK discovery |
| `vercel.json` | Cron schedule (`30 2 * * *`) |

## API endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/cron/backup` | Run a backup to R2 (called by Vercel Cron) |
| POST | `/api/restore` | Re-insert only missing rows (`{key?, dryRun?}`) |

## Environment

Set in Vercel: `CRON_SECRET`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. DB creds reuse existing `PG*` vars.

## Status history

| Date | Change | Issue |
|------|--------|-------|
| 2026-07-01 | Initial build | #NN |

## Known issues

- [ ] Data-only: schema/DDL, RLS, functions, triggers and Supabase Storage files are not backed up (separate ticket).
- [ ] Tables without a primary key are skipped by restore (cannot gap-check safely).
- [ ] `bytea` columns and jsonb-holding-array values are edge cases not specially handled.

## Notes

Gap-fill-only is deliberate — the product rule is "restore lost rows, never overwrite good data." See `DOCS/DECISIONS.md` (2026-07-01). Runs within Cloudflare R2's 10 GB free tier (free egress); the 14-backup retention keeps storage bounded.
