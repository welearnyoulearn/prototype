# Fee Management Feature — Complete Reference

> Last verified against code: 2026-09-06
> Scope: every part of the codebase that touches school fees — database tables, API routes, and the School Admin and Parent portal screens.
> Online payments (Cashfree) and WhatsApp integration are **not merged into this branch** — see [§6](#6-online-payments-integration--status-absent-on-this-branch) for exactly what does and doesn't exist.
> No fee database tables, API routes, or School Admin screens changed since the 2026-08-31 revision of this document. The one change this session was a **Parent Overview data-freshness fix** — see the note at the end of [§2](#2-screen-by-screen-tab-by-tab) and [§10](#10-known-quirks-and-gaps).

This document explains fee management **inch by inch**: what each database table stores, what every API route accepts and returns, what every screen and tab does, and how the pieces connect into complete end-to-end workflows.

---

## Table of Contents

1. [The big picture in one paragraph](#1-the-big-picture-in-one-paragraph)
2. [Screen by screen, tab by tab](#2-screen-by-screen-tab-by-tab)
3. [Database schema, table by table](#3-database-schema-table-by-table)
4. [Every API route, in detail](#4-every-api-route-in-detail)
5. [Fee structure and setup logic](#5-fee-structure-and-setup-logic)
6. [Online payments integration — status: absent on this branch](#6-online-payments-integration--status-absent-on-this-branch)
7. [Reports and Year-End, conceptually](#7-reports-and-year-end-conceptually)
8. [Auth model — who can do what](#8-auth-model--who-can-do-what)
9. [End-to-end scenarios, step by step](#9-end-to-end-scenarios-step-by-step)
10. [Known quirks and gaps](#10-known-quirks-and-gaps)
11. [Quick-reference glossary](#11-quick-reference-glossary)

---

## 1. The big picture in one paragraph

A school defines **fee categories** (Tuition, Transport, Exam Fee, ...), each either **fixed** (one amount per grade, set once) or **variable** (a different amount per individual student — sibling discounts, custom transport routes). Once amounts are set for every grade, the admin **generates bills** — one `student_fee_ledger` row per student per billing period — which locks the plan against casual editing (further changes require an audited **Amendment**). From there, day-to-day work happens in the **Ledger**: collecting payments (full, partial, or FIFO-allocated across several open bills at once), granting **waivers**, and correcting mistakes (cancel/correct a payment, revoke/correct a waiver) — every one of these actions is logged to its own audit table. A **Student Passbook** merges a student's entire multi-year financial history into one chronological timeline. At year-end, an admin either resolves each student's balance individually (carry forward / write off / pass out) or runs a one-shot bulk rollover — either way, unresolved balances become a single lump "Previous Year Dues" bill in the new year, and grade promotion itself is a **separate, independently-triggered** action.

---

## 2. Screen by screen, tab by tab

**Screen:** `app/school-admin/components/FeeManagement.tsx` — a single large component (~6,400 lines), plus `fee-management/receipts.ts` (receipt rendering) and `fee-management/types.ts` (shared types).

### Chrome outside the tabs

- **Academic Year selector** at the top — every tab is scoped to whichever year is selected here; closed years are marked "(Closed)".
- **First-login wizard**: a full-screen modal forcing creation of the school's first academic year before anything else in this feature is usable.
- **15-day year-end banner**: turns amber when the selected year's end date is within 15 days, red once it's passed — links straight to the Year-End tab.
- **5-step setup wizard** (dismissible banner, also mirrored permanently inside the Setup tab): Academic Year → Fee Heads → Set Amounts → Generate Bills → Lock Plan.

### Tab: Overview

A "Needs Attention" banner surfaces online payments awaiting verification, a high count of overdue entries, students who've paid nothing at all, and a warning if the previous year was never formally closed. Below that: five stat cards (Total Billed, Collected — as a percentage of *net demand*, i.e. billed minus waived — Waived, Outstanding, Zero Payers), an overall collection progress bar, a class-wise collection table with highlight cards for best/worst classes, and a panel for students who've since passed out but still have unresolved dues from the ledger.

### Tab: Setup ("Fee Plan")

Where fee categories and amounts get defined.

- A "mandated order" hint: create the year → set amounts → generate bills → lock.
- A UPI ID field (only shown if online payments are enabled) — this is the school's own receiving account for the manual QR-code payment flow, not a payment-gateway credential.
- Once bills exist, a lock banner shows who locked it and when, with buttons to generate bills for any newly-added students, view the amendment history, or unlock.
- Two views: **Fee Heads & Amounts** (one card per fee category, expandable to set per-grade amounts) and **All Variable Fees** (a single spreadsheet-style grid — pick a grade+section, see every student against every variable fee head in one table, edit and save in bulk).
- Each fee-head card shows its collection progress, and offers "Manage" (expand the amount-entry form inline), "History" (every past amendment to this category), and — before bills exist — the ability to switch between fixed and variable.
- **Fixed-fee management**: one amount input per grade, with an optional "same amount for a whole grade group" (Pre-Primary/Primary/Middle/Secondary) quick-fill.
- **Variable-fee management**: pick a grade, see its student list, enter one amount per student, with a per-cell history drill-down.
- **"+ Add Fee Head"**: a 3-step wizard (name/description → billing frequency → fixed vs. variable), offering common presets or a fully custom name.
- **"Generate All Bills"**: only enabled once every active fixed fee head has an amount set for every enrolled grade. Shows a confirmation summarizing due dates before submitting.
- **Post-lock amendments**: changing an amount after bills exist requires going through an "Amend" form with a mandatory reason, which previews exactly how many pending/partial bills would be affected before committing.

### Tab: Collect ("Ledger")

Four sub-views:

1. **Daily Counter** (default): search + grade filter + status chips (All / Overdue / Partial / Never Paid / Fully Cleared). Clicking a student expands their open bills with a "Collect All" button, a "Grant Waiver" button, and a payment-history view with inline Cancel/Correct forms. The collect form lets the admin check/uncheck individual bills, edit the amount being collected (enabling a partial payment applied oldest-bill-first), pick a payment mode, date, collector name, and reference, then review and confirm. On success, a receipt can be printed immediately.
2. **Online** (only if the feature is enabled): a queue of parent-submitted manual online payments awaiting approval or rejection, each with a required reason if rejected.
3. **Pending Payments**: the full outstanding-dues list sorted by amount owed, exportable to CSV, with a one-click "Collect" that jumps straight into the counter flow for that student.
4. **Day Close**: a reconciliation view — mode-wise totals, the day's receipt-number range, a full transaction list, and a system-cash-vs-actual-cash difference calculator, ending in a "Close Day" action. **This produces a memo, not an actual lock** — see [§10](#10-known-quirks-and-gaps).

### Tab: Student Passbook ("Students")

A student directory (grade filter + search) opens into a per-student passbook: a summary header (billed/paid/waived/outstanding for the selected year), and four sections — **Bills** (grouped by academic year, with a "carried forward from" badge on any bill that originated as a prior-year rollover), **Payments** (with inline Cancel/Correct), **Waivers** (with a "show revoked" toggle and inline Revoke/Correct), and a **Full Timeline** merging every bill/payment/waiver/amendment event into one chronological, running-balance view. A separate **Print Receipts** list lets the admin reprint any past receipt by its receipt number.

### Tab: Reports

Fee Audit Report export (Excel or print-to-PDF, scoped to the whole school, one class, or one student), a 4-card balance sheet, class-wise/payment-mode/month-wise breakdowns, a category-wise annual summary, the same pending-payments defaulters list as the Collect tab, and a collapsible **Audit Log** — a single unified feed of every financial mutation across payments, corrections, waivers, ledger edits, structure changes, variable-assignment changes, category config changes, and year closures, exportable to CSV.

### Tab: Year-End

A guided, step-by-step process:
1. **Review**: summary tiles plus a count of students with unpaid dues.
2. **Decide each student**: filter by All/Continuing/Leaving, with bulk-set shortcuts and per-student buttons — **Carry** (move the balance into next year), **Passout** (only available for leavers — move to a permanent passout ledger), **Write Off** (waive with a required reason), or **Leave Open** (do nothing).
3. **Pick the carry-forward target year**, creating it inline if it doesn't exist yet, then "Apply Decisions."
4. **Statement & Close**: print a year-end statement, export the full ledger to CSV, and formally close the financial year.

A separate **Year Rollover** modal offers a faster, less granular alternative: preview how many students have pending dues, then a single confirmation carries *every* remaining balance forward at once and opens the next year automatically. A **Reopen** action (with a mandatory reason) can unlock an already-closed year for corrections.

### Tab: Leavers & Dues

A table of every non-active student (soft-removed or already passed out) who still has unresolved dues — with the same one-click "Collect" jump into the counter flow.

### Shared modals

- **Grant Waiver**: pick an open bill, choose Percentage / Fixed ₹ / Full, see a live preview of the resulting balance, enter a required reason.
- **Cancel/Correct payment** and **Revoke/Correct waiver**: the same inline-form pattern reused in both the Collect tab and the Passbook, always requiring a reason and always leaving a permanent audit trail rather than silently editing history.

### Parent Overview's Outstanding Fees tile — fixed this session

The Parent portal's own Overview screen (`app/parent/page.tsx`, separate from the ledger-style fee views this document otherwise focuses on) shows a summary tile for the selected child's outstanding balance. It read from the same fee-loading function (`loadFees`) the portal's dedicated Fees tab uses, but that function was previously only ever triggered **lazily**, the first time a parent actually visited the Fees tab — so a parent who stayed on Overview never triggered it at all, and the tile silently rendered "—" instead of the real balance, even when the school-admin side showed a genuine non-zero outstanding amount for the same student. Fixed by also calling `loadFees(...)` eagerly inside `selectChild()`'s existing academic-year-resolution step, so the balance is fetched as soon as a child is selected, regardless of which tab the parent lands on first. No fee calculation logic changed — this was purely a "when does the existing correct data actually get fetched" timing bug.

### `fee-management/receipts.ts`

Builds the actual receipt HTML — school branding (logo, custom header lines), a "FEE RECEIPT" title with receipt number, student/parent/class details, an itemized fee-line table with total, payment details, remarks, and signature lines. The signature feature here is **dual-copy printing**: every receipt renders **two copies on one A4 sheet** — an "Office Copy" and a "Payer Copy," separated by a dashed cut-line, sized to always fit on a single page. The print function deliberately waits for the school logo image to finish loading before triggering the browser's print dialog, to avoid printing a blank space where the logo should be.

---

## 3. Database schema, table by table

All from `lib/db.ts`, merging the original `CREATE TABLE` with every later `ALTER TABLE` addition.

### `fee_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id` | INT → schools, CASCADE | |
| `name` | VARCHAR(100) | |
| `description` | TEXT | |
| `frequency` | VARCHAR(20) DEFAULT 'annual' | `monthly \| quarterly \| half_yearly \| annual \| one_time` |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `category_type` | TEXT NOT NULL DEFAULT 'fixed' | `fixed \| variable` — moved into a central migration after previously being inconsistently self-healed by four different route files |
| `is_system` | BOOLEAN NOT NULL DEFAULT FALSE | Marks auto-generated heads like "Previous Year Dues"/"Passout Dues" so the fee-setup completeness gate ignores them — they're billed directly by year-end/rollover logic, never through the normal structure/generate flow |
| `created_at` | TIMESTAMPTZ | |

Unique: `(school_id, name)`.

### `fee_structures`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id`, `fee_category_id` | INT FK, CASCADE | |
| `grade` | VARCHAR(20) | |
| `amount` | NUMERIC(10,2) DEFAULT 0 | |
| `due_day` | INT DEFAULT 10 | **Vestigial** — bill generation no longer uses this; every bill's actual due date is the academic year's own end date instead |
| `academic_year` | VARCHAR(10) | |

Unique: `(school_id, fee_category_id, grade, academic_year)`.

### `student_fee_ledger` — the central bill table

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id`, `student_id` | INT FK, CASCADE | |
| `fee_category_id` | INT FK | |
| `fee_structure_id` | INT FK, nullable | NULL for variable-fee bills and system carry-forward bills |
| `academic_year` | VARCHAR(10) | Also uses the literal sentinel value `'passout'` for the always-open passout ledger |
| `period_label` | VARCHAR(50) | e.g. "April 2026", "Q1 2026", "2025-26", or "Previous Year Dues (2024-25)" |
| `amount_due` | NUMERIC(10,2) DEFAULT 0 | CHECK `>= 0` |
| `amount_paid` | NUMERIC(10,2) DEFAULT 0 | CHECK `>= 0` |
| `waiver_amount` | NUMERIC(10,2) NOT NULL DEFAULT 0 | CHECK `>= 0`. Tracked **separately** from `amount_paid` so waivers never inflate reported cash-collected figures |
| `due_date` | DATE | Set once, at generation time, to the academic year's end date |
| `status` | VARCHAR(20) DEFAULT 'pending' | `pending \| paid \| partial \| overdue \| waived \| settled` |
| `notes` | TEXT | Carry-forward/passout breakdown text |
| `source_academic_year` | VARCHAR(10), nullable | Tags which year a carried-forward bill originated from, for the "↩ 2024-25" badge shown everywhere |
| `source_ledger_id` | INT FK, nullable, self-referencing | Links a passout-ledger bill back to its original bill(s) |
| `created_at` | TIMESTAMPTZ | |

Unique: `uq_student_fee_ledger_entry (student_id, fee_category_id, academic_year, period_label)` — every upsert in generate/year-end/rollover relies on this.

### `fee_payments`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id`, `student_id` | INT FK, CASCADE | |
| `ledger_id` | INT FK → student_fee_ledger, CASCADE | |
| `amount` | NUMERIC(10,2) NOT NULL | |
| `payment_mode` | VARCHAR(20) DEFAULT 'cash' | `cash \| cheque \| dd \| upi \| online` |
| `payment_status` | VARCHAR(20) DEFAULT 'completed' | `completed \| pending_verification \| rejected \| cancelled` |
| `receipt_number` | VARCHAR(50) | **Not unique** — the original unique constraint was deliberately dropped, because a multi-bill FIFO payment inserts several `fee_payments` rows sharing one receipt number, one per fee-category line |
| `transaction_ref` | VARCHAR(200) | cheque no. / UTR / UPI reference |
| `paid_date` | DATE DEFAULT CURRENT_DATE | |
| `collected_by_name` | VARCHAR(100) | |
| `verified_by`, `verified_at`, `rejection_reason` | | For the manual online-payment verify flow |
| `cancelled_by`, `cancelled_at`, `cancel_reason` | | For payment cancellation |

### `fee_waivers`

| Column | Type | Notes |
|---|---|---|
| `waiver_type` | VARCHAR(30) DEFAULT 'percentage' | `percentage \| fixed_amount \| full \| carry_forward` — `carry_forward` is **system-only**, written exclusively by year-end bookkeeping and explicitly blocked from being set through the normal waiver-granting route |
| `waiver_value` | NUMERIC(10,2) | The raw % or ₹ entered by the admin |
| `waiver_amount` | NUMERIC(10,2) DEFAULT 0 | The actual computed amount applied |
| `reason` | TEXT NOT NULL | |
| `is_revoked` | BOOLEAN NOT NULL DEFAULT FALSE | Soft-delete pattern — waivers are never hard-deleted |
| `revoked_by`, `revoked_at`, `revoke_reason` | | |

### `fee_structure_locks`

`school_id, academic_year, locked_by, locked_at`. Unique `(school_id, academic_year)`. A row present means the year's plan is locked; deleting the row unlocks it. This is enforced **server-side**, not just hidden in the UI.

### Audit-trail tables

- **`fee_structure_amendments`**: every audited post-lock amount change — old/new amount, effective date, reason, who changed it.
- **`fee_structure_history`**: every save of a structure amount at all (even pre-lock) — a broader, always-on log created alongside the formal Amendment flow.
- **`student_fee_ledger_edits`**: per-bill direct amount overrides.
- **`fee_payment_corrections`**: every cancel/correct action on a payment, with old/new amount and mode.
- **`student_fee_assignment_history`**: every change to a variable fee's per-student amount.
- **`fee_category_changelog`**: every edit to a fee category's name/frequency/active-state/type.

### `fee_year_close`

`school_id, academic_year` (unique together), `closed_by, closed_at`, running totals for carried/written-off/still-open counts and amounts, plus `is_reopened` and reopen metadata. Created centrally so every route checking "is this year closed" gets a consistent, reliable answer — a deliberate fix, since it used to only be created inline by one route, leaving other routes to silently treat a missing table as "not closed."

### `student_fee_category_assignments`

Per-student variable-fee amounts: `fee_category_id, student_id, academic_year, amount`. Unique `(fee_category_id, student_id, academic_year)` — the same student/category pair can carry a different amount in a different year.

### `passout_students`

`school_id, student_id, passout_year, moved_by, moved_at, notes`. Unique `(school_id, student_id)`. Marks which students have had their remaining dues moved into the always-open `academic_year='passout'` ledger.

### `receipt_number_seq`

A single global sequence (`START 1000`) used to build every receipt number in the format `RCP-{school}-{year}-{sequence}`, shared across the admin counter, the parent's manual-online flow, and payment corrections.

### Cashfree scaffolding — present, unused

`school_payment_config` (encrypted secret key storage per `lib/encryption.ts`) and `payment_transactions` are fully defined in the schema, but **no API route anywhere reads or writes them**. See [§6](#6-online-payments-integration--status-absent-on-this-branch).

### Adjacent, load-bearing tables

- `schools.upi_id` — the school's own receiving UPI address for the manual QR-code payment flow.
- `academic_years` — `label, start_date, end_date, is_current`.
- `academic_year_snapshots` — a read-only audit of any edits made to an academic year's dates after bills already exist against it.
- `student_class_history` — a permanent per-year grade/section snapshot, written only by the separate grade-promotion route.

---

## 4. Every API route, in detail

Every route below uses `requireFeeAccess(school_id)` unless noted — a tenant guard that admits platform admin for any school, or school_admin/principal/vice_principal matching their own session's school. All three staff roles are attributed generically as `'School Admin'` in every audit trail — see [§10](#10-known-quirks-and-gaps).

- **`GET/POST /api/fees/categories`, `PUT/DELETE`**: fee-head CRUD. Editing `category_type` or `frequency` is blocked once any ledger row exists for that category. Deleting is blocked the same way — the admin must deactivate instead. Every change logged.
- **`GET/POST /api/fees/structures`**: per-grade amount CRUD. Re-checks the lock server-side (not just UI-hidden) and logs every real change.
- **`POST /api/fees/structures/lock`**: lock/unlock a year's plan. Unlocking has no additional business-rule guard.
- **`POST/GET /api/fees/structures/amend`**: the audited post-lock change path. Blocked if the new amount would leave any already-paid student "overpaid" relative to the new amount — that case needs a manual correction instead. A preview mode shows exactly how many bills would be affected before committing.
- **`POST /api/fees/generate`**: the bill-generation engine. Every bill's due date is the year's own end date. Builds the right number of periods per frequency (12 monthly, 4 quarterly, 2 half-yearly, 1 for annual/one-time). Uses `ON CONFLICT DO NOTHING` so re-running it is always safe. If a student has since moved grades and a bill for that period already exists, it's re-synced to the current grade's amount — never dropping below what's already been paid. Automatically locks the plan once bills are generated — the "Lock" button is really only needed for edge cases where bills exist but the lock row is somehow missing.
- **`GET/POST /api/fees/payments`**: the core collection endpoint, supporting both single-bill and multi-bill FIFO payments. Locks the targeted ledger row(s) during the transaction to prevent two cashiers double-collecting the same balance. FIFO allocation uses integer-paise arithmetic to avoid floating-point drift. One receipt number is shared across every allocated row in a multi-bill payment.
- **`POST /api/fees/payments/cancel`**: cancel or correct a completed payment, locking the row during the operation. Blocked on a closed year. A correction issues a brand-new receipt number rather than reusing the old one.
- **`GET/POST /api/fees/payments/verify`**: approve or reject a parent-submitted manual online payment, emailing the parent either way. **Does not lock the row during the operation**, unlike cancel/waivers — an inconsistency, though low real-world risk given it's a rare, manual action.
- **`GET/POST/PATCH/DELETE /api/fees/waivers`**: grant, list, correct, and revoke waivers. Every waiver amount is computed against the **remaining balance** (due minus already-paid minus already-waived), not the original amount due — so a second waiver on a partially-settled bill is always sensible. Correcting or revoking a system `carry_forward` waiver is explicitly refused — the year would need to be reopened instead, since undoing it without also undoing the matching next-year bill would let the same debt be collected twice.
- **`GET /api/fees/ledger`**: the main ledger read, with filters and opt-in pagination. Automatically flips bills between `pending` and `overdue` based on whether the year's end date has passed — and flips them back if the year gets extended.
- **`GET/DELETE/PATCH /api/fees/ledger/[id]`**: per-bill edit history, hard-delete (only allowed if nothing has been paid against it), and a direct amount override (blocked on paid/waived bills, blocked below what's already paid, blocked on a closed year).
- **`GET /api/fees/passbook`**: the full cross-year history for one student — every bill, payment, waiver, and edit merged into one chronological, running-balance timeline.
- **`GET/POST /api/fees/passout`, `GET /api/fees/removed-students`**: the passout-ledger summary and the "Leavers & Dues" data source respectively.
- **`GET/POST /api/fees/day-close`**: the reconciliation snapshot — a memo, not an enforced lock (see [§10](#10-known-quirks-and-gaps)).
- **`GET/POST /api/fees/year-end`**: the granular per-student resolution flow — carry, write off, pass out, or leave open, per student, with an automatic year-close once nothing is left unresolved.
- **`POST/GET /api/fees/year-rollover`**: the one-shot bulk alternative — carries every remaining balance at once, opens the next year, and closes the source year, all race-protected against being triggered twice. Deliberately does **not** touch grades.
- **`GET/POST /api/fees/category-assignments`**: the variable-fee per-student amount grid, replacing a cohort's assignments in bulk and syncing any already-generated bills to match.
- **`GET/PUT /api/fees/upi-id`**: the school's own UPI receiving address.
- **`GET /api/fees/upi-qr`**: generates the payment QR code. Uses a looser, any-logged-in-role auth check (not the staff-only fee guard) since parents and students need to see it too, with an explicit tenant check layered on top.
- **`GET /api/fees/audit-log`, `/audit-report`, `/audit-report/excel`, `/export`**: read-only reporting and export routes.
- **`GET/POST /api/parent/fees`**: the parent-facing equivalent — GET requires an explicit parent-to-student link check (not the staff-only fee guard); POST is the **manual** online-payment submission flow (see next section), always landing as pending verification, and checks for other already-pending submissions on the same bill so a parent can't accidentally over-submit before either gets reviewed.
- **`POST/GET /api/academic-years/rollover`**: grade promotion — a completely separate action from anything fee-related, snapshotting every student's current grade into permanent history before advancing it.

---

## 5. Fee structure and setup logic

- **Fixed fees** are grade-scoped and year-scoped — one amount per (category, grade, year) in `fee_structures`.
- **Variable fees** have no structure row at all — every student's amount lives individually in `student_fee_category_assignments`, entered either one at a time or via the combined grid.
- **"Every fixed fee needs an amount for every grade" is mostly a UI-enforced gate**, not something the bill-generation API itself fully re-validates beyond confirming at least one relevant structure or assignment exists.
- **Grade sequencing and "who counts as graduating"** are centralized in one shared module used consistently by the fee-side logic — but grade promotion itself (a separate route entirely) implements its own parallel version of "what's the next grade," rather than reusing that same shared source of truth. See [§10](#10-known-quirks-and-gaps).
- **Fee-side rollover and grade promotion are deliberately decoupled** — running one never triggers the other; an admin must explicitly do both.

---

## 6. Online payments integration — status: absent on this branch

**Cashfree is not implemented on this branch.** The database schema for it (`school_payment_config`, `payment_transactions`, including an encrypted-secret-key column) is fully scaffolded in `lib/db.ts`, but **zero API routes exist anywhere** to configure it, generate a payment link, or handle a webhook. Anyone reading only the schema would reasonably but incorrectly conclude the feature is built.

**What actually is live**, behind the "online payments" feature flag, is a **manual UPI reconciliation workflow**, not a payment gateway:
1. The school enters its own plain UPI address (not a gateway credential) in Setup.
2. A parent scans a generated QR code and pays manually through any UPI app of their choice.
3. The parent then self-reports that payment through their own portal — landing in the ledger as "pending verification," never automatically confirmed.
4. A school admin manually reviews and approves or rejects it in the Collect tab's Online sub-view.

**WhatsApp integration is similarly absent** in this feature — only a stray, non-functional comment exists in the component; no state, UI, or sending logic backs it.

---

## 7. Reports and Year-End, conceptually

The Reports tab is where an admin reconciles the whole picture — a formal audit report (exportable, scoped to the school/a class/a student), plus every breakdown view (by class, by payment mode, by month, by category) and the unified audit log.

Year-End is genuinely **two independently-triggerable mechanisms**, not one:
- **Granular** (`Year-End` tab): the admin makes an individual judgment call per student.
- **Bulk** (`Year Rollover` modal): a fast, one-shot path for schools that don't need per-student judgment.

Either way, any unresolved balance becomes a single lump "Previous Year Dues" bill in the new year, tagged so it's visually flagged everywhere it appears, while the original bills in the closed year are marked settled or waived (via a bookkeeping-only waiver type that's excluded from every "Total Waived" figure school-wide, so it never distorts reporting).

**Grade promotion is always a third, separate step** — it must be run independently of either fee-side rollover path.

---

## 8. Auth model — who can do what

- **`requireFeeAccess(school_id)`** is used by almost every route in this feature — the standard staff-only, tenant-matched guard.
- **`getAnySession()` plus an explicit link check** is used where parents or students need direct access — the parent-fees route and the UPI-QR route.
- All three staff roles admitted by `requireFeeAccess` (school_admin, principal, vice_principal) are recorded generically as `"School Admin"` in every audit trail that falls back to the server-derived actor name — a real loss of granularity for "who actually did this," though not a security gap (see [§10](#10-known-quirks-and-gaps)).
- Most mutating routes accept a client-supplied "done by" name as an override on top of the session-derived default, rather than strictly re-validating it — consistent with the rest of the codebase's audit conventions, but worth knowing this is a display convenience, not a cryptographic guarantee.

---

## 9. End-to-end scenarios, step by step

### Scenario A: Setting up a new fee structure at the start of a year

1. The school has an active academic year (created via the first-login wizard if needed).
2. The admin creates a fee category — e.g. "Tuition Fee," monthly, fixed.
3. They enter an amount for every grade (or quick-fill a whole grade group at once) and save — each real change is logged.
4. Once every active fixed fee head has an amount for every enrolled grade, "Generate All Bills" becomes available. Confirming it inserts one bill per student per billing period, then automatically locks the plan.
5. Any further amount change now requires going through the audited Amendment flow, which also retroactively updates any still-unpaid bills for that grade and category.

### Scenario B: A full payment is recorded and a receipt printed

1. The admin opens a student's open bills and clicks "Collect All," which pre-fills the full outstanding amount.
2. They pick a payment mode, date, and collector name, confirm, and the payment is recorded — locking the relevant bill row during the transaction, generating one shared receipt number, and marking every fully-covered bill `paid`.
3. Printing the receipt renders **two copies on one page** — an Office Copy and a Payer Copy — with an itemized breakdown of every fee line covered, the payment details, and a signature block.

### Scenario C: A partial payment, followed by a waiver for the remainder

1. The admin collects less than the full outstanding amount — the system allocates what was paid across the selected bills oldest-due-first, leaving the last one only partially covered.
2. Later, the admin opens that student again and grants a waiver on the specific remaining bill — computed against what's *actually still owed* (correctly accounting for the earlier partial payment), not the original full amount.
3. The bill now shows: billed, partially paid, the remainder waived, and a zero balance — with the waiver itself visible (and revocable/correctable) in the student's passbook.

### Scenario D: Year-end — what happens to unpaid balances, and how the next year starts

1. The admin reviews every student with an unpaid balance and decides, one by one (or in bulk, via the rollover modal), what happens to each: carried forward, written off, moved to the passout ledger (leavers only), or left open.
2. For every "carry" decision, one consolidated "Previous Year Dues" bill is created in the new year, and the original unresolved bills in the old year are closed out with a bookkeeping-only waiver that never distorts reported totals.
3. Once nothing is left unresolved for the year, it closes automatically — no separate manual step required.
4. Grade promotion is a completely separate action the admin must trigger on its own — neither year-end path touches a student's grade.
5. Once the admin returns to Setup for the new year and generates that year's regular bills, each carried-forward student already has their lump prior-year-dues bill sitting alongside the new year's normal fees, clearly badged and independently collectible.

---

## 10. Known quirks and gaps

- **Day Close doesn't actually lock anything.** The UI implies that closing a day prevents further edits to it, but nothing anywhere actually blocks a new payment from being recorded against an already-closed date. It's a reconciliation snapshot, not an enforcement mechanism.
- **The manual online-payment verify action isn't row-locked** during processing, unlike cancel and waiver actions — a double-click could theoretically double-process the same approval, though this is a rare, single-admin manual action in practice.
- **Grade promotion has its own, separate implementation of "what's the next grade in sequence"** rather than reusing the same shared source of truth the rest of the fee feature relies on for the same concept. If the two ever drift out of sync, grade promotion and fee-side "is this student graduating" logic could disagree about a given student.
- **Three distinct admin roles are recorded as one generic name in every audit trail** that relies on the server-derived actor — "who actually approved this waiver" can't always be reconstructed precisely from the logs alone.
- **The per-category due-day setting is dead weight** — it still exists in the schema, the validation, and the UI, but bill generation no longer uses it at all; every bill's real due date is the academic year's own end date.
- **The Cashfree schema exists with no code behind it** — a partially-scaffolded feature that could easily be mistaken for a finished one by anyone reading only the database structure.
- **A couple of internal tab-name values have no corresponding screen** — harmless today since nothing in the UI ever actually sets them, but a maintenance trap for anyone extending the tab system later.
- **Client-supplied "done by" names are trusted, not independently verified** against the authenticated session — consistent with the rest of the app's conventions, but worth remembering that the name on a receipt or audit entry is a display convenience, not proof of who acted.
- **Reopening a closed year unlocks editing for every bill, payment, and waiver in that entire year at once** — even if the actual need was to fix a single record. This is the intended behavior, but it's a wide blast radius for what's often meant to be a narrow correction, and worth treating with real caution operationally.
- **The variable-fee assignment grid has no pagination**, unlike the ledger and payments lists, which both deliberately support it — fine at typical school sizes today, but an inconsistency in an otherwise careful pattern.
- **The Parent Overview tile and the Parent Fees tab both call the same `loadFees` function independently** rather than sharing one fetch-on-child-select lifecycle — fixed this session so Overview also triggers it eagerly (see §2), but worth knowing there are still two call sites for the same fetch rather than one central one, should a similar timing gap reappear elsewhere in the Parent portal.

---

## 11. Quick-reference glossary

| Term | Meaning |
|---|---|
| **Fixed fee** | One amount per grade, set once in Setup — applies uniformly to every student in that grade |
| **Variable fee** | A different amount per individual student — sibling discounts, custom routes, etc. |
| **Generate Bills** | The action that turns a fee structure into actual per-student, per-period rows in the ledger — also what locks the plan |
| **Lock** | Once bills exist, further amount changes require the audited Amendment flow rather than a plain edit |
| **Amendment** | An audited, reason-required change to a locked fee amount, previewed before committing |
| **FIFO allocation** | When a payment doesn't cover every selected bill in full, the amount is applied oldest-due-first |
| **Waiver** | A discretionary reduction in what's owed — percentage, fixed amount, or full — always computed against the remaining balance, never the original amount |
| **`carry_forward` waiver** | A system-only bookkeeping waiver type used to close out a year's unresolved bill once its balance has been moved into a new-year bill — excluded from all "Total Waived" reporting |
| **Passbook** | A single student's entire multi-year financial history, merged into one chronological, running-balance timeline |
| **Day Close** | A reconciliation snapshot for one day's collections — a memo, not an enforced lock |
| **Year-End (granular)** | Resolving each student's unpaid balance individually — carry, write off, pass out, or leave open |
| **Year Rollover (bulk)** | The one-shot alternative that carries every remaining balance forward at once and opens the next year automatically |
| **Passout ledger** | An always-open, special academic-year bucket (`'passout'`) holding dues for students who've left the school but still owe money |
| **Grade promotion** | A completely separate action from fee rollover — must be triggered independently to actually advance students' grades |
