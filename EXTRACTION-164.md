# Extraction Plan — Student Learning Hub & Daily Knowledge (issue #164)

Purpose: this branch (`feature/164-student-learning-hub-daily-knowledge`) is the **preservation copy** of the Student Learning Hub & Daily Knowledge feature exactly as it existed on `dev` before it was removed (see the removal PR that closes #164). No code is removed here — only this plan was added. Do **not** merge this branch as-is: it would re-add a feature that was deliberately taken out of `dev` because it was unstable / not fully implemented.

## Why it was removed
The screens are not reachable from any menu, and the API routes they call do not exist on `dev` (they return 404). `dev` was cleaned down to features that work end to end.

## 1. Files that belong to this feature
- app/student/components/StudentHub.tsx  (Learning Hub shell)
- app/student/components/hub/ChessGame.tsx, app/student/components/hub/SudokuGame.tsx  (games inside the hub)
- app/student/components/StudentNewspaper.tsx  (Daily Knowledge: article + quiz)

## 2. API routes it uses
- `/api/hub/daily`, `/api/hub/complete`, `/api/hub/debate-score`, `/api/hub/writing-score`
- `/api/newspapers/today`, `/api/newspapers/{id}/read`
- (none of these exist on dev — they were removed earlier in `046992f`; restore them from history if needed)

## 3. Database
- Tables: `hub_daily_content`, `student_hub_completions`, `daily_newspapers`, `student_newspaper_reads`.
- **Database:** tables are intentionally NOT dropped by the removal (schema history is never rewritten; migrations only add). They remain in `lib/db.ts` and simply have no UI/API on dev.

## 4. Shared code that was touched by the removal
- `lib/gemini.ts` — `generateNewspaper`, `GeminiNewspaper`, `NEWSPAPER_CATEGORIES` (AI article generator).
- `lib/rewards.ts` — the `newspaper_*` point constants and the `reader_5` / `reader_20` badges are **left in place** (earned points/badges in the database still reference them).

## 5. Platform-Admin feature config
- **Not a Platform-Admin feature.** It is a student-independent feature, so it must NOT be added to `lib/features.ts` when restored.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/164-student-learning-hub-daily-knowledge -- <the files listed in section 1>` (or cherry-pick from this branch).
2. Restore the missing API routes (they exist in git history before commit `046992f`, "wlylV1 — core school management platform (stripped for production)").
3. Re-apply the shared-code edits reversed (section 4).
4. Add the feature config / nav / docs described in section 5 (if any), run `node scripts/product-docs.mjs` if it exists on `dev`, and add an end-to-end test before merging.
