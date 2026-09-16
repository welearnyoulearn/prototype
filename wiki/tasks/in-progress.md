# In Progress

Tasks currently being worked on. Move to [completed.md](completed.md) when done.

---

<!-- Add new entries at the top -->

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
