# Extraction Plan — Parent Engagement (issue #182)

Purpose: this branch (`feature/182-parent-engagement`) is the **preservation copy** of Parent Engagement exactly as it existed on `dev` before it was removed (see the removal PR that closes #182). No code is removed here — only this plan was added. Do **not** merge as-is: it would re-add a feature that was taken out of `dev` because its backend no longer exists.

## Why it was removed
Nothing in the app links to it, and the API route it needs does not exist on `dev` (calls return 404). `dev` is being cleaned down to features that work end to end.

## 1. Files that belong to this feature
- app/school-admin/components/ParentEngagement.tsx  (coverage by class, result acknowledgements, parents who have not acknowledged; unreachable)

## 2. API routes
- `GET /api/parent/engagement?school_id=` — does NOT exist on dev (removed in `046992f`)
- Related routes that DO exist: `POST /api/exams/{id}/acknowledge` (parent), `GET /api/exams/{id}/acknowledgements`, `POST /api/exams/{id}/nudge-parent`

## 3. Database
- Tables: `parent_mark_acks`, `parent_mark_ack_nudges`, `parents`, `student_parents`, `exam_records`.
- **Database:** tables are intentionally NOT dropped (schema history is never rewritten; migrations only add). They stay in `lib/db.ts` and simply have no screen on dev.

## 4. Platform-Admin feature config
- The feature key was removed from `lib/features.ts` (`ALL_FEATURES`) with the removal. When restored, add it back:
  `{ key: 'parent-engagement', label: 'Parent Engagement', category: 'Communication', portals: ['school-admin'] }`
  plus a `plan_features` seed row, nav gating, a doc in `wiki/features/`, and (if `wiki/features/feature-map.json` exists on dev) an entry there.

## 5. Notes for whoever restores it
- Smallest of the removed analytics features: the data and the acknowledge / nudge actions already work — only one summary route is missing.
- Purpose: prove parents saw the marks, and chase the ones who have not.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/182-parent-engagement -- <the files in section 1>`.
2. Rebuild the missing route (the old handler is in git history before commit `046992f`, but it predates the security hardening — add a sign-in check, school scoping and Zod validation).
3. Re-add the feature key and nav item (section 4), add an end-to-end test, and open a PR.
