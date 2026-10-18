# In Progress

Move an entry to [completed.md](completed.md) when it ships. Add new entries at the top.

---

### Expo push notifications for the parent mobile app (#133)
**Type:** Feature
**Branch:** `feature/133-expo-push-v2`
**Summary:** `expo_push_tokens` table, `POST/DELETE /api/parent/push/expo`, `lib/expoPush.ts`; every parent notification is also pushed to the app.
**Progress:**
- [x] Migration, route, sender, wiring at every parent notification site
- [x] e2e spec (`e2e/parent-push-expo.spec.ts`) and unit test (`lib/expoPush.test.ts`)
- [ ] Run e2e against a local/test database; verify a real push on a device build

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
