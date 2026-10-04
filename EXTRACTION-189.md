# Extraction Plan — Student-Teacher Analysis (issue #189)

Purpose: this branch (`feature/189-student-teacher-analysis`) is the **preservation copy** of Student-Teacher Analysis exactly as it existed on `dev` before it was removed (see the removal PR that closes #189). No code is removed here — only this plan was added. Do **not** merge as-is: it would re-add a feature that was taken out of `dev` because it was not reachable.

## Why it was removed
Nothing in the app links to it, so the Platform Admin toggle enabled a feature no one could open. `dev` is being cleaned down to features a user can actually reach.

## 1. Files that belong to this feature
- app/school-admin/components/StudentTeacherAnalysis.tsx  (students by class-section and grade, teachers by department; not linked from any menu)

## 2. API routes
- none of its own — it counts what `GET /api/students` and `GET /api/teachers` return

## 3. Database
- Tables: `students`, `teachers`, `classes`.
- **Database:** tables are intentionally NOT dropped (schema history is never rewritten; migrations only add). They stay in `lib/db.ts` and simply have no screen on dev.

## 4. Platform-Admin feature config
- The feature key was removed from `lib/features.ts` (`ALL_FEATURES`) with the removal. When restored, add it back:
  `{ key: 'analysis', label: 'Student–Teacher Analysis', category: 'Analytics', portals: ['school-admin'] }`
  plus a `plan_features` seed row, nav gating, a doc in `wiki/features/`, and (if `wiki/features/feature-map.json` exists on dev) an entry there.

## 5. Notes for whoever restores it
- It is a headcount view, not a performance analysis. Rebuild as real student-vs-teacher performance (marks by teacher/subject) if it is wanted again.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/189-student-teacher-analysis -- <the files in section 1>`.
2. Wire it into the sidebar (see the notes above).
3. Re-add the feature key and nav item (section 4), add an end-to-end test, and open a PR.
