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

### Changed
- `DOCS/openapi.json` regenerated from the route handlers: all 247 paths and 362 operations, grouped into 9 sections and 43 subcategories, each with parameters, request body, responses, accepted sessions, in-handler checks, server-side feature flag and source file. (#131)
- `/api-docs` now uses Scalar instead of Swagger UI: a sidebar of 9 sections and 43 subcategories, coloured badges showing who can call each route, Inter and JetBrains Mono fonts, and a Test Request panel. Scalar telemetry, Ask AI and MCP export are turned off. (#131)
- `GET /api/openapi` and `/api-docs` stay public (no sign-in), by product decision. The wildcard `Access-Control-Allow-Origin: *` header was removed, so other sites can't read the spec from a browser. (#131)

### Fixed
- `GET /api/openapi` read `docs/openapi.json` at runtime while the file lives in `DOCS/`, so it failed on Vercel's case-sensitive filesystem. The spec is now imported at build time. (#131)
- `/api-docs` rendered a blank page: Swagger's StandaloneLayout was used without the DownloadUrl plugin and threw before the spec was fetched. Replaced by the Scalar viewer above. (#131)

### Added
- Daily Supabase → Cloudflare R2 backup: Vercel Cron (`02:30 UTC`) → `POST /api/cron/backup` streams every public table row-by-row through gzip into an R2 multipart upload (`db/supabase-<ts>.jsonl.gz` + `db/latest.json`) so memory stays flat regardless of DB size; retains the newest 14 backups (paginated listing + batched deletes). (#NN)
- Non-destructive restore: `POST /api/restore` re-inserts only rows missing from the live DB (matched by primary key) via `INSERT ... ON CONFLICT DO NOTHING`; supports `dryRun`; never updates/deletes/truncates. Tables without a primary key are skipped and reported. (#NN)
