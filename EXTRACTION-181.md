# Extraction Plan — Year-in-Review Report (issue #181)

Purpose: this branch (`feature/181-year-in-review`) is the **preservation copy** of Year-in-Review Report exactly as it existed on `dev` before it was removed (see the removal PR that closes #181). No code is removed here — only this plan was added. Do **not** merge as-is: it would re-add a feature that was taken out of `dev` because its backend no longer exists.

## Why it was removed
Nothing in the app links to it, and the API route it needs does not exist on `dev` (calls return 404). `dev` is being cleaned down to features that work end to end.

## 1. Files that belong to this feature
- app/school-admin/components/YearReview.tsx  (the report screen; unreachable — no menu imports it)

## 2. API routes
- `GET /api/year-review?school_id=&academic_year=` — does NOT exist on dev (removed in `046992f`; the old handler is in git history before that commit)
- `/api/academic-year/current`, `/api/academic-years` — exist

## 3. Database
- Tables: reads `academic_years`, `attendance`, `attendance_sessions`, `exam_records` / `exam_marks`, `student_fee_ledger`, `student_class_history`, `students`.
- **Database:** tables are intentionally NOT dropped (schema history is never rewritten; migrations only add). They stay in `lib/db.ts` and simply have no screen on dev.

## 4. Platform-Admin feature config
- The feature key was removed from `lib/features.ts` (`ALL_FEATURES`) with the removal. When restored, add it back:
  `{ key: 'year-review', label: 'Year-in-Review Report', category: 'Administration', portals: ['school-admin'] }`
  plus a `plan_features` seed row, nav gating, a doc in `wiki/features/`, and (if `wiki/features/feature-map.json` exists on dev) an entry there.

## 5. Notes for whoever restores it
- When rebuilding, compute attendance with `lib/attendanceRules.ts` (late = attended; holidays excluded) and fees with the fee screens' balance formula (due − waiver − paid), so the report matches every other screen.
- It is a good management / board-meeting screen and a strong demo page, so it is worth rebuilding once the core features are settled.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/181-year-in-review -- <the files in section 1>`.
2. Rebuild the missing route (the old handler is in git history before commit `046992f`, but it predates the security hardening — add a sign-in check, school scoping and Zod validation).
3. Re-add the feature key and nav item (section 4), add an end-to-end test, and open a PR.
