# Extraction Plan — Weekly Test (student test, teacher results, weekly cron) (issue #168)

Purpose: this branch (`feature/168-weekly-test`) is the **preservation copy** of the Weekly Test (student test, teacher results, weekly cron) feature exactly as it existed on `dev` before it was removed (see the removal PR that closes #168). No code is removed here — only this plan was added. Do **not** merge this branch as-is: it would re-add a feature that was deliberately taken out of `dev` because it was unstable / not fully implemented.

## Why it was removed
The screens are not reachable from any menu, and the API routes they call do not exist on `dev` (they return 404). `dev` was cleaned down to features that work end to end.

## 1. Files that belong to this feature
- app/student/components/WeeklyTest.tsx  (student test screen; unreachable)
- app/teacher/components/WeeklyTestResults.tsx  (teacher results; unreachable)
- app/api/weekly-test/route.ts  (serve / submit a test)
- app/api/cron/weekly-test/route.ts  (Sunday job that generates each class's test) + its entry in `vercel.json` (`30 1 * * 0`)
- app/api/students/[id]/rewards/route.ts — the `weekly_tests` statistics block and query.
- app/student/components/StudentRewards.tsx — the weekly-test stats and the `weekly_test*` action labels.

## 2. API routes it uses
- `GET/POST /api/weekly-test`, `GET /api/cron/weekly-test` (exist on dev today)
- `/api/weekly-test/class-results`, `/api/ai/test-diagnosis` (do not exist on dev)

## 3. Database
- Tables: `weekly_tests`.
- **Database:** tables are intentionally NOT dropped by the removal (schema history is never rewritten; migrations only add). They remain in `lib/db.ts` and simply have no UI/API on dev.

## 4. Shared code that was touched by the removal
- `lib/gemini.ts` — `MCQQuestion`, `WeeklyTestContext`, `generateWeeklyTest`, `generateTestDiagnosis`.
- `lib/rewards.ts` — the `weekly_test*` point constants, the `test_first` / `test_5` / `test_perfect` badges and the streak logic are **left in place** (earned points/badges in the database reference them).
- `DOCS/openapi.json` — the `Weekly test` tag and the two paths above.

## 5. Platform-Admin feature config
- **When restored, register it as its own Platform-Admin feature:** `{ key: 'weekly-test', label: 'Weekly Test', category: 'Scheduling', portals: ['student', 'teacher'] }` in `lib/features.ts`, plus `plan_features`, nav gating, doc, `feature-map.json`, and re-add the cron to `vercel.json`.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/168-weekly-test -- <the files listed in section 1>` (or cherry-pick from this branch).
2. Restore the missing API routes (they exist in git history before commit `046992f`, "wlylV1 — core school management platform (stripped for production)").
3. Re-apply the shared-code edits reversed (section 4).
4. Add the feature config / nav / docs described in section 5 (if any), run `node scripts/product-docs.mjs` if it exists on `dev`, and add an end-to-end test before merging.
