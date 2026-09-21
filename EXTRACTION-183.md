# Extraction Plan — Class Analytics and the Student Management performance tab (issue #183)

Purpose: this branch (`feature/183-class-analytics-and-student-performance`) is the **preservation copy** of Class Analytics and the Student Management performance tab exactly as it existed on `dev` before it was removed (see the removal PR that closes #183). No code is removed here — only this plan was added. Do **not** merge as-is: it would re-add a feature that was taken out of `dev` because its backend no longer exists.

## Why it was removed
Nothing in the app links to it, and the API route it needs does not exist on `dev` (calls return 404). `dev` is being cleaned down to features that work end to end.

## 1. Files that belong to this feature
- app/school-admin/components/ClassAnalytics.tsx  (per-class performance and timetable-health panels; unreachable)
- app/school-admin/components/StudentsManagement.tsx — the **"performance" tab** of the student detail panel: `detailTab`, `StudentPerf` / `StudentRewards` types, `loadStudentPerformance`, the attendance / tasks / score / engagement / rank tiles and the rewards summary

## 2. API routes
- `GET /api/classes/{id}/performance?school_id=&days=` — does NOT exist on dev (removed in `046992f`)
- `GET /api/class-timetable/health` — belongs to the timetable feature (branch `feature/175-timetable-full-workflow`)

## 3. Database
- Tables: reads `exam_marks`, `attendance`, `students`, `class_subjects`.
- **Database:** tables are intentionally NOT dropped (schema history is never rewritten; migrations only add). They stay in `lib/db.ts` and simply have no screen on dev.

## 4. Platform-Admin feature config
- The feature key was removed from `lib/features.ts` (`ALL_FEATURES`) with the removal. When restored, add it back:
  `{ key: 'class-analytics', label: 'Class Analytics', category: 'Analytics', portals: ['school-admin'] }`
  plus a `plan_features` seed row, nav gating, a doc in `wiki/features/`, and (if `wiki/features/feature-map.json` exists on dev) an entry there.

## 5. Notes for whoever restores it
- Why removed: it overlaps the new attendance dashboards (school → class → student) and the **Student 360 profile** (marks, attendance, fees, activity per student), and its main data route no longer exists.
- If rebuilt, make it "marks & class performance" analytics on exam data plus the shared attendance rules, and reuse the student profile instead of a second per-student tab.
- The unauthenticated `GET /api/students/{id}/rewards` route the performance tab used was deleted separately (see the leaderboard removal, #180).

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/183-class-analytics-and-student-performance -- <the files in section 1>`.
2. Rebuild the missing route (the old handler is in git history before commit `046992f`, but it predates the security hardening — add a sign-in check, school scoping and Zod validation).
3. Re-add the feature key and nav item (section 4), add an end-to-end test, and open a PR.
