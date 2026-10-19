# Extraction Plan — Teacher Class Performance (issue #167)

Purpose: this branch (`feature/167-teacher-class-performance`) is the **preservation copy** of the Teacher Class Performance feature exactly as it existed on `dev` before it was removed (see the removal PR that closes #167). No code is removed here — only this plan was added. Do **not** merge this branch as-is: it would re-add a feature that was deliberately taken out of `dev` because it was unstable / not fully implemented.

## Why it was removed
The screens are not reachable from any menu, and the API routes they call do not exist on `dev` (they return 404). `dev` was cleaned down to features that work end to end.

## 1. Files that belong to this feature
- app/teacher/components/ClassPerformance.tsx  (unreachable — no menu or screen imports it)

## 2. API routes it uses
- `/api/classes/{id}/performance` (does not exist on dev)

## 3. Database
- Tables: none of its own (reads marks, attendance).
- **Database:** tables are intentionally NOT dropped by the removal (schema history is never rewritten; migrations only add). They remain in `lib/db.ts` and simply have no UI/API on dev.

## 4. Shared code that was touched by the removal
- NOTE: the school-admin **Class Analytics** screen and the **Student Management → performance tab** call the same missing `/api/classes/{id}/performance`. Those are separate, Platform-Admin features (`class-analytics`, `students`) and are NOT touched by this extraction — restoring this route would fix all three.

## 5. Platform-Admin feature config
- **When restored, register it as its own Platform-Admin feature:** `{ key: 'class-performance', label: 'Class Performance', category: 'Analytics', portals: ['teacher'] }` in `lib/features.ts`, plus `plan_features`, nav gating, doc and `feature-map.json` entry.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/167-teacher-class-performance -- <the files listed in section 1>` (or cherry-pick from this branch).
2. Restore the missing API routes (they exist in git history before commit `046992f`, "wlylV1 — core school management platform (stripped for production)").
3. Re-apply the shared-code edits reversed (section 4).
4. Add the feature config / nav / docs described in section 5 (if any), run `node scripts/product-docs.mjs` if it exists on `dev`, and add an end-to-end test before merging.
