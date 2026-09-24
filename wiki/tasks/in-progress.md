# In Progress

Move an entry to [completed.md](completed.md) when it ships. Add new entries at the top.

---

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

### API authentication guards (security)
**Type:** Bug fix
**Summary:** State-changing routes found with no session check: plan/subscription update, announcements create/edit/delete, textbooks upload/delete, several `/api/platform/*` routes. Listed in `docs/KNOWN_ISSUES.md` (#131) and `docs/product/features/00-platform-architecture.md` §12.1.
**Progress:**
- [ ] Log a GitHub issue, branch `fix/<n>-api-auth-guards`
- [ ] Add guards + e2e tests proving anonymous and cross-school calls are refused
