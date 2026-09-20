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
- School staff (school admin, principal, vice principal) now sign in with **their own email + password**. The School ID is no longer a login credential; `POST /api/auth/login` takes `{ email, password }`. Every school must be created with an admin email, and older owner accounts without one are backfilled from the school's contact email. (#145)
- School staff sessions are now tracked server-side (`user_sessions`): logout, deactivation, password reset and logging in as someone else in the same browser all end the session immediately on the server, not just in the browser. Sessions end after 20 minutes without activity or 12 hours in total, and the cookie is dropped when the browser closes (was a 7-day cookie). (#145)
- Adding a staff member now emails a one-time set-password link valid for 48 hours instead of a temporary password; "Resend Credentials" became "Resend Invite Link" and voids earlier links. (#145)
- The login page no longer offers "You're still signed in as ... / Continue to Dashboard". It always requires a password and instead shows the **last-used account** (name + email) on that browser; clicking it asks only for the password. Authenticated school-admin pages are sent with `Cache-Control: no-store`. (#145)
- Platform "Reset Password" for a school now resets only the school's owner account (the onboarding admin) instead of every `school_admin` in the school, so other admins added later keep their own passwords. (#145)
- `DOCS/openapi.json` regenerated from the route handlers: all 247 paths and 362 operations, grouped into 9 sections and 43 subcategories, each with parameters, request body, responses, accepted sessions, in-handler checks, server-side feature flag and source file. (#131)
- `/api-docs` now uses Scalar instead of Swagger UI: a sidebar of 9 sections and 43 subcategories, coloured badges showing who can call each route, Inter and JetBrains Mono fonts, and a Test Request panel. Scalar telemetry, Ask AI and MCP export are turned off. (#131)
- `GET /api/openapi` and `/api-docs` stay public (no sign-in), by product decision. The wildcard `Access-Control-Allow-Origin: *` header was removed, so other sites can't read the spec from a browser. (#131)

### Fixed
- `GET /api/openapi` read `docs/openapi.json` at runtime while the file lives in `DOCS/`, so it failed on Vercel's case-sensitive filesystem. The spec is now imported at build time. (#131)
- `/api-docs` rendered a blank page: Swagger's StandaloneLayout was used without the DownloadUrl plugin and threw before the spec was fetched. Replaced by the Scalar viewer above. (#131)

### Added
- Daily Supabase → Cloudflare R2 backup: Vercel Cron (`02:30 UTC`) → `POST /api/cron/backup` streams every public table row-by-row through gzip into an R2 multipart upload (`db/supabase-<ts>.jsonl.gz` + `db/latest.json`) so memory stays flat regardless of DB size; retains the newest 14 backups (paginated listing + batched deletes). (#NN)
- Non-destructive restore: `POST /api/restore` re-inserts only rows missing from the live DB (matched by primary key) via `INSERT ... ON CONFLICT DO NOTHING`; supports `dryRun`; never updates/deletes/truncates. Tables without a primary key are skipped and reported. (#NN)
