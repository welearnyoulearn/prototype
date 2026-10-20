# In Progress

Move an entry to [completed.md](completed.md) when it ships. Add new entries at the top.

---

### Push notifications via Firebase (FCM)
**Type:** Feature
**Branch:** `feature/fcm-push-backend` (no GitHub issue yet — branch to be renamed with the issue number)
**Summary:** Push for the web app and the parent app. Backend done: `device_tokens`, `/api/devices`, `lib/push.ts` sender and dispatcher, `/api/cron/push-dispatch`.
**Progress:**
- [x] device_tokens table, push_sent_at outbox column, register/unregister endpoints
- [x] FCM sender and dispatcher; wired into `POST /api/notifications`
- [x] Call `dispatchPendingPushes()` / `drainPendingPushes()` from every notification-creating route and cron
- [x] Web: `firebase-messaging-sw.js`, "Turn on" prompt in NotificationBell, token registered on enable/visit and removed on logout (all four portals). Needs a real Firebase project to test end to end.
- [x] Parent mobile app (Expo, #133): `/api/parent/push/expo` on `device_tokens`, Expo sender in the same dispatcher
- [ ] `FIREBASE_SERVICE_ACCOUNT` in Vercel; real-phone test of the mobile app on a development or Play build

### Product documentation dossiers (this branch)
**Type:** Docs
**Summary:** One deep, code-verified dossier per feature (product brief, end-to-end flow, business rules, developer reference, pitch kit) plus platform architecture, roles/plans and a deck storyline, in `docs/product/features/`. Old, stale docs were removed; the factbook and wiki summaries were corrected against the code.
**Progress:**
- [x] 19 feature dossiers + Teacher and Platform Admin portal dossiers
- [x] Architecture, roles/access/plans, deck storyline
- [x] Stale docs removed; factbook, wiki, tasks refreshed
- [ ] Founder fills the `[TBD – founder]` items (traction, pricing, funding, team)

### UI overhaul — shared portal design layer
**Type:** Feature (UI)
**Portals:** all five
**Status:** Uncommitted on `dev` (`app/portal.css`, `components/portal/`, restyled Overview/dashboards, `components/ui/*`).
**Tracker:** [`UI_PROGRESS.md`](../../UI_PROGRESS.md)
