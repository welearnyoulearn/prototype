# Extraction Plan — Notification Center (issue #190)

Purpose: this branch (`feature/190-notification-center`) is the **preservation copy** of Notification Center exactly as it existed on `dev` before it was removed (see the removal PR that closes #190). No code is removed here — only this plan was added. Do **not** merge as-is: it would re-add a feature that was taken out of `dev` because it was not reachable.

## Why it was removed
Nothing in the app links to it, so the Platform Admin toggle enabled a feature no one could open. `dev` is being cleaned down to features a user can actually reach.

## 1. Files that belong to this feature
- app/school-admin/components/NotificationCenter.tsx  (full notification history for the school, grouped by date; not linked from any menu)

## 2. API routes
- `GET /api/notifications?recipient_school_id=` — still exists on dev (the header notification bell uses it)

## 3. Database
- Tables: `notifications`.
- **Database:** tables are intentionally NOT dropped (schema history is never rewritten; migrations only add). They stay in `lib/db.ts` and simply have no screen on dev.

## 4. Platform-Admin feature config
- The feature key was removed from `lib/features.ts` (`ALL_FEATURES`) with the removal. When restored, add it back:
  `{ key: 'notifications', label: 'Notification Center', category: 'Communication', portals: ['school-admin'] }`
  plus a `plan_features` seed row, nav gating, a doc in `wiki/features/`, and (if `wiki/features/feature-map.json` exists on dev) an entry there.

## 5. Notes for whoever restores it
- Only the history PAGE and the feature key were removed. The notification bell (`app/components/NotificationBell.tsx`) and `/api/notifications` stay on dev.
- To bring it back: add a "Notifications" sidebar item that opens this screen and gate it with the `notifications` feature.

## 6. How to bring it back
1. Branch from the latest `dev`, then `git checkout feature/190-notification-center -- <the files in section 1>`.
2. Wire it into the sidebar (see the notes above).
3. Re-add the feature key and nav item (section 4), add an end-to-end test, and open a PR.
