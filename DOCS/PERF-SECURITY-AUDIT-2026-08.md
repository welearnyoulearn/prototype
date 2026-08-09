# Performance & Security Audit — August 2026

**Branch:** `feature/perf-security-audit` (off `dev` @ `413a876`)
**Status:** work in progress — nothing committed, nothing deployed
**Scope:** login latency, app-wide performance, pagination, data leaks, data integrity

---

## TL;DR

| | Count |
|---|---|
| ✅ Fixed and verified | 13 |
| 🟡 Fixed but not yet user-visible | 1 (pagination has no UI consumers) |
| 🔴 Found, still open — **P0 security** | 4 |
| 🟠 Found, still open — performance | 9 |
| ⛔ Blocked (needs API work first) | 2 screens |

**Biggest single finding:** functions run in Washington DC while the database sits in Mumbai — **~200ms on every query**, multiplying every other latency problem here by roughly 4×. One line of config fixes it. See [Infrastructure](#-infrastructure--cross-region-latency-the-multiplier-on-everything-else).

**Second thing to know:** the original brief was "add pagination everywhere to fix slowness." That turned out to be the wrong lever. Pagination is now *available* on six endpoints but **no screen uses it yet**, and most screens **cannot** use it safely without server-side aggregation work first. The latency wins actually delivered came from elsewhere — cold-start migrations and an N+1 collapse.

---

## ✅ Completed and verified

Verification for all: `npx tsc --noEmit` → 0 errors repo-wide; `npx eslint` on changed files → 0 errors; `npx next build` succeeds both with and without secrets present.

### Security (P0)

| # | Issue | Fix | How verified |
|---|---|---|---|
| 1 | **Cross-tenant leak.** `GET /api/students` and `/api/teachers` guarded tenancy only when `school_id` was present. Omitting it skipped both guard and filter → every row in every school. Reachable by any logged-in student or parent (`getAnySession()` admits those roles). | Scope derived from session; `WHERE` seeded with `school_id = $1` so a school-less query is structurally unexpressible | Ternary removed from both routes; confirmed by grep |
| 2 | **Password hashes in API responses.** `SELECT *` / `t.*` returned bcrypt `password_hash` plus student/parent emails and phones to the browser. | Explicit column lists, checked against all ~20 consumers so no UI field was dropped | No `SELECT *` remains on either route |
| 3 | **JWT secret fell back to a value committed to the repo.** Logged `[FATAL]` then continued with `wlyl-dev-only-secret-not-for-production` — anyone with repo access could forge a token for any role and school. | Throws in production; build phase exempted via `NEXT_PHASE` so `next build` still works | 5-case env matrix executed; production build run with and without `JWT_SECRET` |
| 4 | **Ingest secret** had the same fallback (`watchline-internal`) duplicated in 3 places. | Consolidated to one definition; resolves to `''` in production and rejects rather than honouring a guessable default | Same matrix — confirmed it rejects the old default |

### Performance

| # | Issue | Before → After | How verified |
|---|---|---|---|
| 5 | **Cold-start migrations** — `ensureDB()` ran ~115 sequential statements on every new serverless instance, serialised on Vercel's single connection, before the login query. **This was the real cause of "loading late while login."** | **~115 → 2 round-trips** via a `SCHEMA_VERSION` gate | All 3 DB states traced: fresh, existing-without-version, already-current |
| 6 | **4-level nested N+1** in `GET /api/school/subjects?include_details` — subjects → chapters → topics → resources/tasks. | **~1,500 → 6 queries**, constant | Grouping logic reviewed independently; ordering preserved via `ORDER BY parent_id` first |
| 7 | **Missing indexes.** No usable index on `students.school_id` (the existing one is *partial*, so unusable for roster queries); `teachers` index had the wrong leading column; attendance lookups by class/date and school/date unserved. | Added `students(school_id,grade,section)`, `teachers(school_id)`, `attendance(class_id,date)`, `attendance(school_id,date)` | Each tied to a specific query in the codebase |
| 8 | **Dashboard fetch waterfall** — 4 sequential blocking fetches after login. | **4 → 3 hops**; the two independent ones now run together | Used `Promise.allSettled`, *not* `Promise.all`, to preserve the graceful-fallback paths; each failure path re-traced |
| 9 | **Portal bundles.** Teacher (~5,600 lines) and student (~3,000 lines) portals statically imported every tab — worst case for the phone users. | 7/9 teacher tabs and 5/7 student tabs lazy-loaded; **~7,000 lines deferred** | Build output confirms the chunk split. Default landing tab kept static deliberately |
| 10 | **Destructive `DELETE FROM parents`** de-dupe was running on *every* cold start. | Now gated behind the version check — runs once | Found incidentally while fixing #5 |

### Data integrity & correctness

| # | Issue | Fix |
|---|---|---|
| 11 | Duplicate roll-number check ran **twice** in `POST /api/students`; the second was a strict superset, so the first was dead code + a wasted round-trip. | Removed the redundant one; kept the semantics matching the DB index |
| 12 | **Unstable `ORDER BY`** on 4 newly paginated routes — ties meant rows would silently duplicate or vanish across pages. | Added `id` tiebreakers to `fees/ledger`, `fees/payments`, `doubts`, `announcements` |
| 13 | Migration statement that can fail on dirty data (`idx_students_school_roll_unique`) would, under the new version gate, have bricked **every** cold start forever. | Wrapped so a pre-existing duplicate can't take the app down |

### Also built

- **`app/components/Pagination.tsx`** — shared, accessible pager (`data-testid`, `aria-label`, renders nothing on a single page).
- **Opt-in pagination** on 6 endpoints: `students`, `teachers`, `fees/ledger`, `fees/payments`, `doubts`, `announcements`. Contract: no params → unchanged bare array, unbounded; with `limit`/`offset` → `{ data, limit, offset, total }`, capped at 500.

> **Why pagination is opt-in, not default:** a default 500-row cap was implemented and then **reverted**. `FeeManagement`, `StudentsManagement`, and `StudentTeacherAnalysis` fetch a full list and aggregate over it — a silent cap would have produced **wrong fee totals** for any school past 500 students. A slow correct answer beats a fast wrong one.

---

## 🟡 Done but not yet delivering value

**Six endpoints support pagination. Zero screens use it.** `Pagination.tsx` is currently imported by nothing. Nothing the user perceives has gotten faster *from the pagination work specifically* — the real latency wins so far are items 5, 6, 8, and 9.

The only two screens in the app that genuinely page today are `platform-admin/logs` and `platform-admin/audit`, which predate this work and are the reference implementation worth copying.

---

## ⛔ Blocked — cannot paginate without API work first

`StudentsManagement` and `TeachersManagement` were investigated and **deliberately not changed**. Both compute, client-side over the full array:

- status counts (`{students.length} total · {active} active · {removed} removed`)
- the Grade / Section / Department **dropdown options** (distinct values of the fetched rows)
- **search** (name / roll number / employee id — no route implements a `search` param)

Paginating today would show "Showing 1–25 of 300" while the tab counts silently went wrong, the filter dropdowns shrank to whatever happened to be on page 1, and search only looked at the current page.

**Unblocking needs three small API additions** to both routes: a `status` param, a `search` param (ILIKE), and a facets/counts mode (`?facets=1` → `{grades[], sections[], counts:{...}}`, mirroring the existing `grades_only=1`). After that, both screens convert cleanly.

---

## ✅ P0 security — second wave (found AND fixed this session)

Same class as #1. All four verified by reading the code, then fixed.

| Route | Problem as verified | Fix |
|---|---|---|
| `GET /api/leave-requests` | **Worse than first reported: no session check at all.** Combined with a conditional `if (school_id)` filter, omitting the param returned every teacher's leave records across every school — to a caller who was never asked to log in (middleware treats `/api/` as public). | Added `getAnySession()` auth, 403 on school mismatch, and seeded `lr.school_id = $1` from the session so the WHERE can't come out empty |
| `GET /api/doubts` | Called `getAnySession()` then used the caller's `school_id` with no comparison. A student of School A could read School B's full doubts feed — student names, roll numbers, question text. | 403 on mismatch; school predicate bound from `session.schoolId` |
| `GET /api/announcements` | Checked the session for existence and **threw the result away**, then trusted `school_id`. Any authenticated user could read any school's noticeboard. | Same fix; the bound parameter now comes from the session, not the query |
| `GET /api/notifications` | Same discarded-session pattern, and the recipient id came straight from the query string — any logged-in user could read anyone else's notifications by changing the id in the URL. | Recipient is now **derived from the session** (teacher → `teacherId`, student → `studentId`, school staff → `schoolId`); the query params are no longer trusted. Parent sessions get 401 — no notification stream exists for them today |

**Caller impact checked:** every frontend caller passes its own school id, so the new 403 never fires on legitimate traffic. `TeacherLeave` previously called `/api/leave-requests?teacher_id=…` with no `school_id` at all — it now gets scoped to the session's school automatically, same rows, safer.

Verified: 0 type errors repo-wide, 0 lint errors. The two `'ensureDB' is defined but never used` warnings on `doubts` and `leave-requests` are pre-existing on `dev` and were left alone.

---

## 🌏 Infrastructure — cross-region latency (the multiplier on everything else)

**Database:** `aws-1-ap-south-1.pooler.supabase.com` — AWS Mumbai.
**Functions:** `vercel.json` had no `regions` key, so they default to `iad1` (Washington DC) unless overridden in the Vercel dashboard.

That's ~12,000 km each way — **roughly 200ms per DB round-trip**, paid on every single query, on a pool capped at 1 connection. It is a constant multiplier on every performance item in this document:

| Item | Estimate at ~50ms | Reality at ~200ms |
|---|---|---|
| Cold-start migrations (~115 queries) | 3.5–9s | **~25s** |
| `school/subjects` N+1 (~1,500 queries) | slow | **~5 min** — exceeds any Vercel timeout, so this endpoint was likely *failing*, not just slow |
| `fees/stats` (10 sequential) | ~0.5s | **~2s** |
| Any trivial single query | ~50ms | **~200ms floor** |

**Fix applied:** `"regions": ["bom1"]` added to `vercel.json` (Vercel's Mumbai region — same AWS region as the DB, single-digit-ms RTT). Users are in India too, so this shortens the browser hop as well. **Not yet deployed.**

**Before merging, verify:**
- **Your Vercel plan allows setting the function region.** A single region is generally settable on Hobby; multi-region needs Pro. If `regions` in `vercel.json` is rejected, set the default region in Vercel project settings instead.
- **A dashboard-level region setting doesn't already conflict.** The dashboard value and `vercel.json` should agree.
- **Cron jobs still behave** — the three in `vercel.json` are unaffected by region, but worth a smoke test.
- **Measure before and after.** These are arithmetic estimates from distance, not measurements. Time one login and one Fees-tab load in production before and after the switch.

**Do not solve this by moving the database to the US.** Users are in India, so it would worsen the browser hop, and Indian student data plausibly falls under the DPDP Act 2023 — data residency is a reason to keep the DB in `ap-south-1` and move compute to it, which is what this change does.

---

## 🟠 Open — performance, ranked by real impact

Assumes ~1,200 students, ~60 staff, 3 years of history. **All figures below assume the region fix above lands** — without it, multiply each by roughly 4×.

| # | Issue | Size | Effort |
|---|---|---|---|
| 1 | **`/api/fees/payments` fetched unfiltered** in `FeeManagement`'s `loadStats` — pulls **~36,000 rows to render a 6-row "recent payments" strip**, on every load of the most-used admin screen. | ~36,000 rows | **2 lines** — add `payment_status=completed&limit=6` |
| 2 | `/api/fees/ledger` full-year pull (~10,000 rows/yr) on every Ledger/Collect visit. Can't be naively paged — needs server-side per-student roll-up + status counts first. | ~10,000 | High |
| 3 | `/api/tasks?school_id=` school-wide (~29,000 rows over 3 yrs) for `AcademicAnalytics`, each row carrying 3 correlated sub-selects. Replace with a `GROUP BY`. | ~29,000 | Medium |
| 4 | `StudentTeacherAnalysis` pulls **three whole tables and renders zero rows** — it only needs counts. One `GROUP BY` endpoint replaces ~1,260 rows with ~30. | 3 round-trips | **Low — cheapest win** |
| 5 | `DoubtsCenter` issues the **identical `/api/doubts` request twice** per load. | free 50% cut | Trivial |
| 6 | **Missing indexes:** `leave_requests` (none at all), `notifications` (none — and it's **polled every 30s** by `NotificationBell`), `tasks.school_id` (index exists but not on the column actually filtered). | — | Low |
| 7 | **Live pagination bugs:** `platform/audit` and `platform/watchline` already page with `LIMIT/OFFSET` over `created_at DESC` with no tiebreaker. Rows written in one transaction share a timestamp → rows silently duplicate/skip across pages **today**. | — | Trivial |
| 8 | ~55 other in-loop query sites across 40 routes. Next real ones: `fees/category-assignments`, `substitutes`, `school/subscribe`. | — | Medium |
| 9 | `fees/stats` (10 queries) and `parent/fees` (6) run independent queries **sequentially** — not N+1, just missing `Promise.all`. | — | Low |

---

## 📋 Other findings worth a ticket

- **27 endpoints the frontend calls don't exist as route files** — `/api/leaderboard`, `/api/marketplace/*`, `/api/hub/*`, `/api/ai/*` and others. The screens depending on them (`StudentLeaderboard`, `StudentHub`, `ParentMarketplace`, `FloatingAIChat`, `display/page.tsx`) are **404ing today**. Someone needs to decide whether these ship.
- **`lucide-react` is declared in `package.json` but absent from `node_modules`**, which blocks any build. Installed locally with `--no-save` for verification only — both lockfiles untouched. Someone should run a proper `pnpm install`.
- `StudentLeaderboard` is **already broken** — `limit=100` truncates, then "Total Students" and average are computed over the truncated set.
- `NotificationBell`'s unread badge is **already wrong past 50** — the route has `LIMIT 50` and no offset.
- `ClassDoubts` re-fetches the entire message thread **every 4 seconds** with no cursor.
- Both `.claude/settings.json` and `.claude/settings.local.json` are **tracked in git**. `settings.local.json` normally isn't — committing it pushes local prefs (now including bypass permission mode) to every teammate.

---

## ⚠️ Corrections to the original audit

Stated for the record, because they changed conclusions:

1. **"The login query can't use an index" — wrong.** `idx_users_email_lower` and `idx_users_school_code_lower` already existed on `dev`. The original index scan used a single-line regex and missed multi-line `CREATE INDEX` statements. Login was already indexed; **cold-start migrations were the real cause** of slow login.
2. **"No index on `students.school_id` at all" — imprecise.** One exists as a prefix of `idx_students_school_roll_unique`, but it's *partial* (`WHERE school_roll_number IS NOT NULL`) so the planner can't use it for roster queries. The conclusion held; the reason given didn't. The new index is genuinely needed.

---

## Recommended order

0. **Deploy the `bom1` region change** — one line, and it divides every latency number in this document by roughly 4. Nothing else here comes close to that ratio of impact to effort. Measure before and after.
1. **The four P0 tenant leaks** — same class as an already-confirmed live vulnerability, contained fix, pattern already proven.
2. **`fees/payments` filter + limit** — 2 lines, biggest single *query-volume* win in the app.
3. **`StudentTeacherAnalysis` aggregate endpoint** and the **DoubtsCenter double fetch** — cheap, visible.
4. **Missing indexes** on `leave_requests`, `notifications`, `tasks.school_id`.
5. **Tiebreakers** on `platform/audit` and `platform/watchline` — fixing a live bug.
6. **Then** the facets/search API work that unblocks paginating the roster screens.

---

## Process notes

- **Nothing is committed.** 15 files modified, 2 untracked (`app/components/Pagination.tsx`, `.mcp.json`).
- The branch name lacks an issue number. Per `CLAUDE.md`, every bug/feature needs a GitHub Issue first and branches must be `fix/{issue}-{desc}` or `feature/{issue}-{desc}`. **Issues should be opened before this becomes a PR.**
- No tests were added. The project has Playwright (`npm run test:e2e`); the tenant-isolation fixes in particular deserve a regression test that asserts a student of School A gets 403 for School B.
