# In Progress

Move an entry to [completed.md](completed.md) when it ships. Add new entries at the top.

---

### Rewards Marketplace (pilot) (#486)
**Type:** Feature
**Portals:** Student, Parent, School Admin, Platform Admin
**Branch:** `feature/486-rewards-marketplace` (stacked on PR #485, the newspaper)
**Summary:** Students and parents spend points (one balance with the quiz and newspaper) on cheap stationery; WLYL ships one parcel per school per month; the school admin hands items out. OFF at every tier.
**Progress:**
- [x] Catalog, ordering, monthly run, Sent, Parcel arrived, Collected, Can't deliver, order alert email, four screens
- [x] Tests: service, ledger and end to end (`e2e/newspaper-rewards.spec.ts`)
- [ ] Review and merge after #485
- [ ] Real supplier prices; `REWARDS_ALERT_EMAIL` in production

### Daily Newspaper (pilot) (#484)
**Type:** Feature
**Portals:** Student, Platform Admin
**Branch:** `feature/484-newspaper-rewards-marketplace` (PR #485); the Rewards Marketplace is a separate PR
**Summary:** A short, real, fact-checked newspaper each morning per grade band, with one question; points go into the same balance as the Daily Quiz. OFF at every tier.
**Progress:**
- [x] Feature key (OFF), tables, points helper, grade bands
- [x] Feed fetch, filter, writer, blind checker, fallback, 04:00 build and 07:00 reminder, student screen, Today dial task, Platform Admin Pull page
- [x] Tests: unit, database and end to end (`e2e/newspaper.spec.ts`)
- [ ] Review and merge
- [ ] Live dry run with GROQ_API_KEY and the real feeds; set CRON_SECRET in production

### Daily Quiz + Student Doubts (#430)
**Type:** Feature (epic)
**Portals:** School Admin, Teacher, Student, Parent
**Branch:** `feature/431-learning-feature-keys` (P0)
**Started:** 2026-10-27
**Summary:** Daily MCQ quiz per class from covered topics (bank prepared once), class leaderboard, parent summaries; wrong answers become tracked doubts that only the student can mark clarified, escalated after 2 working days. Plan: issues #431–#438.
**Progress:**
- [x] Issues created (#430 epic, #431–#438)
- [x] P0 #431: feature keys `daily-quiz` / `student-doubts` (OFF), Learning category, docs (PR #439)
- [x] P1 #432 question bank: Platform Admin → Question Bank (Claude batch + Groq check, review, publish), teacher Quiz Questions view, student report endpoint (`feature/432-quiz-question-bank`)
- [x] P2 #433 daily quiz: posting per class, student + parent quiz screens, answers after the close, late for 7 days, ready/reminder/results notices, Platform Admin → Daily Quiz settings (`feature/433-daily-quiz`)
- [x] P3 #434 points ledger, working-day streak, badges, weekly leaderboard, parent view + weekly report, School Admin report (`feature/434-quiz-points-leaderboard`)
- [x] P4 #435 doubts: Ask WLYL AI → Ask Teacher, teacher Doubts (misconceptions, covered in class, replies), proof question, points + WLYL Stars, parent timeline, School Admin report (`feature/435-student-doubts`)
- [x] #444 questions made at syllabus import (8 per topic, auto-published), subject language, schools' own topics, daily topic = completed since the last quiz else revision (`feature/444-quiz-questions-at-import`)
- [ ] Next: P5 #436 SLA · P6 #437 insights · P7 #438 AI hook

### Student AI tutor — RAG over board textbooks (#407)
**Type:** Feature
**Branch:** `feature/407-student-rag-tutor`
**Portals:** Student (AI Hub, AI Pro tier)
**Summary:** Students ask questions in AI Hub and get answers (via OmniRoute: `ddgw/claude-haiku-4-5` → `ddgw/gpt-5.4-mini` fallback) grounded in their board + grade textbooks/handbooks (`master_subject_materials`, PDFs in R2), cited by book and page. Chats saved to `ai_chat_sessions` (parent-visible). 60 questions/student/IST day.
**Progress:**
- [x] pgvector + `material_chunks`; `scripts/index-materials.ts` (R2 → pages → chunks → embeddings); dry run on 2 PDFs OK
- [x] Hybrid retrieval (vector + keyword, RRF) in `lib/rag/retrieve.ts`
- [x] `/api/student/tutor` (NDJSON stream) and `StudentTutorChat` in the AI Pro branch of AI Hub
- [x] Tutor LLM via OmniRoute with ordered key × model fallback (`lib/tutor.ts`); Anthropic SDK removed
- [x] Embeddings optional — keyword-only retrieval and NULL-embedding indexing when `EMBEDDINGS_*` is unset (schema v58)
- [x] Embeddings via Cloudflare Workers AI `@cf/baai/bge-m3` (1024 dims), superseding Gemini; fail-fast on the daily quota (`EmbeddingQuotaError`), resumable index script
- [x] Garbled legacy-font text filtered in the chunker (`dropLegacyFontWords`, `wordShare`)
- [x] Full index run and embeddings backfilled; `material_chunks` recreated and re-indexed after the 2026-10-24 drop
- [x] OmniRoute gateway verified locally (`ddgw/claude-haiku-4-5` → `ddgw/gpt-5.4-mini`)
- [ ] `OMNIROUTE_BASE_URL` / `OMNIROUTE_API_KEYS` (and `EMBEDDINGS_*`) in the deploy env
- [ ] Run `e2e/student-tutor.spec.ts` against a non-production DB
- [ ] Open the PR
- [ ] Set `schools.board` for schools (231 of 234 are NULL → those schools get no retrieval unless they have subscribed subjects)

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
