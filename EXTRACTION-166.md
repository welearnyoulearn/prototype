# Extraction Plan — Teacher Lesson Planner (issue #166)

Purpose: this branch (`feature/166-teacher-lesson-planner`) is the **preservation copy** of the Teacher Lesson Planner feature exactly as it existed on `dev` before it was removed (see the removal PR that closes #166). No code is removed here — only this plan was added. Do **not** merge this branch as-is: it would re-add a feature that was deliberately taken out of `dev` because it was unstable / not fully implemented.

## Why it was removed
The screens are not reachable from any menu, and the API routes they call do not exist on `dev` (they return 404). `dev` was cleaned down to features that work end to end.

## 1. Files that belong to this feature
- app/teacher/components/LessonPlanner.tsx  (unreachable — no menu or screen imports it)

## 2. API routes it uses
- `/api/ai/lesson-plan` (does not exist on dev)

## 3. Database
- Tables: none of its own.
- **Database:** tables are intentionally NOT dropped by the removal (schema history is never rewritten; migrations only add). They remain in `lib/db.ts` and simply have no UI/API on dev.

## 4. Shared code that was touched by the removal
- `lib/gemini.ts` — `LessonPlan` and `generateLessonPlan` (AI generator).

## 5. Platform-Admin feature config
- **When restored, register it as its own Platform-Admin feature:** add `{ key: 'lesson-planner', label: 'Lesson Planner', category: 'Scheduling', portals: ['teacher'] }` to `ALL_FEATURES` in `lib/features.ts`, a `plan_features` seed, a teacher nav item gated by it, a doc in `wiki/features/`, and an entry in `wiki/features/feature-map.json`.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/166-teacher-lesson-planner -- <the files listed in section 1>` (or cherry-pick from this branch).
2. Restore the missing API routes (they exist in git history before commit `046992f`, "wlylV1 — core school management platform (stripped for production)").
3. Re-apply the shared-code edits reversed (section 4).
4. Add the feature config / nav / docs described in section 5 (if any), run `node scripts/product-docs.mjs` if it exists on `dev`, and add an end-to-end test before merging.
