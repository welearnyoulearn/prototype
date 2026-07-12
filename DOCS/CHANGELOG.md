# Changelog

All notable changes to the WLYL School prototype are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/).

<!-- 
## [version] - YYYY-MM-DD

### Added
- New feature description (#issue-number)

### Fixed
- Bug fix description (#issue-number)

### Changed
- Change description (#issue-number)

### Removed
- Removed feature description (#issue-number)
-->

## [Unreleased]

### Added
- Daily Supabase → Cloudflare R2 backup: Vercel Cron (`02:30 UTC`) → `POST /api/cron/backup` streams every public table row-by-row through gzip into an R2 multipart upload (`db/supabase-<ts>.jsonl.gz` + `db/latest.json`) so memory stays flat regardless of DB size; retains the newest 14 backups (paginated listing + batched deletes). (#NN)
- Non-destructive restore: `POST /api/restore` re-inserts only rows missing from the live DB (matched by primary key) via `INSERT ... ON CONFLICT DO NOTHING`; supports `dryRun`; never updates/deletes/truncates. Tables without a primary key are skipped and reported. (#NN)
