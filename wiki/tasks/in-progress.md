# In Progress

Move an entry to [completed.md](completed.md) when it ships. Add new entries at the top.

---

### Cloudflare Workers hosting — phase 1, workers.dev preview (#381)
**Type:** Infrastructure
**Branch:** `feature/381-cloudflare-deploy`
**Summary:** Run the app on Cloudflare Workers (OpenNext) against Supabase via Hyperdrive. Phase 1 stops at a workers.dev preview; DNS and the production cutover from Vercel are separate.
**Progress:**
- [x] OpenNext scaffolding, per-request `pg` pool, `scheduled()` handler for all 9 crons
- [x] Post-response emails / WhatsApp / log writes moved into `after()`
- [x] Textbook upload: `pdf-parse` → `unpdf`, no filesystem writes
- [ ] Hyperdrive config + wrangler secrets (needs Cloudflare dashboard / `wrangler login`)
- [ ] First workers.dev deploy, Playwright suite against it, connection count check
- [ ] Backup cron within Workers CPU/memory limits; restore without in-memory gunzip
- [ ] `next/image` on Workers; review in-isolate caches

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
