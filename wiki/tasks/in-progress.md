# In Progress

Move an entry to [completed.md](completed.md) when it ships. Add new entries at the top.

---

### Daily Newspaper + Rewards Marketplace (pilot)
**Type:** Feature
**Portals:** Student, Parent, School Admin, Platform Admin
**Branch:** `feature/newspaper-rewards-foundation` (no GitHub issue yet — branch to be renamed with the issue number)
**Summary:** A short, real, fact-checked newspaper each morning per grade band, with one question; points go into the same balance as the Daily Quiz and are spent on simple stationery supplied by WLYL and handed out by the school admin. Monthly delivery. Both feature keys are OFF at every tier.
**Progress:**
- [x] Foundation: feature keys (OFF), tables, starter catalog, points helper (earn / spend / refund under a per-student lock), grade-band helper, tests
- [x] Newspaper: feed fetch, filter, writer, blind checker, fallback, jobs, student screens, Platform Admin Pull page (not yet run against the real Groq API or live feeds; tested with a fake model and fake feeds)
- [ ] Marketplace: ordering, monthly run, order alert email, parcel arrived / collected, Rewards pages
- [ ] End-to-end test on a throwaway local database
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
### Usage credits & real WhatsApp sending (#358, #359)
**Type:** Feature
**Portals:** Platform Admin, School Admin
**Branch:** `feature/358-usage-credits-whatsapp`
**Summary:** 1 credit = 1 WhatsApp message Meta accepts. Usage is metered per school per calendar month; extra messages beyond the plan are billed on a monthly bill the platform admin closes; sending pauses at a per-school monthly limit. `lib/whatsapp.ts` sends for real through the Meta Cloud API when the platform credentials are set, with a delivery-status webhook.
**Progress:**
- [x] Usage tracking for every school (`lib/usage.ts`): WhatsApp, AI tokens/requests, emails, exports; daily totals; no double counting
- [x] Service prices per plan (apply from next month), per-school own prices, monthly limits, 80%/100% emails
- [x] Real send + `/api/whatsapp/webhook`; login/password messages never blocked by the limit
- [x] Platform Admin → Billing (Usage tab, school drawer) and Plans & Pricing → Service prices on real data; School Admin usage on real data
- [x] Bills: automatic run on the 1st (06:00 IST cron, safe to repeat), part payments, adjustments on the next bill, overdue reminders every 7 days, GST 18%
- [x] Plan prices (monthly/yearly), agreed price + reason per school, plan bills on term start/renewal, mid-term upgrade charged for remaining days, downgrades start at renewal
- [x] File uploads (feedback voice, study materials, expense bills) and API requests counted; emails counted per school
- [x] Traffic: busiest hours, Cloudflare Web Analytics on public pages, school admin's own traffic page
- [ ] Not counted yet: school logo and platform curriculum uploads (their screens don't send the file size)
- [ ] Hosting off Vercel Hobby before the first school is charged (needs an account decision, see the platform handoff)
- [ ] Meta business verification + template approval (team, outside code)

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
