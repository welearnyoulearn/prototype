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

### 2026-09-20 — Removed Emergency Cover from dev, pending rework (#140)
**Type:** Removal
**Portal:** School Admin / Teacher
**Summary:** Pulled the admin substitute-assignment workflow out of `dev` — feature flag, `EmergencyCover.tsx`, nav wiring, and the uncovered-periods stat/alert in Overview/DailyBriefing/admin overview & briefing routes. Kept `/api/substitutes` GET (read-only) alive since the protected Attendance dashboard and a few teacher views still read it; removed its POST/DELETE write actions. Full code + `EXTRACTION-140.md` preserved on `feature/140-remove-emergency-cover`. DB schema untouched.

### 2026-09-20 — Removed Leave Requests from dev, pending rework (#139)
**Type:** Removal
**Portal:** School Admin / Teacher
**Summary:** Pulled the Leave Requests feature out of `dev` — feature flag, `/api/leave-requests` routes, `LeaveRequests.tsx`/`TeacherLeave.tsx`, nav wiring, and surgical edits to Overview, admin overview/briefing routes, StudentTeacherAnalysis, SmartSnapshot, TeachersManagement, NotificationCenter/Bell, and CommandBar. Full code + `EXTRACTION-139.md` preserved on `feature/139-remove-leave-requests`. DB schema untouched (`leave_requests` table stays; Emergency Cover's uncovered-periods query still joins against it).

### 2026-09-20 — Removed Ask a Doubt from dev, pending rework (#137)
**Type:** Removal
**Portal:** Student / Teacher
**Summary:** Pulled the Gemini-backed Ask a Doubt feature out of `dev` — feature flag, `/api/doubts` routes, `StudentDoubts.tsx`/`ClassDoubts.tsx`, and orphaned dead code found during cleanup (`DoubtsCenter.tsx`, `FloatingAIChat.tsx` — confirmed zero importers repo-wide before deleting — plus `lib/gemini.ts`'s `generateDoubtAnswer`/`analyzeDoubtPatterns`/`chatWithAI` and `lib/textbook-search.ts`, all left with no callers). Full code + `EXTRACTION-137.md` preserved on `feature/137-remove-ask-a-doubt`. DB schema untouched.

### 2026-09-20 — Removed Homework/Tasks from dev, pending rework (#136)
**Type:** Removal
**Portal:** Teacher / Student
**Summary:** Pulled the Homework/Tasks feature out of `dev` — feature flag, `/api/tasks` routes, `Tasks.tsx`/`TasksPage.tsx`/`TaskReview.tsx`/`StudentTasks.tsx`, and surgical edits to ClassView, StudentDashboard, StudentDetail, TeachersManagement, AcademicAnalytics, DailyBriefing, rewards copy, and marketing text. Also removed `app/api/students/[id]/submissions` (task-submissions only, found during cleanup, no other use) and the orphaned `suggestHomework()` in `lib/gemini.ts`. Full code + `EXTRACTION-136.md` preserved on `feature/136-remove-homework-tasks`. DB schema untouched — `tasks`/`task_submissions`/`task_reminders` stay as inert scaffolding.

### 2026-09-18 — OpenAPI spec covers every API route (#131)
**Type:** Enhancement
**Portal:** Platform Admin / Infrastructure
**Summary:** Regenerated `DOCS/openapi.json` for all 247 routes (362 operations) with auth, parameters and bodies; fixed the `/api/openapi` path bug. `/api-docs` now uses Scalar with 9 sections, 43 subcategories and who-can-call badges, and is public with no sign-in.
**PR:** #132

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
