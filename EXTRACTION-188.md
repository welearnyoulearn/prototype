# Extraction Plan — Daily Briefing (issue #188)

Purpose: this branch (`feature/188-daily-briefing`) is the **preservation copy** of Daily Briefing exactly as it existed on `dev` before it was removed (see the removal PR that closes #188). No code is removed here — only this plan was added. Do **not** merge as-is: it would re-add a feature that was taken out of `dev` because it was not reachable.

## Why it was removed
Nothing in the app links to it, so the Platform Admin toggle enabled a feature no one could open. `dev` is being cleaned down to features a user can actually reach.

## 1. Files that belong to this feature
- app/school-admin/components/DailyBriefing.tsx  (the morning summary screen; not linked from any menu)
- app/api/admin/briefing/route.ts  (`GET /api/admin/briefing` — works and is school-admin only; removed from dev with the screen)

## 2. API routes
- `GET /api/admin/briefing` — exists on this branch (school admin only, school from the login). Removed from dev together with the screen.

## 3. Database
- Tables: reads `attendance`, `attendance_sessions`, `classes`, `exam_records`, `school_topic_progress` / `school_topics`, `announcements`, `students`.
- **Database:** tables are intentionally NOT dropped (schema history is never rewritten; migrations only add). They stay in `lib/db.ts` and simply have no screen on dev.

## 4. Platform-Admin feature config
- The feature key was removed from `lib/features.ts` (`ALL_FEATURES`) with the removal. When restored, add it back:
  `{ key: 'briefing', label: 'Daily Briefing', category: 'Analytics', portals: ['school-admin'] }`
  plus a `plan_features` seed row, nav gating, a doc in `wiki/features/`, and (if `wiki/features/feature-map.json` exists on dev) an entry there.

## 5. Notes for whoever restores it
- The route already follows the shared attendance rules (late = attended, holidays excluded) and is covered by `e2e/workflow-attendance.spec.ts` on this branch (the checks were removed from dev with the route).
- To bring it back properly: add a "Daily Briefing" entry to the school-admin sidebar (nav item + gate by the `briefing` feature) — the screen itself is ready.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/188-daily-briefing -- <the files in section 1>`.
2. Wire it into the sidebar (see the notes above).
3. Re-add the feature key and nav item (section 4), add an end-to-end test, and open a PR.
