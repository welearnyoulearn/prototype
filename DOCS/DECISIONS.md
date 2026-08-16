# Architecture Decision Records

Non-obvious technical decisions and their reasoning for the WLYL School prototype.

<!-- 
## YYYY-MM-DD — Decision title

**Context:** What situation prompted this decision?
**Decision:** What was decided and why?
**Alternatives considered:** What else was evaluated?
**Consequences:** What trade-offs come with this decision?
-->

## 2026-07-01 — Data-only backup to R2 + gap-fill-only restore

**Context:** We need protection against accidental data loss (deleted rows) without introducing a way to clobber good data. Vercel serverless cannot run `pg_dump`/`pg_restore` binaries.

**Decision:** Back up in pure Node via the existing `pg` pool (`@/lib/db`) to Cloudflare R2 (S3-compatible, 10 GB free tier, free egress) as gzipped JSON Lines — one header line per table (name, pk, column types) followed by one line per row. Restore is **gap-fill only**: it compares live primary-key sets against the backup and re-inserts only the missing rows with `INSERT ... ON CONFLICT DO NOTHING`. It never runs `UPDATE`/`DELETE`/`TRUNCATE`.

**Alternatives considered:** `pg_dump` on GitHub Actions (full schema+data, but heavier and off-platform — deferred to a separate ticket); a straight overwrite/restore (rejected — would clobber legitimately edited rows and defeats the "lost rows only" product rule).

**Consequences:** Data-only — schema/DDL, RLS, functions, triggers and Supabase Storage files are NOT covered (separate tickets if needed). Restore cannot repair wrongly-edited rows (same PK) by design. Tables without a primary key can't be gap-checked and are skipped + reported. `bytea` columns and jsonb-holding-arrays are edge cases not specially handled. Retention keeps the newest 14 backups to stay within R2's free tier.
