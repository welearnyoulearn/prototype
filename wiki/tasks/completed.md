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

### 2026-09-21 — Removed all timetable from dev; full workflow moved to its own branch (#175, #176)
**Type:** Removal + Feature branch
**Portal:** School Admin / Teacher / Student / Parent
**Summary:** Timetable was half-present on `dev` (screens without their generation/publishing backend). It now lives only on `feature/175-timetable-full-workflow` (draft PR #177): the backend was restored, secured (the old routes had no sign-in checks) and covered by 11 end-to-end tests. Removed from `dev`: admin, teacher, student and parent screens, the class-management tab, overview timetable stats, the teacher dashboard schedule, the substitutes panel, the API routes and the `timetable` feature key. Tables are untouched.
**PR:** the chore PR that closes #176

### 2026-09-21 — Removed unstable, unreachable features from dev (#163–#168)
**Type:** Removal
**Portal:** Student / Parent / School Admin / Teacher / Kiosk
**Summary:** Deleted the Display/TV kiosk permanently (#163). Extracted five features to their own preservation branches and removed them from `dev`: Student Learning Hub & Daily Knowledge (#164), Rewards Marketplace (#165), Teacher Lesson Planner (#166), Teacher Class Performance (#167), Weekly Test incl. its weekly cron (#168). All were unreachable from any menu and called API routes that do not exist on `dev`. Database tables are untouched.
**PR:** the chore PR that closes #163–#168

### 2026-09-21 — Removed three unreachable admin features from dev (#188–#190)
**Type:** Removal
**Portal:** School Admin
**Summary:** Daily Briefing (screen + `/api/admin/briefing`), Student-Teacher Analysis and the Notification Center page were not linked from any menu, so their Platform Admin toggles opened nothing. Removed from `dev`, each preserved on its own branch (draft PRs #191–#193); feature keys `briefing`, `analysis`, `notifications` removed. The notification bell stays.
**PR:** the chore PR that closes #188–#190

### 2026-09-21 — Removed the analytics leftovers from dev (#180–#183)
**Type:** Removal
**Portal:** School Admin
**Summary:** Deleted the unreachable admin Student Leaderboard (#180) and the unauthenticated, now-unused `GET /api/students/{id}/rewards`. Extracted Year-in-Review (#181), Parent Engagement (#182) and Class Analytics + the Student Management performance tab (#183) to their own preserved branches (draft PRs #184–#186). The four feature keys were removed from `lib/features.ts`. Tables untouched.
**PR:** the chore PR that closes #180–#183

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
