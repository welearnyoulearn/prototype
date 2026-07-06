# Academic Year Lifecycle — Proposal

**Project:** WLYL School Management Platform  
**Date:** July 2026

---

## What We Have Now

The platform manages school fee collection across an academic year. Currently these things work:

- Schools can create academic years with start and end dates
- Fee structures are set per grade per year (amounts, frequency — monthly/quarterly/annual)
- Bills are generated for all students at the start of the year
- Payments are collected and tracked against each bill
- Year-end review allows carry-forward, write-off, or leaving dues open
- Student grades are promoted at year rollover (Nursery → LKG → UKG → Grade 1 → ... → Grade 12 → Graduated)
- Reports, ledger, and exports are all scoped to the active academic year

---

## What We Recently Implemented

### 1. Pre-Primary Grade Support (Nursery / LKG / UKG)
Previously the system only worked for numeric grades 1–12. Nursery, LKG, UKG were not supported anywhere — fee setup, bill generation, sorting, rollover all broke or ignored them.

**What we built:** A single grade-ordering library (`lib/grades.ts`) used across the entire platform. All fee reports, bill generation, and year rollover now correctly handle pre-primary grades.

---

### 2. Due Date Redesign
Previously each fee category had a "due day of month" setting, creating 12 different due dates per year. Overdue calculation was inconsistent.

**What we built:** All bills now share one due date — the academic year's end date. A monthly fee still creates 12 separate trackable bills, but all become due at year-end. Overdue flips automatically when end date passes, and reverts automatically if the year is extended.

---

### 3. Academic Year Date Editing with Audit Trail
Admins could previously change a year's dates with no warning, no record, and no confirmation.

**What we built:** Before saving a date change, the system shows live impact ("X bills will become overdue"). Admin must enter their password to confirm. A full snapshot of the ledger is saved before the change as a permanent audit record, exportable as CSV.

---

### 4. Rollover Race Condition Fix
If two admins ran year rollover at the same time (double-click, two tabs), students could be promoted twice or data could be left in a broken state.

**What we built:** Database-level row locking on the academic year during rollover. Only one rollover can execute at a time; the second is safely rejected.

---

### 5. Carry-Forward Audit Trail
When unpaid dues were carried to the next year, there was no record of where they came from.

**What we built:** Every carried-forward bill includes a note showing exactly which original bills it represents. A `fee_waivers` record with type `carry_forward` is written for each original bill, so the audit trail is complete on both ends.

---

### 6. "Pending Payments" Rename
The dashboard used the label "Top Defaulters" which feels harsh when applied to students.

**What we built:** Renamed to "Highest Pending" and "Pending Payments" throughout the UI.

---

## New Plan — What We Are Going to Build

### Problem 1 — Two rollover buttons both promote students
There are two separate "Year Rollover" flows in the app (one in Fee Management, one in School Settings). Both promote student grades. If a school uses both, every student skips a grade.

**Fix:** Remove grade promotion from the Fee Management rollover. Only one route will own grade promotion. Schools are protected from accidental double-promotion.

**Effect:** No student can ever accidentally skip a grade due to running rollover twice.

---

### Problem 2 — Bill due dates go stale when a year is extended
When admin pushes the year's end date forward (e.g., exams delayed by 30 days), the `academic_years` table updates but every existing bill's `due_date` stays at the old date.

**Fix:** When end date is edited, automatically update all open (unpaid/partial) bills' due dates to match. Paid bills are not touched — they are historical records.

**Effect:** Every bill always shows the correct due date. Overdue/pending status stays accurate.

---

### Problem 3 — Carry-forward bills can be paid twice
When a bill is carried forward, the original is marked waived. But if a year is reopened for correction, both the original and the new carried bill could be paid — the student pays the same debt twice.

**Fix:** Link the original bill to the new bill by ID. Payment route checks this link and blocks payment on the original if it has already been carried forward.

**Effect:** Double collection is impossible. Finance staff get a clear error message pointing to the correct bill.

---

### Problem 4 — Switching active year has no password gate
The "Set Active" button in School Settings changes which year all fee reports, attendance, and exam data show — for all staff across the school. Currently only a browser pop-up confirmation is shown.

**Fix:** Require the admin's password before switching the active year, same as date editing.

**Effect:** Accidental year switches are prevented. Every year switch is intentional and confirmed.

---

### Problem 5 — No warning when year end is approaching
Schools get no notice that the year is ending. They discover it when bills start showing "overdue" unexpectedly.

**Fix:** 15 days before the year's end date, show a persistent warning banner at the top of Fee Management. No external notifications or new infrastructure needed — the banner appears on every page load.

**Effect:** Schools have time to review dues, make carry-forward decisions, and run rollover before the year actually ends.

---

### Problem 6 — Three scattered tabs instead of one guided flow
Year-end involves three separate tabs — Year-End Review, Year Rollover (in Fee), Year Rollover (in Settings) — with no guidance on order. Schools can run steps out of sequence and end up in inconsistent states.

**Fix:** A single "Year Transition" wizard in Fee Management with 6 ordered steps. Each step unlocks only after the previous one completes.

```
Step 1 → Review and resolve dues
Step 2 → Close fee year
Step 3 → Create next academic year
Step 4 → Snapshot + promote students
Step 5 → Generate new year bills
Step 6 → Activate new year
```

**Effect:** Schools cannot get into an inconsistent state. Every year transition follows the same clean sequence. No steps are missed or done out of order.

---

## Summary

| | Item | Status |
|--|------|--------|
| ✅ | Pre-primary grade support | Done |
| ✅ | Due date = year end date | Done |
| ✅ | Date editing with password + audit | Done |
| ✅ | Rollover race condition fix | Done |
| ✅ | Carry-forward audit trail | Done |
| ✅ | Pending Payments rename | Done |
| 🔲 | Double-promotion bug fix | Planned |
| 🔲 | Bill due date cascade on extension | Planned |
| 🔲 | Carry-forward double-payment lock | Planned |
| 🔲 | Password gate on year switching | Planned |
| 🔲 | Year-end approaching banner | Planned |
| 🔲 | Unified Year Transition Wizard | Planned |

---

*July 2026*
