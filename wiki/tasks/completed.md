# Completed Tasks

All finished features and bug fixes. Most recent first.

---

<!-- Add new entries at the top -->

## Format

```
### [Date] — Title (#issue-number)
**Type:** Feature / Bug Fix / Enhancement
**Portal:** School Admin / Teacher / Student / Parent / Platform Admin
**Summary:** What was done in 1-2 sentences.
**PR:** #pr-number
```

---

### 2026-07-01 — Database backup & restore to Cloudflare R2 (#NN)
**Type:** Feature
**Portal:** Platform Admin / Infrastructure
**Summary:** Daily Vercel Cron backs up all public tables to R2 as gzipped JSON Lines (14-backup retention); a non-destructive restore endpoint re-inserts only missing rows (gap-fill, never overwrites/deletes). See `wiki/features/backup-restore.md`.
**PR:** #TBD

---

<!-- 
### 2026-XX-XX — Example feature (#issue-number)
**Type:** Feature
**Portal:** School Admin
**Summary:** Built the fee management module with categories, structures, payments, and waivers.
**PR:** #45
-->
