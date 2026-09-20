# In Progress

Tasks currently being worked on. Move to [completed.md](completed.md) when done.

---

<!-- Add new entries at the top -->

### School staff login: per-person email login, server-side sessions, last-used account (#145)
**Type:** Feature
**Portal:** School Admin / Auth
**Assigned to:** Kowsik
**Branch:** feature/145-staff-login-sessions
**Started:** 2026-09-20
**Summary:** Replaces the shared School ID login with one email login per person, revocable server-side sessions (20 min idle, 12 h max), invite-by-link for added staff, and a login page that shows the last-used account but always asks for the password. Detail: `wiki/features/auth.md`; decision in `docs/DECISIONS.md`.
**Progress:**
- [x] `user_sessions` table, `getSession()` validation, revocation on logout, deactivation and password reset
- [x] Email-only login, school creation requires an admin email, owner-email backfill migration
- [x] Staff invite link (48 h) and resend; platform reset-password limited to the owner account
- [x] Login page last-used account card; idle guard; `no-store` on school-admin pages
- [x] Playwright spec `e2e/workflow-staff-sessions.spec.ts`; existing specs moved to email login
- [ ] Run the e2e suite against a local/test database and a manual browser check
- [ ] `/code-review`, then PR against `dev`
- [ ] Follow-ups (separate issues): school audit log, login lockout/rate limiting

---

### Fee Management v2 rebuild — consolidated rollover, past-records archive, security/audit hardening (#119)
**Type:** Feature
**Portal:** School Admin
**Assigned to:** Kowsik
**Branch:** feature/119-fee-management-v2
**Started:** 2026-09-14
**Summary:** In-place rebuild of the fee system toward a modern, single tool covering structure setup, collection, year rollover, and past records — mirroring the Exam Schedule/Marks v2 rebuild (#104): same nav entry and feature flag, rewritten in place across sequential commits rather than a parallel build. Followed by several rounds of independent multi-angle audits (financial correctness, tenant isolation/security, concurrency, and a product-completeness pass) with every confirmed finding fixed. Full detail: `wiki/features/fee-management.md`.
**Progress:**
- [x] Consolidated duplicated year-end/year-rollover logic into `lib/feeRollover.ts` (get-or-create system category, close-out-a-bill, carry-forward-a-bill, race-safe year-close claim, remaining-open-balance aggregate)
- [x] Fixed a real concurrency gap: year-end's apply action had no claim lock (unlike year-rollover), so concurrent double-submits could double-apply carry-forward/write-off — now serialized per `(school_id, academic_year)` via `pg_advisory_xact_lock`
- [x] New read-only `/api/fees/archive` endpoint — every academic year's headline + close status, reusing existing `student_fee_ledger`/`fee_year_close` data (no new tables)
- [x] New "Past Records" tab in `FeeManagement.tsx` browsing archived years, linking into the existing Reports/Ledger tabs scoped to a chosen year
- [x] Split `FeeManagement.tsx` (6,478 lines, 8 tabs, real cross-tab state coupling) into per-tab components under `app/school-admin/components/fee-management/`, one tab at a time with `tsc`/`eslint`/`/code-review` verification between each — **all 8 tabs done**. First real use of Zustand in this repo (`lib/stores/feeStore.ts`).
- [x] **Critical security fix**: cross-tenant IDOR in the parent online-payment self-report endpoint (any logged-in parent/student/teacher could submit a fabricated payment against another school's ledger)
- [x] Data-loss/integrity fixes: ledger-delete missing a row lock + waiver guard, category-assignments missing an ownership check + overpay guard, stale audit-log entries on a concurrently-modified structure amendment
- [x] Idempotency-key protection for payments and waivers (`lib/idempotency.ts`) — a network retry could previously duplicate a real payment
- [x] Financial correctness: year-end write-offs were inflating "Waived" totals (mislabeled with the same type as a genuine discretionary waiver) — now separated, with a backfill migration for existing data; carry-forward double-counting, Passout "Net Pending" double-subtraction, percentage-waiver upper bound, multi-hop carry-forward traceability, and an IST/UTC timezone mismatch all fixed; closed-year guards added to every route that was missing one
- [x] Performance: dropped two dead per-row subqueries from the busiest fee query, added a missing index on `fee_payments.ledger_id`, fixed an `ensureDB()`/`pool.connect()` ordering bug that could deadlock on Vercel's `max: 1` pool, replaced 5 heavy requests with one lightweight endpoint for the setup-wizard banner
- [x] Fee Audit Report overhaul: a Waiver Breakdown (discretionary / carried-forward / written-off shown separately for the first time), a plain-language methodology note, and grand-total rows for cross-checking
- [x] UX fixes in Collect tab: a full payment could silently relocate a student's row out of view (root-caused to a ledger-refresh reorder bug), "Collected By" made required, future-dated payments now warn inline instead of failing silently at submit
- [x] `tsc --noEmit` clean throughout; every touched file's `eslint` checked against its pre-existing baseline
- [x] Opened PR #127 against `dev`
- [ ] 7 new + 15 fixed e2e test cases added (`e2e/workflow-fee-management.spec.ts`) but **not yet run** — needs a live DB and `E2E_PLATFORM_ADMIN_EMAIL`/`PASSWORD` for a platform admin, unavailable in the sandboxed session that wrote them
- [ ] `fmt()`/`fmtDate()`/`pct()`/`sanitizeMoney()`/`blockNonNumericKeys()` duplicated across all 8 extracted tab files instead of a shared `fee-management/format.ts` — flagged as a follow-up cleanup, not done
- [ ] PR review and merge

### Teacher Syllabus — add chapters in Telugu & Hindi without an extension (#116)
**Type:** Feature + Bug Fix
**Portal:** Teacher
**Branch:** feature/116-syllabus-indic-translate
**Started:** 2026-09-12
**Summary:** A sparkle **Translate** button beside the Add Chapter, Add Subtopic and rename inputs converts what a teacher types in English letters ("amma prema") into Telugu or Hindi script (అమ్మ ప్రేమ), with alternative spellings as chips. Also fixes Enter submitting half-typed text while Google Input Tools / Gboard is composing, and the empty-subject "Or add chapters one at a time" link that showed nothing.
**Progress:**
- [x] `GET /api/transliterate` (staff-only, Zod-validated, proxies Google Input Tools)
- [x] Translate control on add chapter / add subtopic / rename chapter / rename topic
- [x] Enter ignored while an input method is composing (same four inputs)
- [x] Add Chapter input shown for empty subjects
- [x] Playwright spec `e2e/workflow-syllabus-translate.spec.ts`
- [ ] PR review and merge
- [ ] Swap to an official keyed service (Azure Translator Transliterate) before production — see KNOWN_ISSUES

### Feedback Management — public form + admin dashboard (#TBD)
**Type:** Feature
**Portal:** School Admin (public-facing entry point outside all portals) / Platform Admin (feature toggle)
**Assigned to:** Kowsik
**Branch:** feature/feedback-management — ⚠️ needs renaming once an issue number exists
**Started:** 2026-09-07
**Summary:** No-login, QR-code-driven feedback form (role → category → emoji rating → follow-up/voice note) at `/feedback/[code]`, resolved by a code dedicated to this feature (not the admin login `school_code`). School-admin gets a "Feedback Management" tab: dashboard KPIs, submissions list, an issue pipeline auto-flagged from low ratings (department + priority + status), category CRUD, and a Settings/QR poster page. Gated by a new `feedback-management` entry in `lib/features.ts` — the platform-admin `/platform-admin/features` toggle needed no other plumbing since that screen is fully data-driven.
**Progress:**
- [x] Schema: `feedback_settings`, `feedback_categories`, `feedback_submissions`, `feedback_submission_ratings` + backfill for existing schools
- [x] Public API: resolve-by-code, submit (rate-limited, anonymity enforced server-side), voice presigned upload (R2)
- [x] Public wizard UI at `app/feedback/[code]/`
- [x] Admin API: submissions, issues, stats, categories CRUD, settings, QR (session-gated, tenant-checked via `requireFeeAccess`)
- [x] Admin UI: `FeedbackManagement.tsx` (Dashboard/Submissions/Issue Pipeline/Categories/Settings & QR tabs)
- [x] Nav + feature-flag wiring in `lib/features.ts` and `app/school-admin/page.tsx`
- [x] Playwright e2e spec written (`e2e/workflow-feedback-management.spec.ts`) — not yet run against a live DB
- [x] DB migrations verified live against the Supabase dev DB (found + fixed a real backfill SQL bug this way)
- [x] `/code-review medium` run and all correctness/security findings fixed (missing active-state checks on public routes, no rate limit on voice upload, no dedup/cap on submitted ratings, unused `cn` dependency, missing `res.ok` checks in 3 admin tabs)
- [ ] Full user-flow smoke test (blocked locally — no local Postgres available in this environment, and no test school was created against the shared Supabase dev DB)
- [ ] Open a GitHub issue and rename the branch to `feature/{issue-number}-feedback-management`

### Performance & security audit — login latency, tenant isolation, pagination (#TBD)
**Type:** Bug Fix / Enhancement
**Portal:** All (School Admin, Teacher, Student, Parent, Platform Admin)
**Assigned to:** Vamsi
**Branch:** feature/perf-security-audit — ⚠️ needs renaming once an issue number exists
**Started:** 2026-08-09
**Summary:** Fixed a cross-tenant data leak that exposed password hashes, hardened committed secret fallbacks, cut cold-start DB round-trips ~115 → 2 (the real cause of slow login), and collapsed a 4-level N+1 from ~1,500 queries to 6. Full detail and the open-items list: [DOCS/PERF-SECURITY-AUDIT-2026-08.md](../../DOCS/PERF-SECURITY-AUDIT-2026-08.md).
**Progress:**
- [x] P0 cross-tenant leak + password-hash exposure (students, teachers)
- [x] JWT / ingest secret fallbacks fail closed in production
- [x] Cold-start migration version gate (~115 → 2 round-trips)
- [x] 4-level N+1 in `/api/school/subjects` (~1,500 → 6 queries)
- [x] Missing indexes; dashboard waterfall; teacher + student bundle splitting
- [x] Opt-in pagination API on 6 endpoints + shared `Pagination` component
- [ ] **P0: tenant guards on doubts, announcements, leave-requests, notifications**
- [ ] `/api/fees/payments` unfiltered — ~36k rows to render 6 (2-line fix, biggest win)
- [ ] Facets/search API so the roster screens can actually paginate
- [ ] Open GitHub issues, rename branch, add Playwright tenant-isolation regression test

---

## Format

```
### Title (#issue-number)
**Type:** Feature / Bug Fix / Enhancement
**Portal:** School Admin / Teacher / Student / Parent / Platform Admin
**Assigned to:** Name
**Branch:** feature/42-short-description or fix/87-short-description
**Started:** YYYY-MM-DD
**Summary:** What is being done in 1-2 sentences.
**Progress:**
- [x] Step completed
- [ ] Step remaining
```

---

<!-- 
### Example task (#42)
**Type:** Feature
**Portal:** Student
**Assigned to:** Vamsi
**Branch:** feature/42-student-login
**Started:** 2026-06-18
**Summary:** Building proper login form for student portal to replace demo dropdown.
**Progress:**
- [x] Design login form UI
- [x] Create API endpoint
- [ ] Add JWT session
- [ ] Write Playwright tests
-->
