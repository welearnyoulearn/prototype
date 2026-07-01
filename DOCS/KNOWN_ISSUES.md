# Known Issues

Current bugs and workarounds for the WLYL School prototype.

<!-- 
## Active Issues

### [#issue-number] Short description
- **Severity:** Critical / High / Medium / Low
- **Workaround:** Description of workaround
- **Status:** Fix in progress — branch `fix/issue-number-description`
- **ETA:** YYYY-MM-DD

## Resolved (remove entries when the fix is deployed)
-->

## Active Issues

### [#NN] R2 backup buffers the whole DB in memory
- **Severity:** Medium
- **Detail:** `/api/cron/backup` accumulates all rows into memory, then gzips in one pass. Very large append-only tables (attendance, exam_marks, student_points) could eventually OOM or hit `maxDuration=300`.
- **Workaround:** Fine at current data volumes. Fix = stream per-table + R2 multipart upload (separate ticket).
- **Status:** Documented limitation for the initial backup feature.

### [#NN] Restore counts assume integer PKs
- **Severity:** Low
- **Detail:** `pkKey` compares live vs backup PK values via `JSON.stringify`. All PKs are integer `SERIAL` today, so this is exact. If a `timestamp`/`date` PK is ever added, live (JS Date) vs backup (ISO string) representations could differ, making the reported `missing`/`inserted` counts inaccurate. Data stays safe regardless (`ON CONFLICT DO NOTHING`).
- **Workaround:** Normalize PK values before keying if such a PK is introduced.

### [#NN] Backup retention lists a single page
- **Severity:** Low
- **Detail:** Retention uses one `ListObjectsV2` call (max 1000 keys). Correct while retention keeps 14 backups; would need pagination only if the `db/supabase-*` prefix ever exceeds 1000 objects.
