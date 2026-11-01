# Architecture Decision Records

Non-obvious technical decisions and their reasoning for the WLYL School prototype.

<!-- 
## YYYY-MM-DD — Decision title

**Context:** What situation prompted this decision?
**Decision:** What was decided and why?
**Alternatives considered:** What else was evaluated?
**Consequences:** What trade-offs come with this decision?
-->

## 2026-10-27 — AI tutor metered as questions (limit) and tokens (cost) (#441)

**Context:** The student AI tutor only logged its tokens. We need a per-school monthly limit and to know what each school costs us.

**Decision:** Two meters in the existing usage system. `tutor.question` is billable and carries the limit (10,000 a month per school by default, blocked at the cap, no extra charge), because schools think in questions. `tutor.tokens` is track-only and carries our cost (₹0.013 per 1,000 tokens: Claude Haiku at $0.10 in / $0.50 out per million, ~3,000 in + 400 out per question, ₹88/$), since what we pay varies with each question's length. Both are recorded once an answer is produced, including when the student stops it midway.

**Alternatives considered:** Reusing `ai.tokens` (rejected: it meters the Groq helpers with a token-based plan limit, a number schools can't reason about); one question meter with a flat cost (rejected: hides long syllabus answers and the rewrite call).

**Consequences:** The per-student daily limit (60) stays alongside the school limit. Query-rewrite tokens spent on a question that then fails are not recorded. Billing → Usage shows a per-school "Our cost" over every meter with a cost.


## 2026-10-20 — Student tutor RAG: pgvector in Supabase, OpenAI-compatible embeddings, Claude Haiku 5.5

**Context:** #407 needs answers grounded in 93 board textbook/handbook PDFs (~4.2 GB in R2). Existing `textbook_chunks` was keyword-only and empty.
**Decision:** Chunks + 1024-dim embeddings live in a new `material_chunks` table (pgvector HNSW + `simple` tsvector) next to the rest of the data, indexed offline by `scripts/index-materials.ts`. Retrieval fuses vector and keyword results (RRF), scoped by board + grade (+ subject, falling back to the whole grade). Embeddings go through any OpenAI-compatible `/embeddings` endpoint (default model `@cf/baai/bge-m3`, multilingual) so the provider (OmniRoute, Cloudflare Workers AI) is config, not code. Answers come from Claude Haiku 5.5, streamed, excerpts in the user turn, stable cached system prompt.
**Consequences:** No separate vector DB to run. Changing the embedding model to a non-1024-dim one needs a migration and full re-index. Scanned PDFs (no text layer) get `index_error` and are skipped — OCR is out of scope.
**Amended 2026-10-21:** There is no direct Anthropic key, so the tutor LLM goes through OmniRoute's OpenAI-compatible `/chat/completions` with an ordered key × model fallback (`OMNIROUTE_API_KEYS` × `TUTOR_MODELS`, default ddgw Claude Haiku 4.5 → GPT-5.4 mini); a route fails over on network error, non-2xx or an empty stream, but never once text has streamed. These models reject a system message, so the system prompt is folded into the first user turn (no prompt caching). Embeddings are optional: OmniRoute has no embedding model yet, so `material_chunks.embedding` is nullable and retrieval is keyword-only until an embedding provider is configured and the materials are re-indexed with `--force`.
**Amended 2026-10-21 (embeddings):** Embeddings come from Gemini `gemini-embedding-001` at 1024 dims (Matryoshka truncation via the `dimensions` param) through its OpenAI-compatible endpoint; 429s are retried (honouring `Retry-After`, else 60 s). Keyword-only chunks are backfilled by re-running the index script (no `--force` needed).
**Amended 2026-10-24:** Embeddings are now Cloudflare Workers AI `@cf/baai/bge-m3` (1024 dims, multilingual) through its OpenAI-compatible endpoint (`EMBEDDINGS_BASE_URL` / `EMBEDDINGS_API_KEY` / `EMBEDDINGS_MODEL`), superseding the Gemini `gemini-embedding-001` amendment; the code default in `lib/rag/embeddings.ts` is `@cf/baai/bge-m3`. The tutor LLM goes through the remote OmniRoute gateway (`OMNIROUTE_BASE_URL` ending in `/v1`, `OMNIROUTE_API_KEYS`); default models `ddgw/claude-haiku-4-5` then `ddgw/gpt-5.4-mini`, both verified working. The chunker (`lib/rag/chunk.ts`) filters garbled text from legacy non-Unicode-font PDFs: it drops tokens containing legacy-font characters (`dropLegacyFontWords`) and skips any chunk whose real-word share is below 0.5 (`wordShare`). On a Cloudflare 429 code 4006 ("daily free allocation") embeddings throw `EmbeddingQuotaError` at once and `scripts/index-materials.ts` stops the run; re-running resumes. The free tier is 10,000 neurons/day — enough for live student questions (one short embedding each), but a full re-index of all books may need two days or the $5/month Workers Paid plan.

## 2026-11-01 — Daily Newspaper + Rewards Marketplace: one points ledger, real stories, WLYL-run supply chain

**Context:** The founder wants a short daily newspaper that makes students want to read, and a way to spend reward points on simple stationery, without much running cost or operational load. The Daily Quiz (separate branch) also awards points. Earlier versions of both features (preserved branches #169, #170) were removed from `dev` as unreachable and insecure (client-supplied ids, an unauthenticated delivery endpoint, AI-only "news").

**Decision:**
- **One ledger.** All points live in `student_points`; the balance is the sum; spending is a negative row and a refund a positive row. Each feature adds its own partial unique index (`uq_student_points_news`, `uq_student_points_market`) and never touches the quiz's. Spending takes a per-student advisory lock.
- **Real stories, never AI-only.** Notes are written only from allow-listed feed text and accepted only if a blind second model call finds no unsupported claim and reaches the same answer; otherwise a one-note fallback from the reviewed topic bank. Nothing unchecked is published.
- **Centralised, monthly, points-only marketplace.** WLYL owns the catalog and supplies items; orders close monthly; the school admin taps "Parcel arrived" and ticks children "Collected". Families only ever see points. Cost control: 500 points per child per month, cheap items only, buy exactly what was ordered. Tracking is counts of orders, with no separate stock bookkeeping in the pilot.
- **Both are Platform-Admin feature keys**, seeded OFF, switched on per pilot school. This reverses the 2026-09 note that Learning Hub and Marketplace "are not Platform-Admin features", which was written for features with no pilot.

**Alternatives considered:** AI-written news (rejected: invents "latest" facts); a separate marketplace currency (rejected: two balances confuse children and parents); per-school catalogs bought by the school (rejected by the founder in favour of a WLYL-run chain); full inventory, receipt reconciliation and an exceptions queue (parked until there are more than about 5 schools).

**Consequences:** One Groq model writes and checks (a different-vendor checker would be stronger). The quiz branch must keep its points in the same table and leave these indexes alone. `SCHEMA_VERSION` (57 here) will need renumbering when merged with the quiz branches.


## 2026-10-18 — Push notifications go through an outbox and FCM HTTP v1, not firebase-admin

**Context:** Notifications are rows in `notifications`, written by raw `INSERT`s in about 19 route files, and the web bell polls every 30 seconds. We want pushes to the web app and the separate parent app through Firebase Cloud Messaging.
**Decision:** Keep `notifications` as the source of truth and treat push as a delivery step. `notifications.push_sent_at` is NULL until a notification has been pushed; `dispatchPendingPushes()` (lib/push.ts) claims unsent rows with `FOR UPDATE SKIP LOCKED`, stamps them, looks up `device_tokens` for the recipient and sends. Any route can call it from `after()`, and `/api/cron/push-dispatch` covers the rest, so existing insert sites keep their `INSERT`s and only gain one `after()` line (routes use `dispatchPendingPushes()`, bulk crons use `drainPendingPushes()`). FCM is called over its HTTP v1 REST API with a service-account JWT signed by `jose`, which is already a dependency. Rows older than 24 hours are stamped without sending, and existing rows are stamped when the column is added, so rollout never replays old notifications.
**Web client:** the page uses the Firebase JS SDK (`firebase/messaging`, loaded lazily) only to obtain the FCM token; the service worker does not load it and just shows the Web Push message FCM delivers. It is registered under its own scope, `/firebase-cloud-messaging-push-scope`, because `/sw-attendance.js` already owns `/` and a scope holds one worker. A visible tab gets the message by `postMessage` (the bell refreshes) instead of a system notification.
**Parent app:** `wlyl-parent-app` is a Next.js PWA installed on Android that proxies `/api/*` to this platform (not React Native), so it registers FCM tokens through the same `/api/devices`, with the parent cookie it already has. Push data for parents includes `url`, an app route chosen by `lib/pushLinks.ts` from the notification type and `data.exam_id`; the app owns its routes, so the mapping is in one place and falls back to `/notifications`.
**Parent mobile app (Expo):** `wlyl-parent-mobile` is a React Native / Expo app that already registers Expo push tokens and expects `/api/parent/push/expo` (#133). Rather than run #133's separate table and per-route calls next to the Firebase outbox, its Expo client (`lib/expoPush.ts`) is a second sender inside the same dispatcher: Expo tokens live in `device_tokens` with platform `expo`, and the sound channel comes from the notification type (`pushKindFor`). The app keeps its credentials in EAS (its own Firebase project), so the server needs no key for these and the app needed no change.
**Alternatives considered:** `firebase-admin` (large for a serverless cold start, and one more dependency to patch); sending push inside every `INSERT` site (easy to miss one, and a push failure could break the request); a Postgres trigger (cannot call FCM).
**Consequences:** Delivery is at-most-once: a notification is stamped before it is sent, so a crash mid-send loses it rather than duplicating it. Vercel Hobby cron is daily, so `/api/cron/push-dispatch` is not in `vercel.json`; a new route that inserts into `notifications` must add the `after()` call or its notifications wait for the next dispatch.

## 2026-10-18 — The cross-site guard trusts the parent app by an explicit origin list

**Context:** Sign-in, sign-out and password routes refuse a browser request whose `Origin` host differs from ours (#262), which stops login CSRF. The installed parent app, `wlyl-parent-app`, is a PWA that rewrites `/api/*` to this platform so the parent cookie stays first-party. Its browser sends the PWA's origin, the proxied request arrives with our host, and so every parent sign-in was refused with 403 once #262 reached an environment the app talks to.
**Decision:** The check moved to `lib/crossSite.ts` (dependency-free, so `proxy.ts` can still run on the Edge) and now allows an `Origin` that exactly matches an entry of `TRUSTED_APP_ORIGINS`. Anything else behaves as before. With the variable unset nothing is trusted.
**Alternatives considered:** dropping the guard for parent routes (reopens login CSRF for parents); having the app strip `Origin` and `Sec-Fetch-*` before proxying (hides the problem and defeats the guard for every route); wildcard or suffix matching (a look-alike subdomain would pass).
**Consequences:** Each deployment must set `TRUSTED_APP_ORIGINS` to the parent app's address (and `http://localhost:3002` for local work). Moving the app to a new domain needs a config change here first.
## 2026-10-09 — Usage is recorded per service in one place, priced per plan by month (#358)

**Context:** Paid services (WhatsApp, AI, email, exports) had no usage record, so nothing could be limited or billed, and the old `plan_pricing` columns only knew about WhatsApp.

**Decision:** `lib/usage.ts` is the only writer: `recordUsage()` after the provider accepts (idempotency key per provider id, daily totals in `usage_daily`), `checkAllowance()` before costly actions. Services live in `usage_meters`; prices in `usage_prices` keyed by plan and `effective_month`, so a price edit always lands on next month and a month's price never changes once it starts. A school's own price (`school_usage_overrides`) wins field by field and applies at once. Open questions in the platform handoff were answered with their recommended options: WhatsApp and AI charged, AI per 1,000 tokens, exact paisa rounding, login/password WhatsApp messages exempt from the limit, usage visible to school admin and principal only, our provider cost never shown to schools.

**Alternatives considered:** one shared credit for all services (rejected: unclear on bills); snapshotting prices into each billing cycle (not needed while prices are already versioned by month).

**Consequences:** a new paid service is a `usage_meters` row plus one `recordUsage()` call at its shared helper. `recordUsage()` takes its own pool connection, so call it after the caller's transaction commits. Metering failures are logged and never block the action (checkAllowance fails open).

## 2026-09-28 — Plan features are enforced centrally in proxy.ts (#253)

**Context:** Plan features only hid navigation tabs. Of roughly 95 feature API routes, only the fee and portal-access ones called `schoolHasFeature`, so a school on a lower plan could use any feature by calling its API directly. Adding a check to every handler would be easy to forget on the next new route.

**Decision:** `proxy.ts` maps protected API areas to canonical feature keys and refuses a school-side session's request when its school lacks that feature (`403 FEATURE_DISABLED`). It resolves one school/feature pair through `/api/internal/feature-entitlement`, backed by `schoolHasFeature`, and caches the answer for 15 seconds. The gate fails closed when entitlement cannot be verified. Requests without a valid school session are left to route authentication; Platform Admin bypasses school plan gating.

**Consequences:** a new API area for a plan feature must be added to `FEATURE_API_PREFIXES`. Screens that embed another feature's data (class management's attendance strip, the teacher class view's exams/syllabus) show empty when that feature is off, which matches the hidden tab.

## 2026-09-21 — One central Year Rollover, gated by fee year-end (#199)

**Context:** Fee Year-End could create the next academic year and switch the current year on its own ("Start Year Rollover"), while the Year Rollover tab promoted students. The two did not know about each other, so a school could end up on the new year with students not promoted, and the year could be created or switched from three places.

**Decision:** Year Rollover is the only place the next year is created and made current. It requires the fee year-end to be closed (server 409 + popup). Fee Year-End keeps money decisions only (carry / write off / passout / leave open, then close). The target year is always the label after the current one, so carried dues and promoted students land in the same year. A rolled-over fee year cannot be reopened.

**Consequences:** the one-shot fee rollover route is removed. Schools that already ran the old fee rollover have the new year current with students not yet promoted — they must finish that year's fee year-end and then run Year Rollover. Roll numbers are freed and re-applied during promotion (old value kept in `student_class_history`).

## 2026-09-21 — Timetable lives only on its own feature branch (#175, #176)

**Context:** The timetable's generation, conflict, publish and availability backend had been stripped from `dev` while the screens stayed, so the feature could not work; and the routes in git history had no sign-in checks.

**Decision:** Build the full end-to-end workflow on `feature/175-timetable-full-workflow` (restored backend, new `lib/timetableAuth.ts` guard, 11 end-to-end tests) and remove every timetable screen, route and the `timetable` feature key from `dev`. Tables stay. Letting a teacher schedule their own periods in the class view is a known follow-up on the branch.

**Consequences:** `dev` no longer offers timetables; substitute-duty panels went with them (Emergency Cover was already removed). Merge the branch back when the workflow is signed off.

## 2026-09-21 — Clean dev down to features that work end to end (#163–#168)

**Context:** After an earlier "stripped for production" commit removed many API routes, `dev` still carried screens for features whose backend no longer existed (Display kiosk, Learning Hub, Daily Knowledge, Marketplace, Lesson Planner, Class Performance, Weekly Test). None was reachable from a menu, and calling them returned 404. They confused the docs, the API spec and the product story.

**Decision:** Delete the Display kiosk for good. Move each of the other five to its own preserved feature branch (same pattern as #136–#140: `EXTRACTION-N.md` plan + draft PR) and remove it from `dev`. Learning Hub/Daily Knowledge and the Marketplace are student-independent, so they are **not** Platform-Admin features; Lesson Planner, Class Performance and Weekly Test each become their **own** Platform-Admin feature key when they return. Database tables are never dropped.

**Consequences:** `dev` has fewer half-features; the rewards points/badges/streak data and `GET /api/students/{id}/rewards` stay for the admin's student panel. Screens for other features that still call missing routes (timetable generation, leaderboard, year review, parent engagement, class-analytics panels) are tracked in KNOWN_ISSUES.

## 2026-09-21 — Analytics leftovers leave dev (#180–#183)

**Context:** Four school-admin analytics screens (Student Leaderboard, Year-in-Review, Parent Engagement, Class Analytics) and the Student Management performance tab had no working backend on `dev`; three of the screens were not linked from any menu. The Leaderboard's points mostly came from features already removed.

**Decision:** Delete the Leaderboard. Preserve Year-in-Review, Parent Engagement and Class Analytics + the performance tab on their own branches (#184–#186) and remove them from `dev`; rebuild each later as its own PR. Parent Engagement is the smallest to restore; Class Analytics should be redesigned around exam data and the shared attendance rules, reusing the Student 360 profile.

**Consequences:** the four feature keys leave the Platform Admin config. The unauthenticated rewards route was deleted with the only screen that used it.

## 2026-09-21 — Platform Admin config lists only reachable features (#188–#190)

**Context:** three features (Daily Briefing, Student-Teacher Analysis, Notification Center) were switchable in Platform Admin but had no menu entry, so enabling them showed nothing.

**Decision:** remove them from `dev` (each preserved on its own branch) and keep the feature config in step with what a school admin can actually open. A feature is added to `lib/features.ts` when it is implemented and reachable.

**Consequences:** 20 features remain in the config. The attendance end-to-end checks that read the briefing route now use the overview route, which carries the same holiday and attendance facts.

## 2026-09-20 — Attendance: any teacher marks, first submit locks; holidays live in the Academic Calendar (#153)

**Context:** Attendance let any logged-in user (students and parents too) read and write any class, silently overwrote earlier records, and each portal computed its own percentage. The school calendar existed but nothing used it, so a holiday looked like a day nobody marked, and its routes had no authentication.

**Decision:** Every teacher can mark every class (schools rotate cover). The **first submit locks** a class + date + session through a unique key on `attendance_sessions`, so a second teacher — even one submitting at the same instant — is told who marked it and changes nothing. The marker may correct it the same day; the admin any time; others use "Report a mistake". **Holidays are the Academic Calendar's `holiday` entries** (plus a per-school weekly-off list): one source of truth that the calendar screens, the mark sheet, the server, the analytics and the parent/student calendars all read. All percentages come from one module: (present + late) ÷ marked sessions, holidays out, unmarked days are gaps. Identity comes only from the signed session; parents and students get their own narrow endpoints.

**Alternatives considered:** class-teacher-only marking (rejected: real schools rotate/cover); letting the last write win (rejected: silent data loss); a `holiday` flag on the attendance table (rejected: a holiday is a school fact, not a per-record one); per-class holidays and half-days (deferred); per-session vs per-day percentage (per-session chosen: simple to explain, works for one or two sessions a day).

**Consequences:** One extra table and a backfill (existing days count as already marked). A teacher's mistake on a locked session needs the admin — deliberate. A holiday added over marked days ignores those records while it exists and counts them again if it is deleted (the admin is warned both times). `attendance` plan feature still gates the parent/student tabs. Whole-school, whole-day holidays only. No LEAP integration (no public API).


## 2026-09-20 — Per-person school staff login with revocable server-side sessions (#145)

**Context:** School staff logged in with a shared School ID, so actions could not be tied to a person. Logout only cleared a cookie (a stateless 7-day JWT), a deactivated user kept access until the JWT expired, and the login page offered "Continue to Dashboard" for whoever last left a session open, letting the next person on a shared computer walk into that account without a password.

**Decision:** Email + password only, one account per person (all school staff roles keep identical access). A `user_sessions` row per login; the JWT carries its id (`sid`) and `getSession()` rejects revoked, idle (20 min) or expired (12 h) sessions and inactive users. The cookie is a browser-session cookie. Only real user activity extends the idle timer: API calls and a browser heartbeat do, background pollers (`getSession({ passive: true })`, e.g. the notification bell) do not. Invites use the existing `password_reset_tokens` table with a 48 h expiry rather than emailing a password. The login page remembers only name + email of the last account (localStorage) and always asks for the password.

**Alternatives considered:** Keep School ID login for the owner (rejected: shared credential, no attribution); per-role permissions (deferred: all roles have the same access today); NextAuth/DB sessions library (rejected: project rule is custom JWT, and one small table covers the need); opt-in "Remember me" (rejected by the product owner in favour of always showing the last-used account).

**Consequences:** One extra indexed query per authenticated school-admin API call. `proxy.ts` (Edge) can only check the JWT signature and presence of `sid`, so an idle-expired session is caught on the first API call and by the client-side `IdleSessionGuard`, not at page load. Existing school-admin cookies (no `sid`) are invalidated once. Two people on one computer take turns (logging in ends the previous session); simultaneous use needs separate browsers or devices. The last-used card shows the previous person's name and email to anyone opening the login page on that browser, which is a deliberate product choice. Follow-ups: school audit log, login lockout/rate limiting.


## 2026-09-12 — Syllabus "Translate" uses transliteration via a server-side proxy (#116)

**Context:** Telugu and Hindi teachers could not enter chapter names in their language without installing Google Input Tools or changing keyboards. We want an in-app option.

**Decision:** Sound-based transliteration, not meaning translation: the teacher types "amma prema" and gets అమ్మ ప్రేమ, with alternative spellings to pick. Textbook titles must match exactly, which meaning translation would reword. The browser calls our own staff-only `GET /api/transliterate`, which proxies Google's public Input Tools endpoint (no API key).

**Alternatives considered:** Google Cloud Translation (meaning-based, $20/1M chars, no Latin→Telugu transliteration); Google's free `translate.googleapis.com` (blocked our requests); Groq AI via `lib/gemini.ts` (needs `GROQ_API_KEY`, not configured for this release, weaker on Telugu); client-side libraries like Sanscript (need strict ITRANS spelling teachers won't know); Chrome's built-in Translator API (desktop Chrome only, meaning-based).

**Consequences:** Zero cost and good quality today, but the upstream is undocumented with no SLA (tracked in KNOWN_ISSUES). The proxy route is the seam: swapping to Azure Translator Transliterate later changes only the route, not the UI.


## 2026-07-01 — Data-only backup to R2 + gap-fill-only restore

**Context:** We need protection against accidental data loss (deleted rows) without introducing a way to clobber good data. Vercel serverless cannot run `pg_dump`/`pg_restore` binaries.

**Decision:** Back up in pure Node via the existing `pg` pool (`@/lib/db`) to Cloudflare R2 (S3-compatible, 10 GB free tier, free egress) as gzipped JSON Lines — one header line per table (name, pk, column types) followed by one line per row. Restore is **gap-fill only**: it compares live primary-key sets against the backup and re-inserts only the missing rows with `INSERT ... ON CONFLICT DO NOTHING`. It never runs `UPDATE`/`DELETE`/`TRUNCATE`.

**Alternatives considered:** `pg_dump` on GitHub Actions (full schema+data, but heavier and off-platform — deferred to a separate ticket); a straight overwrite/restore (rejected — would clobber legitimately edited rows and defeats the "lost rows only" product rule).

**Consequences:** Data-only — schema/DDL, RLS, functions, triggers and Supabase Storage files are NOT covered (separate tickets if needed). Restore cannot repair wrongly-edited rows (same PK) by design. Tables without a primary key can't be gap-checked and are skipped + reported. `bytea` columns and jsonb-holding-arrays are edge cases not specially handled. Retention keeps the newest 14 backups to stay within R2's free tier.
