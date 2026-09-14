# Feature: Fee Management

**Portal:** School Admin (primary) / Parent (read-only view via `/api/parent/fees`)
**Status:** Built (v2 rebuild in progress — see Known issues)
**Last updated:** 2026-09-14

---

## What it does

Single tool for a school's whole fee lifecycle: define fee categories/structures per grade, generate bills, collect payments (cash/cheque/DD/UPI/online), grant waivers, reconcile cash at day-close, review year-end outstanding dues, roll over to the next academic year, and browse every past academic year's financial headline.

## How it works

1. **Setup** — school admin creates fee categories (fixed = same amount per grade, variable = per-student), sets amounts per grade, generates ledger bills for all active students, then locks the plan (further changes need an audited amendment).
2. **Collect** — daily counter view groups students with outstanding dues; admin collects a payment (full or partial, FIFO across selected bills), can grant a waiver, and reconciles the day's cash at Day Close. Online (UPI) payments land as pending and need admin verification before they post to the ledger.
3. **Year-End** — at year end, the admin reviews every student with an unpaid balance and decides per-student: carry forward (creates one "Previous Year Dues" bill in the next year), write off, move to the always-open passout ledger (leavers/graduates), or leave open. Closing the year locks it; reopening requires a reason (logged).
4. **Year Rollover** — a one-shot action that creates the next academic year, auto-carries all remaining unpaid dues for continuing students, and closes the source year — an alternative to the per-student Year-End flow for a school that wants a single "roll everything forward" action.
5. **Past Records** — a read-only tab listing every academic year the school has had, each with its billed/collected/waived/unpaid headline and close status; "View Report"/"View Ledger" jump into the existing Reports/Ledger tabs scoped to that year.

## Key files

| File | Purpose |
|------|---------|
| `app/school-admin/components/FeeManagement.tsx` | Single tabbed component — Overview, Fee Plan, Ledger/Collect, Student Passbook, Reports, Year-End, Past Records, Leavers & Dues |
| `lib/feeRollover.ts` | Shared rollover primitives: get-or-create a system fee category, close out a bill (settled/waived + `fee_waivers` row), upsert a carry-forward bill, race-safe year-close claim, remaining-open-balance aggregate |
| `app/api/fees/year-end/route.ts` | Per-student year-end review + apply (carry/writeoff/passout/open) + close/reopen |
| `app/api/fees/year-rollover/route.ts` | One-shot bulk rollover — new year + auto-carry + close, race-safe via an atomic claim on `fee_year_close` |
| `app/api/fees/generate/route.ts` | Idempotent ledger generation from fee structures + variable assignments |
| `app/api/fees/archive/route.ts` | Read-only: every academic year's headline + close status, for the Past Records tab |
| `lib/auth.ts` (`requireFeeAccess`) | Tenant-isolation guard used by every fee API route |

## API endpoints

Fee routes live under `/api/fees/*` (structures, categories, generate, ledger, payments, waivers, day-close, passbook, year-end, year-rollover, archive, reports, stats, export, audit-log, and the online-payments/UPI sub-routes). `/api/parent/fees` is the parent-portal read view.

## Database tables

| Table | Role |
|-------|------|
| `fee_categories` | Fee heads (fixed/variable), including system categories `Previous Year Dues` / `Passout Dues` |
| `fee_structures` | Per-grade amount for a category in an academic year |
| `fee_structure_locks` / `fee_structure_amendments` | Plan lock + audited post-lock changes |
| `student_fee_ledger` | Core per-student billing rows; `source_academic_year`/`source_ledger_id` trace carry-forward/passout bills back to their origin |
| `fee_payments` | Payment transactions (cash/cheque/DD/UPI/online), FIFO-allocated across selected bills |
| `fee_waivers` | Waiver/close-out records — `waiver_type` distinguishes discretionary waivers from `carry_forward` bookkeeping entries |
| `fee_year_close` | Per-year close state: closed_by/at, is_reopened, carried/writeoff/open counts+totals |
| `passout_students` | Registry of students moved to the always-open passout ledger |
| `academic_years` | Per-school academic years, `is_current` marks the active one |

## Status history

| Date | Change | Issue |
|------|--------|-------|
| 2026-09-14 | v2 rebuild started: consolidated duplicated rollover logic into `lib/feeRollover.ts`, fixed a real concurrency gap in year-end apply (no claim lock, unlike year-rollover), added the Past Records archive endpoint + tab | #119 |
| 2026-09-14 | Multi-angle code review of the above found 4 confirmed gaps, all fixed same day: year-rollover's own claim didn't coordinate with year-end's new lock (cross-route race), an `array_agg` zip without `ORDER BY` that could misalign a bill's balance with a different bill's amount_paid, no format validation on `from_year` before computing the next year's label, and archive's "Waived" figure not excluding carry-forward bookkeeping waivers (diverged from Reports/Year-End/Passbook) | #119 |

## Known issues

- [ ] Archive's billed/collected/waived/unpaid aggregate is a third independent copy of the same formula that already exists in `reports/route.ts` and `lib/feeRollover.ts`'s `getRemainingOpenSummary` — flagged by code review as reuse debt, not fixed in this pass (the one place it had actually drifted — the Waived figure — was fixed; the duplication itself remains). Worth a shared `getYearFinancialSummary()` helper as part of the deferred component-split follow-up.
- [ ] Full split of `FeeManagement.tsx` (6,500+ lines, 8 tabs) into per-tab components + a Zustand store — deferred. The tabs have real cross-tab coupling (e.g. a payment/waiver action conditionally refreshes Reports/Year-End state if already loaded), so this needs to be done incrementally, one tab at a time with testing between each, rather than as one large diff. Tracked as a follow-up under #119.
- [ ] The e2e suite (`e2e/workflow-fee-management.spec.ts`, 109 cases) was not run in this environment during the v2 rebuild work — it requires `E2E_PLATFORM_ADMIN_EMAIL`/`E2E_PLATFORM_ADMIN_PASSWORD` for a platform admin that already exists in the shared dev DB, which weren't available locally. Verified instead via `tsc --noEmit` (clean) and `eslint` (no new problem categories vs. the pre-existing baseline). Should be run before merging.
- [ ] Online-payments (Cashfree) and WhatsApp reminder panels were left untouched in this pass, per the project rule against changing that code without separate explicit approval.

## Notes

- Historical/"past records" data was already fully modeled before this rebuild (`source_academic_year`/`source_ledger_id` on `student_fee_ledger`, `academic_years`, `fee_year_close`) — it just had no dedicated browsing UI. The archive endpoint and tab are a thin read layer over existing data, not a new source of truth.
- `year-end`'s apply action is now serialized per `(school_id, academic_year)` via `pg_advisory_xact_lock` rather than a row-based claim like `year-rollover` uses — apply is resumable (an admin can apply decisions for a few students today, more tomorrow, before closing), so it can't use rollover's single-shot "claim the row once" pattern.
- `generate/route.ts` was surveyed for the same duplication but doesn't share it — its concern (idempotent ledger generation, grade-resync-on-conflict) is genuinely different from the carry-forward/close-out logic in the other two routes.
