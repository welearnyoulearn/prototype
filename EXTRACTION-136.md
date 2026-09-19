# Extraction Plan — Homework / Tasks (`homework`, issue #136)

Purpose: this file lists exactly what a human should remove from `dev` to
extract the Homework/Tasks feature. This branch (`feature/136-remove-homework-tasks`)
is the **preservation copy** — no code is removed here, only this plan and a
wiki note are added.

## 1. `lib/features.ts`
- Remove the `homework` entry from `ALL_FEATURES` (line 20).
- Remove the `'tasks': 'homework'` line from `PORTAL_NAV_KEY_ALIASES` (line 87).
- `homework` is not in `OVERRIDABLE_FEATURE_KEYS` — nothing to remove there.

## 2. `lib/db.ts`
- `tasks` table + indexes (`idx_tasks_class`, `idx_tasks_teacher`, `idx_tasks_status`, `idx_tasks_school`) — lines ~417-437, 2064-2068.
- `task_submissions` table + indexes — lines ~439-459.
- `task_reminders` table + index — lines ~461-471.
- `student_activity_log.task_id` FK (line ~490) and `task_view`/`task_submit` action types (line 1037, comment only — keep column, drop enum values only if truly unused elsewhere).
- `plan_features` seed row `('homework', ...)` at line 2151.
- **Do NOT touch** `master_tasks` (line 1486) or `school_tasks` (line 1555) — these back the Syllabus Customizer's chapter/topic "tasks" (a different concept: curriculum task templates), not the Homework feature. Keep them.

## 3. API routes — delete entirely
- `app/api/tasks/route.ts`
- `app/api/tasks/[id]/route.ts`
- `app/api/tasks/[id]/remind/route.ts`
- `app/api/tasks/[id]/submissions/route.ts`
- `app/api/tasks/[id]/submissions/[sid]/route.ts`
- `app/api/school/tasks/[id]/route.ts`

Keep `app/api/school/custom/tasks/route.ts` and `app/api/platform/tasks/route.ts` /
`app/api/platform/chapters/[id]/tasks/route.ts` — these serve the curriculum
`master_tasks`/`school_tasks` templates, not student homework submissions.

## 4. UI components
- `app/teacher/components/Tasks.tsx` — delete (the Homework tab body in `ClassView.tsx`).
- `app/teacher/components/TasksPage.tsx` — delete (currently unused/orphaned, no importer found).
- `app/teacher/components/TaskReview.tsx` — delete (only referenced by `Tasks.tsx`/`TaskReview.tsx` itself; confirm no other importer before deleting).
- `app/student/components/StudentTasks.tsx` — delete.
- `app/teacher/components/ClassView.tsx` — remove:
  - `import Tasks from './Tasks'`
  - `'Homework'` from `CLASS_TEACHER_TABS` / `SUBJECT_TEACHER_TABS` (lines 132-133)
  - `myTasks` state, the `/api/tasks` fetch, the Homework summary tile, "Recent Tasks" block, `onGoToTasks`/`homeworkPrefill` wiring, and the `activeTab === 'Homework'` render block (lines ~155-3269 per the grep above — trace each `myTasks`/`Homework`/`homeworkPrefill` reference in this file).
- `app/student/page.tsx` — remove the `StudentTasks` dynamic import, the `{ key: 'tasks', label: 'Homework', icon: '📝' }` nav entry, `'tasks'` from `RESTRICTABLE_NAV_KEYS`, the `{ key: 'tasks', ... }` quick-link, and the `visitedNav.has('tasks')` render block.
- `app/student/components/StudentDashboard.tsx` — remove `hasHomework` (`isNavItemVisible('tasks')`), the homework-pending banner copy, and the homework/task stat block gated by it (lines ~137-265).
- `app/student/components/StudentRewards.tsx` and `app/components/gamification/RewardsPanel.tsx` — remove the `task_submitted`/`task_scored_high` reward-event copy (cosmetic strings only; keep the rest of the rewards system).
- `app/components/FloatingAIChat.tsx` — check for homework-specific references only if any; otherwise this file is shared with Doubts (#137), see that plan before deleting.

## 5. Nav / other wiring
- `app/school-admin/page.tsx` — no direct `homework`/`tasks` nav item found (Homework is teacher/student only per `ALL_FEATURES.portals`); nothing to remove there.

## 6. e2e tests
- No dedicated homework/tasks Playwright spec found. `e2e/syllabus-audit.spec.ts` and `e2e/workflow-syllabus-audit.spec.ts` reference `master_tasks`/curriculum tasks only — keep as-is (curriculum feature, not Homework).

## Summary
Homework/Tasks is cleanly separable: one feature key, one pair of DB tables, five
`/api/tasks*` routes, and 2-3 dedicated components, with light gated wiring inside
`ClassView.tsx` (teacher) and `StudentDashboard.tsx`/`StudentRewards.tsx` (student).
Care must be taken not to confuse it with the visually-similar `master_tasks`/`school_tasks`
curriculum-builder tables and their `/api/platform/**tasks**` and
`/api/school/custom/tasks` routes, which are a different feature (Syllabus Customizer)
and must be kept.
