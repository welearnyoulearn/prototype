# Planned Tasks

Upcoming features and improvements. Not yet started. Move to [in-progress.md](in-progress.md) when work begins.

---

## Features Not Yet Built

These are defined in `lib/features.ts` but have no implementation:

### School Health Score
**Portal:** School Admin — Analytics
**Description:** Composite score combining attendance %, marks averages, task completion rate, and fee collection percentage into a single school health metric.
**Feature key:** `school-health`

### Syllabus Predictor
**Portal:** School Admin — Analytics
**Description:** AI-powered prediction of syllabus completion date based on current teaching pace and topic coverage.
**Feature key:** `syllabus-predictor`

### Anonymous Class Pulse
**Portal:** School Admin — Communication
**Description:** Anonymous student feedback system for class experience. Students submit feelings/ratings without teacher knowing who submitted.
**Feature key:** `class-pulse`

### Report Cards
**Portal:** School Admin — Tools
**Description:** Generate and print formatted report cards per student per exam. DB tables exist (`report_card_config`, `report_card_remarks`), API partially built, no UI.
**Feature key:** `report-cards`

---

## Removed From `dev`, Rework Pending

These four features were fully working but pulled out of `dev` on 2026-09-20
for a rework. Each has its full original code plus an `EXTRACTION-<N>.md`
removal plan preserved on its own branch — pull from there rather than
rebuilding from scratch.

### Homework / Tasks (#136)
**Branch:** `feature/136-remove-homework-tasks`
**Feature key:** `homework` (removed from `lib/features.ts`; DB tables `tasks`/`task_submissions`/`task_reminders` still exist)

### Ask a Doubt (#137)
**Branch:** `feature/137-remove-ask-a-doubt`
**Feature key:** `doubts` (removed from `lib/features.ts`; DB tables `doubts`/`doubt_messages`/`doubt_upvotes` still exist)

### Leave Requests (#139)
**Branch:** `feature/139-remove-leave-requests`
**Feature key:** `leave-requests` (removed from `lib/features.ts`; DB table `leave_requests` still exists — Emergency Cover's uncovered-periods query still joins against it)

### Emergency Cover (#140)
**Branch:** `feature/140-remove-emergency-cover`
**Feature key:** `emergency-cover` (removed from `lib/features.ts`; DB table `substitute_assignments` still exists; `/api/substitutes` GET was kept read-only for the Attendance dashboard and a few teacher views, POST/DELETE removed)

---

### Timetable - full workflow (removed from dev, #176)
**Portal:** School Admin / Teacher / Student / Parent
**Branch:** `feature/175-timetable-full-workflow` (draft PR #177) - working end to end (11 tests) and secured; see `wiki/features/timetable-workflow.md` there. The feature key `timetable` returns to `lib/features.ts` when it is merged back.

### Also removed from `dev` on 2026-09-21 (unstable / unreachable — each preserved on its own branch)
- **Student Learning Hub & Daily Knowledge** (#164) — `feature/164-student-learning-hub-daily-knowledge` (draft PR #169). Student-independent: not a feature-config key.
- **Rewards Marketplace** — student, parent, admin (#165) — `feature/165-rewards-marketplace` (draft PR #170). Student-independent: not a feature-config key.
- **Teacher Lesson Planner** (#166) — `feature/166-teacher-lesson-planner` (draft PR #171). Own feature key `lesson-planner` when restored.
- **Teacher Class Performance** (#167) — `feature/167-teacher-class-performance` (draft PR #172). Own feature key `class-performance` when restored.
- **Weekly Test** (#168) — `feature/168-weekly-test` (draft PR #173). Own feature key `weekly-test` when restored.
- **Display / TV kiosk** (#163) — deleted permanently, no branch.

## Partial Features to Complete

### Student Auth — Proper Login
**Portal:** Student
**Description:** Replace demo dropdown with a real login form (student ID + password). Add JWT session.

### Parent Auth — Persistent Login
**Portal:** Parent
**Description:** Add JWT-based session for parents instead of lookup-per-visit. Proper login form with phone + password.

### Mark Acknowledgement UI
**Portal:** Parent
**Description:** Surface the mark acknowledgement feature prominently in the parent portal. API and DB exist.

### Subject Templates Auto-Apply
**Portal:** School Admin
**Description:** Wire up subject templates to auto-apply when creating new classes. API and DB are ready.

### Teacher Performance Analytics
**Portal:** Teacher
**Description:** Build the performance analytics component. Navigation item exists but flagged `comingSoon`.

### Weekly Test (removed from dev, #168)
**Portal:** Student / Teacher
**Branch:** `feature/168-weekly-test` (draft PR #173) — see `EXTRACTION-168.md` there. When restored it becomes its own Platform-Admin feature (`weekly-test`).
