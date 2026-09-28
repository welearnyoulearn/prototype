# Completed Tasks

All finished features and bug fixes. Most recent first.

---

<!-- Add new entries at the top -->

### 2026-09-15 — Exam Management, Calendar & Notifications v3 (#TBD)
**Type:** Feature / Bug Fix
**Portal:** School Admin / Teacher / Student / Parent
**Summary:** Extended the existing exam system with schedule detail (time/room/syllabus/instructions/invigilator/academic year), specific-student targeting, server-side conflict detection, a real cancel state with reschedule/cancel/venue-change notifications, a 7-day/1-day/exam-day reminder cron with per-school toggles, and cross-portal calendars (teacher's portal-wide schedule, student's countdown/completed view, parent's per-child calendar). Along the way fixed two real bugs: `GET /api/exams/calendar` (and the parent dashboard's `child-summary` API) excluded `status='scheduled'` exams by default — the status nearly every future exam sits in — so students and parents saw no upcoming exams at all until the day after each one happened; and `GET /api/exams` let any teacher session view another class's exam list by passing its `class_id`. See `wiki/features/exam-management.md`.
**PR:** #TBD

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
