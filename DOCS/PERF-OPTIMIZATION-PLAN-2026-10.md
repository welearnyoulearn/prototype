# Performance, caching & best-practice plan — Cloudflare Workers (#381)

Audit date: 2026-10-18. Scope: all API routes (≈215), crons, proxy, five portals' frontends, live Supabase DB
(indexes, `pg_stat_statements`, per-table scan stats). Branch audited: `preview/358-on-cloudflare`.

## What the data says

- **Individual queries are fast** (hot queries 0.05–3 ms). Time goes to **how many round trips** each request makes,
  plus ~0.4 s client network per request (workers.dev traffic from India enters Cloudflare at Marseille).
- **Per-request overhead dominates.** A typical school-admin `GET /api/students` = 1–2 internal self-fetches
  (`proxy.ts` → `/api/internal/feature-entitlement`, 2 s cache) + 8–10 DB round trips, of which 6–8 are overhead
  (session check + touch UPDATE, plan tier, feature overrides, duplicate feature checks in the handler).
  Most-called statements: session lookup (58k), feature override (20k), plan tier (17.7k), plan features (16k).
- **Polling is the biggest request source:** 366–726 requests per active user per hour (two notification pollers,
  session check, usage heartbeat, `/me` re-checks; none pause in hidden tabs). At 15k open tabs ≈ 29M requests/day.
- **Most expensive DB statement:** `pg_advisory_xact_lock(hashtext($1))` — 2,992 calls, mean 421 ms, max 78 s.
  It is the per-school fee-year lock (`lib/feeRollover.ts:148`), taken *exclusively* by every payment, waiver and
  cancel, and held by long per-row loops (year-end apply, category assignments, structures, rollover).
- **Schema drift:** migrations are skipped once `SCHEMA_VERSION` is recorded, so statements added to old blocks never
  ran. Live DB is missing `idx_fee_ledger_student`, `idx_fee_ledger_year`, `idx_fee_payments_student`,
  `idx_fee_payments_school` (fee_payments: 128k seq scans vs 24k index scans) and the `textbook_library`/`textbook_chunks`
  tables (Textbooks returns 500).

## Phase 0 — correctness & security (small, do first)

| # | Issue | Where |
|---|---|---|
| 0.1 | `admin.*` host lets every `/api/*` skip plan-lock + feature gating | `proxy.ts:289-291` |
| 0.2 | Crons accept unauthenticated calls when `CRON_SECRET` is unset; raw secret accepted without `Bearer` | `cron/billing:9-15`, `usage-digest:177`, `birthday-sweep:37` → use `checkCronAuth` |
| 0.3 | ~~Exam edit silently rolled back when a notification insert failed~~ **fixed** (d3beda5 / b833afa) | `exams/[id]/route.ts` |
| 0.4 | Schema drift: re-apply missing indexes/tables; make the version gate re-run idempotent blocks | `lib/db.ts` |
| 0.5 | Monthly bills whose email failed are never resent (`sent_at` stays NULL) | `lib/bills.ts:115,211` |
| 0.6 | Fee bugs: cancel date regex has no backslashes; double `client.release()`; wrong constraint name dropped; waivers PATCH takes lock before auth; year lock taken before tenant check | `payments/cancel:140`, `ledger/[id]:157`, `category-assignments:21`, `waivers:220`, `feeRollover.ts:200` |
| 0.7 | Portal (teacher/student/parent) sessions never expire — every poll touches them | `lib/auth.ts:398`, heartbeat, bell |
| 0.8 | Offline attendance queue broken (`getQueue` awaits the request, not the result) and runs on every GET site-wide | `public/sw-attendance.js:98,50-59` |
| 0.9 | Command bar search sends `search=`; API reads `q` → downloads whole roster | `CommandBar.tsx:115` |
| 0.10 | Session tables never purged; `notifications`, `usage_sessions` no retention | crons |
| 0.11 | Unbounded exports/lists (watchline CSV, plan export, audit limit unclamped) | `platform/watchline`, `plan/export`, `platform/audit` |

## Phase 1 — indexes (one migration, `CREATE INDEX CONCURRENTLY`, bump `SCHEMA_VERSION`)

Add (grouped; exact statements in the audit notes):
- **Fees:** `student_fee_ledger(school_id, academic_year, status)`, `(fee_category_id)`, `(fee_structure_id) WHERE NOT NULL`;
  `fee_payments(school_id, paid_date)`, `(school_id, student_id)`, `(school_id, created_at DESC, id DESC)`;
  `fee_waivers(ledger_id)`; `student_fee_ledger_edits(ledger_id, changed_at)`, `(school_id, changed_at DESC)`.
- **People/auth:** `student_parents(parent_id)`, `parents(phone) WHERE password_hash IS NOT NULL`, `parents(school_id)`,
  `users(school_id, role)`, `user_sessions(expires_at)`, `portal_sessions(expires_at)`.
- **Academics:** `exam_records(class_id, created_at DESC)`, `(school_id, created_at DESC)`, `(exam_date) WHERE status IN (…)`;
  partial unread indexes on `notifications(recipient_*, created_at DESC) WHERE NOT is_read`, `notifications(school_id, type, created_at DESC)`,
  `notifications(sender_teacher_id)`; 13 unindexed FKs on curriculum/progress tables (`school_topics(master_topic_id)`, …).
- **Platform/usage:** `usage_sessions(started_at)`, `(last_seen_at) WHERE ended_at IS NULL`, `expense_audit_log(school_id, created_at DESC)`,
  `saas_invoices(school_id, invoice_date DESC)`, `exam_marks(school_id)`.
- Rewrite `col::date = CURRENT_DATE` / `TO_CHAR(date)=…` predicates as ranges so indexes apply.

Drop exact/prefix duplicates (pure write cost): `idx_students_school_grade` (= `_section`), `attendance_session_unique`
(= unique key), `idx_school_feature_overrides_school`, `idx_exam_applicable_students_{exam,student}`, `idx_exam_marks_exam_student`,
`idx_class_{topic,chapter}_visibility_class`, `idx_school_topic_progress_class`, `idx_usage_rollup_school_day`,
`idx_feature_rollup_school_day`, `idx_custom_subject_chapters_subject`, `idx_school_subjects_school`.

## Phase 2 — per-request overhead (biggest latency win)

1. Proxy: replace the per-feature self-fetch (2 s TTL) with one cached "feature denials" map (60 s), and plan-locked via
   Cache API/KV; use the `WORKER_SELF_REFERENCE` binding for any remaining self-calls. Saves ~0.3 s and 1–9 subrequests per gated call.
2. One-statement session validation (CTE select + conditional touch), touch threshold 30 s → 2 min; passive validation for polls.
3. Remove duplicate in-handler feature checks once the proxy is authoritative (`students`, `classes`, `teachers` routes).
4. No writes or DDL on read paths: ledger GET's 2 UPDATEs, `category-assignments` `ensureSchema` DDL, `ensureDB`'s
   `ALTER TABLE` on cold start (read the version first).
5. Fee lock: single-bill writers take `pg_advisory_xact_lock_shared`; exclusive only for close/reopen/apply/rollover;
   `SET LOCAL lock_timeout = '5s'`; feature checks/idempotency before the lock.

## Phase 3 — request volume (biggest cost win)

- One shared notifications store for bell + nav badges, 90 s interval, paused on `document.hidden`, refresh on focus,
  `ETag`/304 or `?since=` count endpoint.
- Merge session check + heartbeat + `/me` + plan status into one presence ping every 2–5 min.
- Expected: 366–726 → ~12–30 requests/user/hour (−90–97%), hidden tabs ~0.

## Phase 4 — frontend load time

- Bootstrap endpoint per portal (school admin dashboard 5 network rounds → 1–2; parent 5 → 1; student `me` returns class id).
- Shared client cache for `classes`, `academic-year*`, `schools/:id`, `enabled-features`, class-subjects (dedupe 3× academic-year, 2× school).
- Over-fetch: Fee overview loads the whole year's payments to show 6; Collect tab loads ~6k ledger rows then filters;
  ledger fetched once per year sequentially; passbook payload duplicated; announcements filtered in JS.
- Lazy-load fee sub-tabs and parent screens; drop unused `html2canvas`; compress landing PNGs; remove unused 620 KB JPGs.

## Phase 5 — caching (what, where, TTL, invalidation)

| Data | Where | TTL | Invalidate on |
|---|---|---|---|
| `/api/plans/public` | CDN `s-maxage=3600, swr=86400` + Cache API | 1 h | plans/pricing/features PUT |
| Master curriculum catalog | Workers Cache API, versioned key | 1 h | any platform curriculum write (bump version) |
| Plan tier, feature flags/overrides | in-isolate (and/or KV) | 60 s | platform toggle |
| Current academic year, school name/logo, enabled-features | in-isolate + `private, max-age=60` | 60–300 s | rollover / settings PUT |
| Usage meters & prices | in-isolate | 60 s | TTL (monthly effect) |
| Platform analytics/stats dashboards | Cache API | 5 min | TTL |
| Syllabus structure (no progress), analytics | in-isolate + client SWR | 60–120 s | syllabus writes |
| Exam calendar, announcements reader | client SWR + `private, max-age=30–60` | 30–60 s | TTL |
| Transliterate | Cache API by `lang|text` | 30 days | none (deterministic) |
| **Never cache** | ledger, payments, stats, passbook, day-close, open-dues, sessions (>10 s), anything per-tenant in a shared/CDN cache | — | — |

Note: `lib/responseCache.ts` is per-isolate — invalidation reaches only the isolate that wrote; others are stale up to TTL.

## Phase 6 — write paths & crons (set-based SQL)

- Exams: schedule (~1,500 round trips under lock → ~10), marks POST (1 upsert per entry → 1 `unnest` upsert), release/cancel/edit notifications.
- Fees: year-end apply/close (~6,300 → ~6), category-assignments POST, structures POST, multi-bill payments.
- Crons: exam-reminders (~1M single inserts in exam season → 3 statements), syllabus snapshot, birthday sweep,
  usage-ingest (5 round trips/school → 1), billing (preload prices, Resend batch, resend unsent).
- Bulk imports: batches of ~50, cheaper scrypt for temp passwords (CPU limit risk).
- WhatsApp cap check is not atomic (overspend under bulk sends) → reserve atomically.

## Phase 7 — operations

- Backup/restore off the Worker (`pg_dump`/Supabase PITR + offline restore script); restore likely exceeds 128 MB today.
- `limits.cpu_ms` for crons; retention for notifications, usage_sessions, session tables.
- Logins: admin/teacher bcryptjs-12 (~430 ms CPU) → scrypt (~75 ms), upgrade-on-login.
- Custom domain (`dev.welearnyoulearn.com`) to test India ingress instead of Marseille.

## Verification

After each phase: typecheck, Playwright (incl. new tenant-isolation and fee-lock tests), `scripts/perf/school-lifecycle.mjs`
before/after on the Workers Paid preview, and `pg_stat_statements` reset + re-read to confirm round-trip and lock-time drops.
