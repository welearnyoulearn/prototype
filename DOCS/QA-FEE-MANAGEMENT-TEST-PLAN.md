# Fee Management — QA Test Plan

**Module:** Fee Management  
**Branch:** dev  
**Scope:** All fee tabs except Online Payments, UPI/QR, WhatsApp  
**Version:** 1.0  
**Total Test Cases:** 260+

---

## 1. Test Strategy

### 1.1 Scope

| In Scope | Out of Scope |
|----------|-------------|
| Fee Categories CRUD | Online / UPI payments |
| Fee Structure setup | QR code flows |
| Fee Generation (monthly / quarterly / annual / one-time) | WhatsApp reminders |
| Ledger view, edit, overdue detection | Push notifications |
| Payment collection (cash / cheque / dd / upi / online modes) | |
| FIFO multi-entry allocation | |
| Waiver grant / revoke | |
| Student Passbook | |
| Counter Collection | |
| Reports (grade / category / mode / export) | |
| Year-End (carry / write-off / close / reopen) | |
| Day Close | |
| Security (auth, tenant, injection) | |

### 1.2 Test Levels

1. **API** — direct HTTP calls with known payloads (positive, negative, auth, edge)  
2. **DB** — SQL validation queries confirming data integrity after operations  
3. **UI** — Playwright e2e covering critical user paths  
4. **Security** — auth bypass, tenant escape, injection  
5. **Performance** — fee generation and report load at 100 / 1 000 / 5 000 / 10 000 students  
6. **Regression** — full critical path suite

### 1.3 Test Data Setup

```sql
-- Minimum test data per test run
-- School with ID = :school_id, school_code = 'TST'
-- Students: 10 active across grade 10-A, 10-B, 11-A
-- Categories: Tuition (monthly), Transport (quarterly), Books (annual), Hostel (variable)
-- Fee structure for 2025-26 set for all grades
-- Academic year: 2025-26
```

### 1.4 Priority / Severity Matrix

| Priority | Severity | Examples |
|----------|----------|---------|
| P1 | Critical | Payment recorded wrong amount, FIFO order broken, closed-year guard bypassed |
| P2 | High | Waiver wrong calculation, ledger status not updated, audit missing |
| P3 | Medium | Filter not working, report number mismatch |
| P4 | Low | UI label, column sort, minor display |

---

## 2. Functional Test Cases

### 2.1 Fee Categories

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| FC-001 | Create category — monthly fixed | Logged in as school_admin | POST /api/fees/categories with name, frequency=monthly, category_type=fixed | `{school_id, name:"Tuition Fee", frequency:"monthly", category_type:"fixed"}` | 201, category created with is_active=true | P1 |
| FC-002 | Create category — quarterly | Valid school_admin session | POST with frequency=quarterly | `{frequency:"quarterly"}` | 201, frequency stored as quarterly | P1 |
| FC-003 | Create category — annual | Valid session | POST with frequency=annual | `{frequency:"annual"}` | 201 | P2 |
| FC-004 | Create category — one_time | Valid session | POST with frequency=one_time | `{frequency:"one_time"}` | 201 | P2 |
| FC-005 | Create category — variable | Valid session | POST with category_type=variable | `{category_type:"variable"}` | 201, category_type=variable | P1 |
| FC-006 | Duplicate category name rejected | Category "Tuition Fee" exists | POST with same name | `{name:"Tuition Fee"}` | 409, "Category name already exists" | P1 |
| FC-007 | Category name case-insensitive uniqueness | "Tuition Fee" exists | POST with "tuition fee" | `{name:"tuition fee"}` | 409 (unique constraint fires) | P2 |
| FC-008 | Create without name rejected | Valid session | POST without name field | `{school_id, frequency:"monthly"}` | 400, "school_id and name required" | P1 |
| FC-009 | Create without school_id rejected | Valid session | POST without school_id | `{name:"Test"}` | 400, "school_id required" | P1 |
| FC-010 | List categories returns structure_count | 2 structures exist for category | GET /api/fees/categories?school_id=X | — | structure_count=2 in response | P2 |
| FC-011 | List categories returns ledger_count | 5 ledger entries for category | GET /api/fees/categories?school_id=X | — | ledger_count=5 | P2 |
| FC-012 | Update category name | Category exists | PUT with new name | `{id, name:"Updated Name"}` | 200, name updated, changelog row created | P2 |
| FC-013 | Deactivate category | Category exists | PUT with is_active=false | `{id, is_active:false}` | 200, is_active=false | P2 |
| FC-014 | Delete category with no ledger data | Category has no ledger entries | DELETE ?id=X | — | 200, category deleted | P2 |
| FC-015 | Delete category with ledger data rejected | Category has ledger entries | DELETE ?id=X | — | 409, error="has_ledger_data" | P1 |
| FC-016 | Delete without id rejected | Valid session | DELETE without id param | — | 400, "id required" | P2 |
| FC-017 | GET categories forbidden for wrong school | school_admin of school 1 | GET with school_id=2 | — | 403 Forbidden | P1 |
| FC-018 | POST categories forbidden for wrong school | school_admin of school 1 | POST with school_id=2 | — | 403 Forbidden | P1 |
| FC-019 | platform_admin can access any school | platform_admin session | GET with any school_id | — | 200 | P2 |
| FC-020 | Unauthenticated request rejected | No cookie | GET /api/fees/categories | — | 401 | P1 |

### 2.2 Fee Structures

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| FS-001 | Set structure amount for grade | Category exists | POST /api/fees/structures | `{school_id, academic_year:"2025-26", structures:[{fee_category_id, grade:"10", amount:5000, due_day:10}]}` | 201, structure saved | P1 |
| FS-002 | Upsert existing structure | Structure exists for grade 10 | POST same grade with new amount | `{amount:6000}` | 200, amount updated (ON CONFLICT DO UPDATE) | P1 |
| FS-003 | Set due_day | — | POST with due_day=15 | `{due_day:15}` | 201, due_day=15 stored | P2 |
| FS-004 | Default due_day=10 when not provided | — | POST without due_day | — | 201, due_day=10 | P2 |
| FS-005 | Zero amount allowed | — | POST with amount=0 | `{amount:0}` | 201, amount=0.00 | P2 |
| FS-006 | Multiple grades in one request | — | POST structures array with grades 9,10,11 | `[{grade:"9",...},{grade:"10",...},{grade:"11",...}]` | 201, 3 structures created | P1 |
| FS-007 | GET structures filters by academic_year | Two years of structures | GET ?academic_year=2025-26 | — | Only 2025-26 structures returned | P2 |
| FS-008 | Structure history logged on update | Structure exists | POST with new amount | — | Row in fee_structure_history with old/new amount | P2 |
| FS-009 | Missing school_id rejected | — | POST without school_id | — | 400 | P1 |
| FS-010 | Missing academic_year rejected | — | POST without academic_year | — | 400, "school_id, academic_year, structures required" | P1 |
| FS-011 | Forbidden for wrong school | school_admin school 1 | POST with school_id=2 | — | 403 | P1 |
| FS-012 | Unauthenticated rejected | No cookie | POST /api/fees/structures | — | 401 | P1 |

### 2.3 Fee Generation

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| FG-001 | Generate monthly — 12 ledger rows per student | 1 monthly category, 1 student in grade 10 | POST /api/fees/generate | `{school_id, academic_year:"2025-26"}` | created=12, student has 12 ledger rows with labels Apr 2025–Mar 2026 | P1 |
| FG-002 | Generate quarterly — 4 rows per student | 1 quarterly category, 1 student | POST /api/fees/generate | same | created=4, labels Q1–Q4 2025-26 | P1 |
| FG-003 | Generate annual — 1 row per student | 1 annual category, 1 student | POST /api/fees/generate | same | created=1, label "2025-26" | P1 |
| FG-004 | Generate one_time — 1 row per student | 1 one_time category, 1 student | POST /api/fees/generate | same | created=1 | P1 |
| FG-005 | Generate is idempotent | Already generated | POST /api/fees/generate again | same | created=0, skipped=12 (no duplicates) | P1 |
| FG-006 | Generate for specific grade only | Students in grades 9,10,11 | POST with grade="10" | `{grade:"10"}` | Only grade 10 students get ledger entries | P1 |
| FG-007 | Variable category skipped unless assigned | Variable category, no assignments | POST /api/fees/generate | — | Variable category not generated; created=0 for that category | P1 |
| FG-008 | Variable category generates for assigned students | Variable category, 3 students assigned | POST /api/fees/generate | — | created=3 (one per assigned student) | P1 |
| FG-009 | Past due_date entries auto-marked overdue | Generate with due_day=1 for a past month | POST /api/fees/generate | — | Entries with due_date < today have status=overdue | P1 |
| FG-010 | Future entries marked pending | Generate for current/future months | POST /api/fees/generate | — | Future entries have status=pending | P1 |
| FG-011 | No structure → 400 | No structure configured | POST /api/fees/generate | — | 400, "No fee structures found for this year" | P1 |
| FG-012 | Missing school_id → 400 | — | POST without school_id | — | 400 | P1 |
| FG-013 | Missing academic_year → 400 | — | POST without academic_year | — | 400 | P1 |
| FG-014 | Multiple categories generate correct row count | 3 categories (monthly, quarterly, annual), 2 students | POST /api/fees/generate | — | created = (12+4+1) × 2 = 34 | P1 |
| FG-015 | Unique constraint on (student, category, year, period) | Generated once | POST again | — | skipped = all, no duplicate rows in DB | P1 |
| FG-016 | Forbidden for wrong school | school_admin school 1 | POST with school_id=2 | — | 403 | P1 |
| FG-017 | Unauthenticated rejected | No cookie | POST /api/fees/generate | — | 401 | P1 |
| FG-018 | Period labels correct — monthly Apr start | academic_year="2025-26" | POST generate, check DB | — | First monthly label = "Apr 2025", last = "Mar 2026" | P2 |
| FG-019 | Quarterly labels correct | academic_year="2025-26" | POST generate quarterly | — | Labels: "Q1 2025-26", "Q2 2025-26", "Q3 2025-26", "Q4 2025-26" | P2 |
| FG-020 | Monthly due dates use due_day | due_day=15 in structure | POST generate | — | Every ledger due_date is the 15th of each month | P2 |

### 2.4 Ledger

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| LD-001 | GET ledger returns all entries for school | Entries exist | GET /api/fees/ledger?school_id=X | — | All entries with student_name, category_name, balance | P1 |
| LD-002 | Filter by grade | Entries for grades 9,10,11 | GET ?grade=10 | — | Only grade 10 entries | P1 |
| LD-003 | Filter by status=pending | Mix of statuses | GET ?status=pending | — | Only pending entries | P1 |
| LD-004 | Filter by status=overdue | Mix of statuses | GET ?status=overdue | — | Only overdue entries | P1 |
| LD-005 | Filter by status=paid | Mix of statuses | GET ?status=paid | — | Only paid entries | P1 |
| LD-006 | Filter by student_id | Multiple students | GET ?student_id=X | — | Only that student's entries | P1 |
| LD-007 | Auto-overdue on GET | Entry with due_date yesterday, status=pending | GET ledger | — | Entry now has status=overdue | P1 |
| LD-008 | Balance calculated correctly | amount_due=5000, amount_paid=2000 | GET ledger | — | balance=3000 in response | P1 |
| LD-009 | days_overdue calculated correctly | due_date 5 days ago | GET ledger | — | days_overdue=5 | P2 |
| LD-010 | has_edits=true when edits exist | Ledger edit made | GET ledger | — | has_edits=true for that entry | P2 |
| LD-011 | Inline edit — amount updated | Ledger entry exists | PATCH /api/fees/ledger/:id `{amount:6000, reason:"Revised fee"}` | — | 200, amount_due=6000 | P1 |
| LD-012 | Inline edit — audit record created | — | PATCH and check DB | — | Row in student_fee_ledger_edits with old/new amount, reason, changed_by | P1 |
| LD-013 | Inline edit — status recalculated after edit | amount_paid=5000, edit reduces amount_due to 4000 | PATCH | — | status becomes paid | P1 |
| LD-014 | Delete ledger entry | Ledger entry exists, no payments | DELETE /api/fees/ledger/:id | — | 200, entry removed from DB | P2 |
| LD-015 | GET edit history for entry | 3 edits made | GET /api/fees/ledger/:id | — | Returns array of 3 edit records | P2 |
| LD-016 | Missing school_id → 400 | — | GET without school_id | — | 400 | P1 |
| LD-017 | Forbidden for wrong school | school_admin school 1 | GET with school_id=2 | — | 403 | P1 |
| LD-018 | total_paid_confirmed reflects only completed payments | 2 payments: 1 completed, 1 pending_verification | GET ledger | — | total_paid_confirmed = only completed payment sum | P2 |
| LD-019 | Combine grade + status filters | — | GET ?grade=10&status=overdue | — | Only grade 10 overdue entries | P2 |
| LD-020 | Unauthenticated rejected | No cookie | GET /api/fees/ledger | — | 401 | P1 |

### 2.5 Payments

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| PY-001 | Record cash payment — full amount | Ledger entry, amount_due=5000, amount_paid=0 | POST /api/fees/payments `{ledger_id, amount:5000, payment_mode:"cash"}` | — | 201, status=paid, receipt generated | P1 |
| PY-002 | Record partial payment | amount_due=5000 | POST with amount=2000 | `{amount:2000}` | 201, status=partial, amount_paid=2000 | P1 |
| PY-003 | Status becomes paid when fully paid | amount_due=5000, amount_paid=2000 | POST amount=3000 | `{amount:3000}` | status=paid | P1 |
| PY-004 | Overpayment rejected | amount_due=5000, amount_paid=0 | POST amount=6000 | `{amount:6000}` | 400, "Amount exceeds balance due (₹5000.00)" | P1 |
| PY-005 | Payment mode — cheque | — | POST with payment_mode="cheque" | `{payment_mode:"cheque"}` | 201, mode=cheque stored | P2 |
| PY-006 | Payment mode — dd | — | POST with payment_mode="dd" | `{payment_mode:"dd"}` | 201 | P2 |
| PY-007 | Payment mode — upi | — | POST with payment_mode="upi" | `{payment_mode:"upi"}` | 201 | P2 |
| PY-008 | Transaction ref stored | — | POST with transaction_ref="CHQ123" | `{transaction_ref:"CHQ123"}` | 201, transaction_ref in DB | P2 |
| PY-009 | paid_date stored | — | POST with paid_date="2025-06-01" | `{paid_date:"2025-06-01"}` | 201, paid_date=2025-06-01 | P2 |
| PY-010 | Invalid paid_date format rejected | — | POST with paid_date="01-06-2025" | `{paid_date:"01-06-2025"}` | 400, "paid_date must be YYYY-MM-DD" | P1 |
| PY-011 | Future paid_date rejected | — | POST with paid_date=tomorrow | — | 400, "paid_date must be a valid past date" | P1 |
| PY-012 | paid_date before 2000 rejected | — | POST with paid_date="1999-12-31" | — | 400, "paid_date must be a valid past date" | P2 |
| PY-013 | Receipt number generated | — | POST payment | — | receipt_number matches format RCP-XXX-YYYY-NNNNNN | P1 |
| PY-014 | Receipt numbers are unique | 2 payments recorded | Check DB | — | Different receipt_numbers | P1 |
| PY-015 | Payment blocked on closed year | Year closed (is_reopened=false) | POST payment | — | 409, "This academic year is closed" | P1 |
| PY-016 | Multi-entry FIFO — oldest allocated first | 3 ledger entries (Jun, Jul, Aug) | POST `{ledger_ids:[...], total_amount:3000}` | 3 entries, 1000 each | Jun entry paid first, Jul second, Aug last | P1 |
| PY-017 | Multi-entry FIFO — shared receipt number | 2 entries allocated | POST multi | — | All allocations share one receipt_number | P1 |
| PY-018 | Multi-entry FIFO — partial allocation | total_amount=1500, 2 entries 1000 each | POST multi | `{total_amount:1500}` | First entry paid=1000 (paid), second=500 (partial) | P1 |
| PY-019 | Multi-entry FIFO — skips paid entries | Entry 1 = paid, Entry 2 = pending | POST multi, total=2000 | — | Only entry 2 gets allocation | P1 |
| PY-020 | Multi-entry FIFO — skips waived entries | Entry 1 = waived, Entry 2 = pending | POST multi | — | Only entry 2 allocated | P1 |
| PY-021 | GET payments by student | 3 payments for student X | GET ?student_id=X | — | Returns 3 payment records | P1 |
| PY-022 | GET payments by ledger_id | 2 payments for ledger 5 | GET ?ledger_id=5 | — | Returns 2 payment records | P1 |
| PY-023 | Missing payment_mode rejected | — | POST without payment_mode | — | 400 | P1 |
| PY-024 | Missing student_id rejected | — | POST without student_id | — | 400 | P1 |
| PY-025 | Ledger not found → 404 | Non-existent ledger_id | POST with invalid ledger_id | `{ledger_id:99999}` | 404, "Ledger entry not found" | P1 |
| PY-026 | Forbidden for wrong school | school_admin school 1 | POST with school_id=2 | — | 403 | P1 |
| PY-027 | Unauthenticated rejected | No cookie | POST /api/fees/payments | — | 401 | P1 |
| PY-028 | Exact match payment → status=paid | amount_due=3000 | POST amount=3000 | — | status=paid, not partial | P1 |
| PY-029 | Zero-amount payment rejected | — | POST amount=0 | `{amount:0}` | 400 (exceeds balance of 5000 — wait, balance=0 already if waived — test with unwaived: balance=5000, amount=0 should be rejected by amount <= 0 guard or exceed check) | P2 |
| PY-030 | GET payments returns category_name | — | GET ?ledger_id=X | — | Response includes category_name from join | P2 |

### 2.6 Waivers

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| WV-001 | Full waiver | amount_due=5000, amount_paid=0 | POST /api/fees/waivers `{waiver_type:"full", reason:"Scholarship"}` | — | waiver_amount=5000, status=waived | P1 |
| WV-002 | Full waiver on partially paid entry | amount_due=5000, amount_paid=2000 | POST full waiver | — | waiver_amount=3000 (remaining only), status=waived | P1 |
| WV-003 | Percentage waiver — 50% | amount_due=5000, amount_paid=0 | POST `{waiver_type:"percentage", waiver_value:50}` | — | waiver_amount=2500, status=partial | P1 |
| WV-004 | Percentage waiver on remaining balance | amount_due=5000, amount_paid=3000 (remaining=2000) | POST 50% waiver | — | waiver_amount=1000 (50% of 2000), status=waived (paid+waiver>=due) | P1 |
| WV-005 | Fixed waiver | amount_due=5000, amount_paid=0 | POST `{waiver_type:"fixed_amount", waiver_value:1000}` | — | waiver_amount=1000, status=partial | P1 |
| WV-006 | Fixed waiver capped at remaining balance | amount_due=5000, amount_paid=4000 (remaining=1000) | POST fixed=2000 | — | waiver_amount=1000 (capped), status=waived | P1 |
| WV-007 | Waiver on fully paid entry → 400 | amount_paid=5000, amount_due=5000 | POST full waiver | — | 400, "Nothing to waive — ledger entry is already fully paid" | P1 |
| WV-008 | Waiver reason required | — | POST without reason | `{waiver_type:"full"}` | 400, reason required | P1 |
| WV-009 | Waiver stored in DB with all fields | — | POST waiver, check DB | — | fee_waivers row with correct waiver_type, value, amount, reason, is_revoked=false | P1 |
| WV-010 | Ledger waiver_amount updated | — | POST waiver, GET ledger | — | ledger.waiver_amount increased by waiver_amount | P2 |
| WV-011 | Ledger amount_paid updated after waiver | amount_due=5000, amount_paid=0, waiver=full | POST waiver | — | ledger.amount_paid = 5000 | P1 |
| WV-012 | Revoke waiver | Waiver exists | DELETE /api/fees/waivers?id=X | — | 200, is_revoked=true, ledger recalculated | P1 |
| WV-013 | Revoke waiver — ledger status recalculated | Waiver caused status=waived, payment=0 | DELETE waiver | — | ledger status reverts to pending or overdue | P1 |
| WV-014 | Revoke already revoked → 404 | Waiver already revoked | DELETE /api/fees/waivers?id=X | — | 404, "Waiver not found or already revoked" | P1 |
| WV-015 | Revoke with reason stored | — | DELETE ?id=X&reason="Error" | — | revoke_reason="Error" in DB | P2 |
| WV-016 | GET waivers excludes revoked by default | 2 waivers: 1 active, 1 revoked | GET /api/fees/waivers | — | Returns only 1 (active) | P2 |
| WV-017 | GET waivers includes revoked with show_revoked=1 | — | GET ?show_revoked=1 | — | Returns both waivers | P2 |
| WV-018 | GET waivers by student_id | — | GET ?student_id=X | — | Only that student's waivers | P2 |
| WV-019 | GET waivers by ledger_id | — | GET ?ledger_id=X | — | Only waivers for that ledger entry | P2 |
| WV-020 | Forbidden for wrong school | school_admin school 1 | POST with school_id=2 | — | 403 | P1 |
| WV-021 | Unauthenticated rejected | No cookie | POST /api/fees/waivers | — | 401 | P1 |
| WV-022 | 0% percentage waiver → nothing to waive | amount_paid=amount_due | POST 0% | — | 400 "Nothing to waive" | P2 |

### 2.7 Student Passbook

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| PB-001 | GET passbook returns bills | Student has 3 ledger entries | GET /api/fees/passbook?school_id=X&student_id=Y | — | Response includes bills array with 3 entries | P1 |
| PB-002 | GET passbook returns payments | Student has 2 payments | GET passbook | — | Response includes payments array | P1 |
| PB-003 | GET passbook returns waivers | Student has 1 waiver | GET passbook | — | Response includes waivers array | P1 |
| PB-004 | Outstanding balance calculated | amount_due=10000, amount_paid=3000, waived=2000 | GET passbook | — | outstanding = 5000 | P1 |
| PB-005 | Chronological ordering | Bills from Apr, Jun, Aug | GET passbook | — | Ordered by date ascending | P2 |
| PB-006 | Missing student_id → 400 | — | GET without student_id | — | 400 | P1 |
| PB-007 | Forbidden for wrong school | school_admin school 1 | GET with school_id=2 | — | 403 | P1 |
| PB-008 | Unauthenticated rejected | No cookie | GET /api/fees/passbook | — | 401 | P1 |

### 2.8 Counter Collection

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| CC-001 | Search student by name in collection | Student exists | GET /api/students?name=X | — | Student found in results | P1 |
| CC-002 | Multi-fee FIFO allocation via collection | 3 pending entries | POST /api/fees/payments `{ledger_ids:[1,2,3], total_amount:5000}` | — | Oldest entries allocated first | P1 |
| CC-003 | All allocations share receipt | 3 entries allocated | POST multi | — | All 3 payment rows have same receipt_number | P1 |
| CC-004 | Receipt number format correct | — | POST payment | — | receipt_number matches /^RCP-\d{3}-\d{4}-\d{6}$/ | P2 |
| CC-005 | Day close — submit cash count | Payments exist today | POST /api/fees/day-close `{date:"2025-06-01", actual_cash:5000}` | — | 200, record saved | P1 |
| CC-006 | Day close — by_mode breakdown | Today: cash=3000, cheque=2000 | GET /api/fees/day-close | — | by_mode.cash.total=3000, by_mode.cheque.total=2000 | P1 |
| CC-007 | Day close — difference calculated | system_cash=3000, actual_cash=2500 | POST day-close | — | difference=-500 | P2 |
| CC-008 | Day close — receipt range | First receipt RCP-001-2025-000001, last RCP-001-2025-000005 | GET day-close | — | receipts.first and receipts.last correct | P2 |
| CC-009 | Day close idempotent | Already closed today | POST day-close again | — | Upserts (no duplicate), 200 | P2 |
| CC-010 | already_closed flag set | Day already closed | GET day-close | — | already_closed=true | P2 |

### 2.9 Reports & Overview

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| RP-001 | Overview stats — summary totals | Payments exist | GET /api/fees/stats | — | total_due, total_collected, total_outstanding match DB sums | P1 |
| RP-002 | Overview — by_class breakdown | Students in 3 grades | GET /api/fees/stats | — | by_class array with 3 entries | P1 |
| RP-003 | Overview — top_defaulters max 10 | 15 defaulters exist | GET /api/fees/stats | — | top_defaulters.length <= 10 | P2 |
| RP-004 | Overview — by_payment_mode | Cash and cheque payments | GET /api/fees/stats | — | by_payment_mode array with cash, cheque entries | P2 |
| RP-005 | Overview — monthly_trend last 12 months | Payments in multiple months | GET /api/fees/stats | — | monthly_trend has ≤12 entries | P2 |
| RP-006 | Overview — unbilled_students count | 5 students with no ledger entries | GET /api/fees/stats | — | unbilled_students=5 | P2 |
| RP-007 | Reports — byGrade breakdown | Students in grades 9,10,11 | GET /api/fees/reports | — | byGrade array with 3+ entries | P1 |
| RP-008 | Reports — byCategory breakdown | 3 categories | GET /api/fees/reports | — | byCategory has 3 entries | P1 |
| RP-009 | Reports — byMode breakdown | Multiple payment modes | GET /api/fees/reports | — | byMode correct | P1 |
| RP-010 | Reports — balance totals consistent | total_billed=total_collected+total_outstanding+total_waived | GET /api/fees/reports | — | balance equation holds | P1 |
| RP-011 | Reports — defaulters list | 3 defaulters | GET /api/fees/reports | — | defaulters array with parent_phone | P2 |
| RP-012 | Missing school_id → 400 | — | GET /api/fees/stats without school_id | — | 400 | P1 |
| RP-013 | Missing academic_year → 400 | — | GET without academic_year | — | 400 | P1 |
| RP-014 | Forbidden for wrong school | school_admin school 1 | GET with school_id=2 | — | 403 | P1 |

### 2.10 Year-End

| TC-ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Priority |
|-------|----------|---------------|-------|-----------|-----------------|----------|
| YE-001 | GET year-end — groups students by outstanding | 3 students with unpaid bills | GET /api/fees/year-end?school_id=X&academic_year=2025-26 | — | students array with 3 entries, each showing bills | P1 |
| YE-002 | GET year-end — is_leaver=true for grade 12 | Grade 12 student with dues | GET year-end | — | is_leaver=true, leaver_reason="Graduating (Grade 12)" | P1 |
| YE-003 | GET year-end — is_leaver=true for inactive student | student.status=inactive | GET year-end | — | is_leaver=true, leaver_reason="Transferred / Left" | P1 |
| YE-004 | GET year-end — target_year calculated | from_year=2025-26 | GET year-end | — | target_year="2026-27" | P2 |
| YE-005 | Apply carry forward | Active student (not grade 12) with dues | POST ?action=apply `{decisions:[{student_id, decision:"carry"}], to_year:"2026-27"}` | — | Ledger entry created in 2026-27 with "Previous Year Dues" category | P1 |
| YE-006 | Carry forward auto-creates Previous Year Dues category | Category doesn't exist | POST carry action | — | fee_categories row created with name="Previous Year Dues", frequency=one_time | P1 |
| YE-007 | Carry forward creates correct ledger entry | from_year=2025-26, carry ₹3000 | POST carry | — | Ledger entry: period_label="Previous Year Dues (2025-26)", amount_due=3000, due_date=2026-04-30 | P1 |
| YE-008 | Carry forward marks old bills as waived | Bills carried forward | POST carry | — | Original bills status=waived, waiver reason="Carried forward to 2026-27" | P1 |
| YE-009 | Carry forward blocked for grade 12 student | Grade 12 student | POST carry for grade 12 | — | 400, "Cannot carry forward for a graduating/transferred student" | P1 |
| YE-010 | Write-off decision | Student with dues | POST ?action=apply `{decisions:[{decision:"writeoff", reason:"Scholarship"}]}` | — | Bills marked waived, waiver records created | P1 |
| YE-011 | Leave open decision | Student with dues | POST ?action=apply `{decisions:[{decision:"open"}]}` | — | Bills unchanged, counted in open totals | P1 |
| YE-012 | Close year | Decisions applied | POST ?action=close | — | fee_year_close record created with carry/writeoff/open totals | P1 |
| YE-013 | Closed year — payments blocked | Year closed | POST /api/fees/payments for closed year | — | 409, "This academic year is closed" | P1 |
| YE-014 | Closed year — ledger edit blocked | Year closed | PATCH /api/fees/ledger/:id | — | Should return 409 or block edit (verify in code) | P1 |
| YE-015 | Reopen year — reason stored | Year closed | POST ?action=reopen `{reason:"Correction needed"}` | — | is_reopened=true, reopen_reason stored | P1 |
| YE-016 | Reopen year — payments allowed again | Year reopened | POST payment | — | 201, payment recorded | P1 |
| YE-017 | Close year — summary totals recorded | 2 carried, 1 written off, 1 open | POST close | — | fee_year_close.carried_count=2, writeoff_count=1, open_count=1 | P1 |
| YE-018 | to_year required for carry decision | — | POST apply carry without to_year | — | 400, "to_year required for carry-forward" | P1 |
| YE-019 | to_year must exist | to_year=2030-31 (no structures) | POST carry with non-existent to_year | — | 400, "Academic year 2030-31 does not exist" | P1 |
| YE-020 | Apply after year closed → 409 | Year already closed | POST apply | — | 409, "This year is closed. Reopen it before making changes." | P1 |
| YE-021 | GET year-end missing school_id → 400 | — | GET without school_id | — | 400 | P1 |
| YE-022 | GET year-end missing academic_year → 400 | — | GET without academic_year | — | 400 | P1 |
| YE-023 | Forbidden for wrong school | school_admin school 1 | POST with school_id=2 | — | 403 | P1 |
| YE-024 | Unauthenticated rejected | No cookie | POST /api/fees/year-end | — | 401 | P1 |
| YE-025 | Unique constraint on fee_year_close (school, year) | Close record exists | POST close again | — | Upserts (no duplicate close records) | P2 |

---

## 3. API Test Cases (detailed)

### 3.1 POST /api/fees/generate

```
POSITIVE
  Gen-API-001  Valid request monthly   → 201, created=12 per student
  Gen-API-002  Valid request quarterly → 201, created=4
  Gen-API-003  Valid request annual    → 201, created=1
  Gen-API-004  Grade filter            → only that grade's students get entries
  Gen-API-005  Idempotent repeat       → created=0, skipped=N (no duplicates)
  Gen-API-006  Variable category with assignments → creates entries for assigned students
  Gen-API-007  Multiple categories combined → correct total count

NEGATIVE
  Gen-API-008  Missing school_id       → 400
  Gen-API-009  Missing academic_year   → 400
  Gen-API-010  No structures configured → 400 "No fee structures found"
  Gen-API-011  Invalid academic_year format → generates or 400 (verify behaviour)

AUTHORIZATION
  Gen-API-012  No cookie               → 401
  Gen-API-013  Teacher cookie          → 401 (requireFeeAccess only allows admin roles)
  Gen-API-014  school_admin wrong school → 403
  Gen-API-015  platform_admin any school → 201

PERFORMANCE
  Gen-API-016  1 000 students, 3 monthly categories → complete < 10 s
  Gen-API-017  5 000 students, 3 categories → complete < 30 s
```

### 3.2 POST /api/fees/payments

```
POSITIVE
  Pay-API-001  Cash payment full        → 201, status=paid, receipt created
  Pay-API-002  Cheque partial           → 201, status=partial
  Pay-API-003  UPI full                 → 201
  Pay-API-004  DD full                  → 201
  Pay-API-005  With transaction_ref     → ref stored in DB
  Pay-API-006  With custom paid_date    → paid_date stored
  Pay-API-007  FIFO multi — 3 entries   → oldest allocated first
  Pay-API-008  FIFO multi — shared receipt → all rows share one receipt_number
  Pay-API-009  FIFO multi — partial     → partial allocation correct

NEGATIVE
  Pay-API-010  Overpayment              → 400 "Amount exceeds balance"
  Pay-API-011  Future paid_date         → 400
  Pay-API-012  paid_date before 2000    → 400
  Pay-API-013  paid_date wrong format   → 400
  Pay-API-014  Missing payment_mode     → 400
  Pay-API-015  Missing student_id       → 400
  Pay-API-016  Invalid ledger_id        → 404
  Pay-API-017  Closed year              → 409

AUTHORIZATION
  Pay-API-018  No cookie                → 401
  Pay-API-019  Wrong school             → 403
  Pay-API-020  platform_admin           → 201

CONCURRENCY
  Pay-API-021  Two simultaneous payments on same ledger → only one succeeds or both allowed if combined <= balance
```

### 3.3 GET /api/fees/ledger

```
POSITIVE
  Led-API-001  Without filters          → all entries for school
  Led-API-002  ?grade=10               → only grade 10
  Led-API-003  ?status=overdue         → only overdue
  Led-API-004  ?student_id=X           → only student X
  Led-API-005  balance field correct    → amount_due - amount_paid
  Led-API-006  Auto overdue update      → pending + past due_date → overdue

NEGATIVE
  Led-API-007  Missing school_id        → 400

AUTHORIZATION
  Led-API-008  No cookie                → 401
  Led-API-009  Wrong school             → 403
```

### 3.4 PATCH /api/fees/ledger/:id

```
POSITIVE
  LedPatch-001  Valid amount+reason     → 200, amount_due updated
  LedPatch-002  Audit row created       → student_fee_ledger_edits row with old/new/reason
  LedPatch-003  Status recalculated     → if new amount <= amount_paid → status=paid

NEGATIVE
  LedPatch-004  Missing reason          → 400 (verify server validates)
  LedPatch-005  Invalid id              → 404

AUTHORIZATION
  LedPatch-006  No cookie               → 401
  LedPatch-007  Wrong school            → 403
```

### 3.5 POST /api/fees/waivers

```
POSITIVE
  Waiv-API-001  Full waiver             → waiver_amount = remaining
  Waiv-API-002  50% percentage          → waiver_amount = remaining * 0.5
  Waiv-API-003  Fixed 1000              → waiver_amount = min(1000, remaining)
  Waiv-API-004  On partially paid       → calculated on remaining, not full
  Waiv-API-005  Ledger status → waived  → when waiver covers all remaining

NEGATIVE
  Waiv-API-006  Already fully paid      → 400 "Nothing to waive"
  Waiv-API-007  Missing reason          → 400
  Waiv-API-008  Missing waiver_type     → 400
  Waiv-API-009  Invalid ledger_id       → 404

DELETE /api/fees/waivers
  Waiv-API-010  Revoke active waiver    → 200, is_revoked=true
  Waiv-API-011  Revoke revoked waiver   → 404 "already revoked"
  Waiv-API-012  Missing id              → 400

AUTHORIZATION
  Waiv-API-013  No cookie               → 401
  Waiv-API-014  Wrong school            → 403
```

### 3.6 GET /api/fees/year-end

```
POSITIVE
  YE-API-001  With unpaid students      → students grouped with bills
  YE-API-002  Grade 12 student          → is_leaver=true
  YE-API-003  Inactive student          → is_leaver=true
  YE-API-004  target_year calculated    → 2025-26 → 2026-27

NEGATIVE
  YE-API-005  Missing school_id         → 400
  YE-API-006  Missing academic_year     → 400

AUTHORIZATION
  YE-API-007  No cookie                 → 401
  YE-API-008  Wrong school              → 403
```

### 3.7 POST /api/fees/year-end?action=apply

```
POSITIVE
  YEApply-001  Carry active student     → ledger in to_year created, old bills waived
  YEApply-002  Write off               → bills marked waived, waiver records created
  YEApply-003  Leave open              → bills unchanged
  YEApply-004  Mixed decisions          → each handled independently

NEGATIVE
  YEApply-005  Carry grade 12 student   → 400
  YEApply-006  Missing to_year          → 400
  YEApply-007  to_year doesn't exist    → 400
  YEApply-008  Missing decisions array  → 400
  YEApply-009  Year already closed      → 409
```

### 3.8 POST /api/fees/year-end?action=close

```
POSITIVE
  YEClose-001  Close year               → 200, fee_year_close record created
  YEClose-002  Summary totals correct   → carried/writeoff/open sums match

NEGATIVE
  YEClose-003  Payments blocked after close → 409 on payment attempt
  YEClose-004  Reopen with reason       → 200, is_reopened=true, reason stored
  YEClose-005  Reopen without reason    → 200 (reason optional — verify server behavior)
```

---

## 4. Database Validation Queries

```sql
-- 4.1 Verify ledger creation after generation
SELECT COUNT(*), status, period_label
FROM student_fee_ledger
WHERE school_id = :school_id
  AND academic_year = '2025-26'
GROUP BY status, period_label
ORDER BY period_label;

-- 4.2 Verify 12 monthly entries per student per category
SELECT student_id, fee_category_id, COUNT(*) as period_count
FROM student_fee_ledger
WHERE school_id = :school_id
  AND academic_year = '2025-26'
  AND fee_category_id = :monthly_category_id
GROUP BY student_id, fee_category_id
HAVING COUNT(*) != 12; -- Should return 0 rows

-- 4.3 Verify FIFO allocation order (oldest paid first)
SELECT fp.id, fp.ledger_id, sfl.due_date, fp.amount, fp.receipt_number
FROM fee_payments fp
JOIN student_fee_ledger sfl ON sfl.id = fp.ledger_id
WHERE fp.receipt_number = :shared_receipt
ORDER BY sfl.due_date ASC; -- Should be in due_date order

-- 4.4 Verify shared receipt number across FIFO allocations
SELECT receipt_number, COUNT(*) as allocation_count, SUM(amount) as total
FROM fee_payments
WHERE receipt_number = :receipt_number
GROUP BY receipt_number;

-- 4.5 Verify no overpayment in ledger
SELECT id, amount_due, amount_paid
FROM student_fee_ledger
WHERE school_id = :school_id
  AND amount_paid > amount_due; -- Should return 0 rows

-- 4.6 Verify waiver applied to remaining balance (not full amount_due)
SELECT
  sfl.amount_due,
  sfl.amount_paid AS paid_before_waiver,
  fw.waiver_amount,
  sfl.amount_due - sfl.amount_paid AS expected_remaining
FROM fee_waivers fw
JOIN student_fee_ledger sfl ON sfl.id = fw.ledger_id
WHERE fw.id = :waiver_id;
-- waiver_amount should equal expected_remaining (for full waiver)

-- 4.7 Verify ledger status after full payment
SELECT id, status, amount_due, amount_paid
FROM student_fee_ledger
WHERE amount_paid >= amount_due
  AND status != 'paid'
  AND status != 'waived'
  AND school_id = :school_id; -- Should return 0 rows

-- 4.8 Verify audit log created for ledger edit
SELECT *
FROM student_fee_ledger_edits
WHERE ledger_id = :ledger_id
ORDER BY changed_at DESC;

-- 4.9 Verify waiver soft-delete (revoke)
SELECT id, is_revoked, revoked_by, revoked_at, revoke_reason
FROM fee_waivers
WHERE id = :waiver_id;
-- is_revoked should be TRUE after revoke

-- 4.10 Verify year close record
SELECT *
FROM fee_year_close
WHERE school_id = :school_id AND academic_year = '2025-26';
-- Should have 1 row with correct totals

-- 4.11 Verify carry forward creates Previous Year Dues category
SELECT id, name, frequency, category_type
FROM fee_categories
WHERE school_id = :school_id AND name = 'Previous Year Dues';

-- 4.12 Verify carry forward ledger entry in next year
SELECT *
FROM student_fee_ledger
WHERE student_id = :student_id
  AND academic_year = '2026-27'
  AND period_label LIKE 'Previous Year Dues%';

-- 4.13 Verify original bills marked waived after carry forward
SELECT id, status, period_label
FROM student_fee_ledger
WHERE student_id = :student_id
  AND academic_year = '2025-26'
  AND status = 'waived'; -- All carried bills should be waived

-- 4.14 Verify carry forward waiver record
SELECT fw.*, sfl.period_label
FROM fee_waivers fw
JOIN student_fee_ledger sfl ON sfl.id = fw.ledger_id
WHERE fw.reason LIKE 'Carried forward to%'
  AND sfl.student_id = :student_id;

-- 4.15 Verify no duplicate ledger entries
SELECT student_id, fee_category_id, academic_year, period_label, COUNT(*)
FROM student_fee_ledger
WHERE school_id = :school_id
GROUP BY student_id, fee_category_id, academic_year, period_label
HAVING COUNT(*) > 1; -- Should return 0 rows

-- 4.16 Verify receipt number uniqueness
SELECT receipt_number, COUNT(*) as count
FROM fee_payments
GROUP BY receipt_number
HAVING COUNT(*) > 1; -- Should be only FIFO multi-entry (expected > 1 for shared receipts)

-- 4.17 Verify structure history recorded on update
SELECT *
FROM fee_structure_history
WHERE fee_structure_id = :structure_id
ORDER BY created_at DESC;

-- 4.18 Verify category changelog on update
SELECT *
FROM fee_category_changelog
WHERE category_id = :category_id
ORDER BY created_at DESC;

-- 4.19 Verify fee generation count matches enrolled students
SELECT
  (SELECT COUNT(*) FROM students WHERE school_id = :school_id AND status='active' AND grade='10') AS student_count,
  (SELECT COUNT(*) FROM student_fee_ledger
   WHERE school_id = :school_id AND academic_year = '2025-26'
   AND fee_category_id = :monthly_id) / 12 AS generated_count;
-- Counts should match

-- 4.20 Verify overdue auto-update
SELECT COUNT(*)
FROM student_fee_ledger
WHERE school_id = :school_id
  AND due_date < CURRENT_DATE
  AND status = 'pending'; -- Should be 0 after GET /api/fees/ledger runs
```

---

## 5. Edge Cases

| EC-ID | Scenario | Expected Behaviour |
|-------|----------|--------------------|
| EC-001 | Zero fee amount in structure | Structure saved with amount=0.00; generation creates ledger with amount_due=0 |
| EC-002 | Negative amount in structure POST | Server should reject (verify: no explicit guard — amount stored as-is; add validation if missing) |
| EC-003 | Duplicate category name same school | 409 "Category name already exists" |
| EC-004 | Duplicate category name different school | 201 (names are unique per school) |
| EC-005 | Payment exact match amount | status=paid (not partial) |
| EC-006 | Payment 0.01 less than balance | status=partial |
| EC-007 | FIFO with amount larger than all selected entries | All entries paid, remaining amount ignored (or error — verify server caps at balance) |
| EC-008 | Waiver on entry with amount_due=0 | 400 "Nothing to waive" |
| EC-009 | Full waiver then another waiver | 400 "Nothing to waive" (entry already fully waived) |
| EC-010 | Revoke waiver — ledger reverts correctly when also has cash payments | ledger.amount_paid = SUM(completed payments) only |
| EC-011 | Generate for year with no students | created=0, total_students=0 |
| EC-012 | Generate after some students deleted (status=inactive) | Inactive students skipped in generation |
| EC-013 | Carry forward same student twice | Second carry should skip already-waived bills or create duplicate "Previous Year Dues" entry — verify |
| EC-014 | Close year then reopen then close again | Second close upserts the existing fee_year_close record |
| EC-015 | Variable fee: student assigned 0 amount | No ledger entry generated for that student |
| EC-016 | FIFO multi with no valid entries | POST returns 201 with 0 allocations or 400 — verify |
| EC-017 | Ledger edit to 0 amount | amount_due=0; if amount_paid>0 then status=paid; verify behaviour |
| EC-018 | Payment with all supported modes | All modes: cash/cheque/dd/upi/online — all should store correctly |
| EC-019 | Concurrent FIFO allocation | Two requests for same student simultaneously — test for race condition, check final amount_paid doesn't exceed amount_due |
| EC-020 | Student withdrawn mid-year | is_leaver=true in year-end; carry blocked; existing ledger entries remain |
| EC-021 | Academic year "2025-26" format edge | "2025-2026" (wrong format) should fail gracefully |
| EC-022 | Day close for future date | Verify if server blocks or allows |
| EC-023 | Carry forward when to_year already has Previous Year Dues | Should create additional entry (or skip if unique constraint fires) — verify |
| EC-024 | 100% percentage waiver | waiver_amount = full remaining; status=waived |
| EC-025 | 101% percentage waiver | waiver_amount = remaining (capped at remaining by Math.round, could exceed — verify) |

---

## 6. Security Test Cases

| SEC-ID | Scenario | Steps | Expected Result |
|--------|----------|-------|-----------------|
| SEC-001 | Unauthenticated GET ledger | No cookie, GET /api/fees/ledger | 401 |
| SEC-002 | Unauthenticated POST payment | No cookie, POST /api/fees/payments | 401 |
| SEC-003 | Teacher accesses fee API | Teacher cookie, GET /api/fees/ledger | 401/403 (requireFeeAccess rejects non-admin) |
| SEC-004 | Student accesses fee API | Student cookie, GET /api/fees/stats | 401/403 |
| SEC-005 | Cross-school GET ledger | school_admin school 1, GET ?school_id=2 | 403 |
| SEC-006 | Cross-school POST payment | school_admin school 1, POST with school_id=2 | 403 |
| SEC-007 | Cross-school PATCH ledger | school_admin school 1, PATCH ledger entry from school 2 | 403 or 404 |
| SEC-008 | ID manipulation — access another school's ledger entry | PATCH /api/fees/ledger/99 (belongs to school 2) as school_admin school 1 | 403 or 404 |
| SEC-009 | ID manipulation — revoke another school's waiver | DELETE /api/fees/waivers?id=99 (school 2) as school_admin school 1 | 403 or 404 |
| SEC-010 | SQL injection in grade filter | GET ?grade=10';DROP TABLE students;-- | 400 or 200 with no data (parameterized queries prevent injection) |
| SEC-011 | SQL injection in student_id | GET ?student_id=1 OR 1=1 | 400 or safe empty response |
| SEC-012 | XSS in category name | POST category with name=`<script>alert(1)</script>` | Stored as literal string, not executed in JSON response |
| SEC-013 | XSS in reason field | POST waiver with reason containing script tag | Stored safely |
| SEC-014 | platform_admin bypasses school check | platform_admin cookie, GET ?school_id=99 | 200 (allowed — platform_admin can access any school) |
| SEC-015 | Expired session | Expired JWT cookie | 401 |
| SEC-016 | Tampered JWT | Modify JWT payload | 401 (signature invalid) |
| SEC-017 | IDOR — access ledger by sequential ID | GET /api/fees/ledger/:id where ID belongs to another school | Should return 403, not data |
| SEC-018 | Mass assignment — inject extra fields | POST payment with extra fields like school_id=9999 in body | Extra fields ignored, school from session/param used |

---

## 7. Performance Test Cases

| PERF-ID | Scenario | Students | Expected |
|---------|----------|----------|---------|
| PERF-001 | Fee generation — 3 monthly categories | 100 | < 2 s |
| PERF-002 | Fee generation — 3 monthly categories | 1 000 | < 10 s |
| PERF-003 | Fee generation — 3 monthly categories | 5 000 | < 30 s |
| PERF-004 | Fee generation — 3 monthly categories | 10 000 | < 60 s |
| PERF-005 | GET /api/fees/ledger — no filters | 1 000 students × 12 months = 12 000 rows | < 3 s |
| PERF-006 | GET /api/fees/ledger — no filters | 5 000 students × 12 months = 60 000 rows | < 10 s |
| PERF-007 | GET /api/fees/stats | 10 000 students | < 5 s |
| PERF-008 | GET /api/fees/reports | 10 000 students | < 8 s |
| PERF-009 | FIFO multi-payment — 50 ledger entries | 1 student | < 1 s |
| PERF-010 | Year-end GET — 1 000 students with dues | 1 000 | < 5 s |
| PERF-011 | Year-end apply — 500 carry decisions | 500 | < 10 s |
| PERF-012 | Concurrent payments — 10 simultaneous | 10 threads same school | All complete, no balance exceeded |

---

## 8. UI Test Cases

| UI-ID | Scenario | Steps | Expected |
|-------|----------|-------|---------|
| UI-001 | Fee Plan tab loads | Click Fee Plan tab | Category list visible |
| UI-002 | Add category form | Click Add Category, fill form, submit | Category appears in list |
| UI-003 | Structure amount grid | Enter amount per grade, save | Amounts persist on refresh |
| UI-004 | Lock structure | Click Lock, confirm | Lock icon shown, edit disabled |
| UI-005 | Generate fees button | Click Generate, confirm | Success toast, ledger rows visible |
| UI-006 | Ledger filter by grade | Select grade 10 in dropdown | Only grade 10 rows shown |
| UI-007 | Ledger filter by status | Select Overdue | Only overdue entries |
| UI-008 | Ledger search by student name | Type student name | Matching rows shown |
| UI-009 | Ledger inline edit | Click amount cell, change value, save | New amount shown, edit icon |
| UI-010 | Collect payment button | Click Pay on ledger row, enter amount, submit | Receipt shown |
| UI-011 | Grant waiver modal | Click Waive, select Full, enter reason | Waiver applied, status changes |
| UI-012 | View payment history | Click history icon | Modal with payment list |
| UI-013 | Passbook student search | Search student in passbook | Timeline shown |
| UI-014 | Collection — search student | Type student name | Student with pending fees shown |
| UI-015 | Collection — FIFO multi-select | Select 3 fees, enter total | FIFO allocation, receipt shown |
| UI-016 | Reports tab loads | Click Reports | Summary, grade, category tables shown |
| UI-017 | Excel export | Click Export Excel | .xlsx file downloaded |
| UI-018 | Year-End tab loads | Click Year-End | Students with dues listed |
| UI-019 | Carry forward | Select student, Carry Forward | Confirmation, next year entry created |
| UI-020 | Close year | Click Close Year | Confirmation modal, year closed |
| UI-021 | Overview stats visible | Click Overview | Total billed/collected/outstanding cards |
| UI-022 | Top defaulters list | Overview tab | Top 10 defaulters visible |
| UI-023 | Monthly trend chart | Overview tab | Chart with 12 months |
| UI-024 | Class-wise breakdown | Overview tab | Table by grade/section |

---

## 9. Regression Suite

**Critical paths to run before every release:**

```
REG-001  Full fee lifecycle: setup → generate → pay → report
REG-002  FIFO multi-payment: 3 entries, partial allocation
REG-003  Waiver grant + revoke cycle
REG-004  Year-end carry forward → payment in new year → verify Previous Year Dues
REG-005  Year close → payment blocked → reopen → payment allowed
REG-006  Overdue detection on ledger GET
REG-007  Cross-school 403 on all write endpoints
REG-008  Unauthenticated 401 on all endpoints
REG-009  Receipt number unique across 50 payments
REG-010  Category deletion blocked when ledger data exists
```

---

## 10. Playwright Automation Scripts

```typescript
// e2e/fee-management/setup.ts — shared helpers
import { Page, expect } from '@playwright/test'

export async function loginSchoolAdmin(page: Page, schoolCode: string, password: string) {
  await page.goto('/login?role=school')
  await page.getByPlaceholder(/School ID or email/i).fill(schoolCode)
  await page.getByPlaceholder(/password/i).fill(password)
  await page.getByTestId('auth-submit-btn').click()
  await page.waitForURL(/\/school-admin/, { timeout: 20000 })
}

export async function navigateToFeeTab(page: Page, tabName: string) {
  await page.getByRole('link', { name: /Fee Management/i }).click()
  await page.getByRole('tab', { name: new RegExp(tabName, 'i') }).click()
}

// e2e/fee-management/fee-setup.spec.ts
import { test, expect } from '@playwright/test'
import { loginSchoolAdmin, navigateToFeeTab } from './setup'

test.describe.serial('Fee Setup', () => {
  const BASE = 'http://localhost:3000'
  let adminCookie: string
  let schoolId: number
  let categoryId: number

  test.beforeAll(async () => {
    // Create school and get cookie via API (reuse onboarding helper pattern)
    const res = await fetch(`${BASE}/api/schools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Fee Test School ${Date.now()}`,
        type: 'Private', city: 'Chennai', country: 'India',
        phone: '9000000001', email: `fee${Date.now()}@test.com`, address: '1 Test St'
      })
    })
    const data = await res.json()
    schoolId = data.id
    // login to get cookie... (similar to onboarding tests)
  })

  test('FS-001: Create monthly fee category', async ({ page }) => {
    await loginSchoolAdmin(page, 'SCHOOL_CODE', 'password')
    await navigateToFeeTab(page, 'Fee Plan')

    await page.getByRole('button', { name: /Add Category/i }).click()
    await page.getByLabel(/Category Name/i).fill('Tuition Fee')
    await page.getByLabel(/Frequency/i).selectOption('monthly')
    await page.getByRole('button', { name: /Save/i }).click()

    await expect(page.getByText('Tuition Fee')).toBeVisible({ timeout: 5000 })
  })

  test('FS-002: Set structure amount for grade', async ({ page }) => {
    await loginSchoolAdmin(page, 'SCHOOL_CODE', 'password')
    await navigateToFeeTab(page, 'Fee Plan')

    const row = page.locator('[data-testid="structure-row-10"]')
    await row.locator('input[type="number"]').fill('5000')
    await page.getByRole('button', { name: /Save Structure/i }).click()

    await expect(page.getByText('Structure saved')).toBeVisible()
  })

  test('FG-001: Generate fees creates 12 monthly entries', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fees/generate`, {
      data: { school_id: schoolId, academic_year: '2025-26' },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.created).toBeGreaterThan(0)
    // Verify 12 entries per student per monthly category
    const ledger = await request.get(
      `${BASE}/api/fees/ledger?school_id=${schoolId}&academic_year=2025-26`,
      { headers: { Cookie: adminCookie } }
    )
    const entries = await ledger.json()
    const monthlyEntries = entries.filter((e: { frequency: string }) => e.frequency === 'monthly')
    const perStudent = monthlyEntries.length / (/* student count */ 1)
    expect(perStudent).toBe(12)
  })
})

// e2e/fee-management/payments.spec.ts
import { test, expect } from '@playwright/test'

test.describe.serial('Fee Payments', () => {
  const BASE = 'http://localhost:3000'
  let adminCookie: string
  let schoolId: number
  let studentId: number
  let ledgerId: number

  test('PY-001: Full cash payment sets status to paid', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fees/payments`, {
      data: {
        school_id: schoolId, student_id: studentId,
        ledger_id: ledgerId, amount: 5000,
        payment_mode: 'cash'
      },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.receipt_number).toMatch(/^RCP-\d{3}-\d{4}-\d{6}$/)

    // Verify ledger status
    const ledger = await request.get(
      `${BASE}/api/fees/ledger?school_id=${schoolId}&student_id=${studentId}`,
      { headers: { Cookie: adminCookie } }
    )
    const entries = await ledger.json()
    const entry = entries.find((e: { id: number }) => e.id === ledgerId)
    expect(entry.status).toBe('paid')
  })

  test('PY-004: Overpayment rejected', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fees/payments`, {
      data: {
        school_id: schoolId, student_id: studentId,
        ledger_id: ledgerId, amount: 99999,
        payment_mode: 'cash'
      },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Amount exceeds balance due')
  })

  test('PY-016: FIFO multi-entry allocation — oldest first', async ({ request }) => {
    // Requires 3 ledger entries for different months
    const res = await request.post(`${BASE}/api/fees/payments`, {
      data: {
        school_id: schoolId, student_id: studentId,
        ledger_ids: [/* Jun */, /* Jul */, /* Aug */],
        total_amount: 2500,
        payment_mode: 'cash'
      },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.allocations).toBeDefined()
    // First allocation should be for oldest (Jun) entry
    const payments = await request.get(
      `${BASE}/api/fees/payments?school_id=${schoolId}&student_id=${studentId}`,
      { headers: { Cookie: adminCookie } }
    )
    const payList = await payments.json()
    // All FIFO allocations share receipt
    const shared = payList.filter((p: { receipt_number: string }) => p.receipt_number === body.receipt_number)
    expect(shared.length).toBe(2) // 2 entries were allocated
  })

  test('PY-015: Payment blocked on closed year', async ({ request }) => {
    // Close the year first
    await request.post(`${BASE}/api/fees/year-end?action=close`, {
      data: { school_id: schoolId, from_year: '2025-26' },
      headers: { Cookie: adminCookie }
    })

    const res = await request.post(`${BASE}/api/fees/payments`, {
      data: {
        school_id: schoolId, student_id: studentId,
        ledger_id: ledgerId, amount: 1000, payment_mode: 'cash'
      },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).error).toContain('academic year is closed')
  })
})

// e2e/fee-management/waivers.spec.ts
import { test, expect } from '@playwright/test'

test.describe.serial('Waivers', () => {
  const BASE = 'http://localhost:3000'
  let adminCookie: string
  let schoolId: number
  let studentId: number
  let ledgerId: number
  let waiverId: number

  test('WV-001: Full waiver sets status to waived', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fees/waivers`, {
      data: {
        school_id: schoolId, student_id: studentId,
        ledger_id: ledgerId, waiver_type: 'full',
        reason: 'Scholarship'
      },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    waiverId = body.id
    expect(body.waiver_amount).toBe(5000)

    const ledger = await request.get(
      `${BASE}/api/fees/ledger?school_id=${schoolId}&student_id=${studentId}`,
      { headers: { Cookie: adminCookie } }
    )
    const entry = (await ledger.json()).find((e: { id: number }) => e.id === ledgerId)
    expect(entry.status).toBe('waived')
  })

  test('WV-003: Percentage waiver calculates on remaining', async ({ request }) => {
    // Precondition: amount_due=5000, amount_paid=2000 → remaining=3000
    const res = await request.post(`${BASE}/api/fees/waivers`, {
      data: {
        school_id: schoolId, student_id: studentId,
        ledger_id: ledgerId, waiver_type: 'percentage',
        waiver_value: 50, reason: '50% discount'
      },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(201)
    // 50% of remaining 3000 = 1500
    expect((await res.json()).waiver_amount).toBe(1500)
  })

  test('WV-012: Revoke waiver restores ledger', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/fees/waivers?id=${waiverId}&reason=Error`, {
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(200)

    const ledger = await request.get(
      `${BASE}/api/fees/ledger?school_id=${schoolId}&student_id=${studentId}`,
      { headers: { Cookie: adminCookie } }
    )
    const entry = (await ledger.json()).find((e: { id: number }) => e.id === ledgerId)
    expect(entry.status).not.toBe('waived')
  })
})

// e2e/fee-management/year-end.spec.ts
import { test, expect } from '@playwright/test'

test.describe.serial('Year-End', () => {
  const BASE = 'http://localhost:3000'
  let adminCookie: string
  let schoolId: number
  let activeStudentId: number
  let grade12StudentId: number

  test('YE-001: GET year-end groups students with outstanding', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/fees/year-end?school_id=${schoolId}&academic_year=2025-26`,
      { headers: { Cookie: adminCookie } }
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.students).toBeDefined()
    expect(body.students.length).toBeGreaterThan(0)
    expect(body.summary.total_unpaid).toBeGreaterThan(0)
  })

  test('YE-002: Grade 12 student marked as leaver', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/fees/year-end?school_id=${schoolId}&academic_year=2025-26`,
      { headers: { Cookie: adminCookie } }
    )
    const body = await res.json()
    const grade12 = body.students.find((s: { student_id: number }) => s.student_id === grade12StudentId)
    expect(grade12.is_leaver).toBe(true)
    expect(grade12.leaver_reason).toContain('Graduating')
  })

  test('YE-005: Carry forward creates Previous Year Dues in next year', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fees/year-end?action=apply`, {
      data: {
        school_id: schoolId, from_year: '2025-26', to_year: '2026-27',
        decisions: [{ student_id: activeStudentId, decision: 'carry' }]
      },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(200)
    expect((await res.json()).carried.count).toBe(1)

    // Verify ledger in next year
    const ledger = await request.get(
      `${BASE}/api/fees/ledger?school_id=${schoolId}&academic_year=2026-27&student_id=${activeStudentId}`,
      { headers: { Cookie: adminCookie } }
    )
    const entries = await ledger.json()
    const carryEntry = entries.find((e: { period_label: string }) => e.period_label.includes('Previous Year Dues'))
    expect(carryEntry).toBeDefined()
  })

  test('YE-009: Carry forward blocked for grade 12', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fees/year-end?action=apply`, {
      data: {
        school_id: schoolId, from_year: '2025-26', to_year: '2026-27',
        decisions: [{ student_id: grade12StudentId, decision: 'carry' }]
      },
      headers: { Cookie: adminCookie }
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toContain('Cannot carry forward for a graduating')
  })

  test('YE-012: Close year blocks future payments', async ({ request }) => {
    await request.post(`${BASE}/api/fees/year-end?action=close`, {
      data: { school_id: schoolId, from_year: '2025-26' },
      headers: { Cookie: adminCookie }
    })

    // Payment attempt should be blocked
    const payRes = await request.post(`${BASE}/api/fees/payments`, {
      data: {
        school_id: schoolId, student_id: activeStudentId,
        ledger_id: 1, amount: 100, payment_mode: 'cash'
      },
      headers: { Cookie: adminCookie }
    })
    expect(payRes.status()).toBe(409)
  })

  test('YE-015: Reopen year allows payments again', async ({ request }) => {
    await request.post(`${BASE}/api/fees/year-end?action=reopen`, {
      data: { school_id: schoolId, from_year: '2025-26', reason: 'Correction needed' },
      headers: { Cookie: adminCookie }
    })

    // Verify reopened in DB via API
    const res = await request.get(
      `${BASE}/api/fees/year-end?school_id=${schoolId}&academic_year=2025-26`,
      { headers: { Cookie: adminCookie } }
    )
    const body = await res.json()
    expect(body.is_closed).toBe(false)
  })
})

// e2e/fee-management/security.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Security', () => {
  const BASE = 'http://localhost:3000'
  const school1Id = 1
  const school2Id = 2

  test('SEC-001: Unauthenticated GET ledger → 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/fees/ledger?school_id=${school1Id}`)
    expect(res.status()).toBe(401)
  })

  test('SEC-005: Cross-school GET ledger → 403', async ({ request }) => {
    // Login as school 1 admin, try to GET school 2's ledger
    const cookie = 'school1_admin_cookie_here'
    const res = await request.get(`${BASE}/api/fees/ledger?school_id=${school2Id}`, {
      headers: { Cookie: cookie }
    })
    expect(res.status()).toBe(403)
  })

  test('SEC-006: Cross-school POST payment → 403', async ({ request }) => {
    const cookie = 'school1_admin_cookie_here'
    const res = await request.post(`${BASE}/api/fees/payments`, {
      data: { school_id: school2Id, student_id: 1, ledger_id: 1, amount: 100, payment_mode: 'cash' },
      headers: { Cookie: cookie }
    })
    expect(res.status()).toBe(403)
  })

  test('SEC-010: SQL injection in grade filter — parameterized query safe', async ({ request }) => {
    const cookie = 'school1_admin_cookie_here'
    const res = await request.get(
      `${BASE}/api/fees/ledger?school_id=${school1Id}&grade=10';DROP TABLE students;--`,
      { headers: { Cookie: cookie } }
    )
    // Should return safe empty array or 400, NOT 500 (which would indicate injection worked)
    expect([200, 400]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
    }
  })

  test('SEC-014: platform_admin can access any school', async ({ request }) => {
    const platformAdminCookie = 'platform_admin_cookie_here'
    const res = await request.get(`${BASE}/api/fees/stats?school_id=${school1Id}&academic_year=2025-26`, {
      headers: { Cookie: platformAdminCookie }
    })
    expect(res.status()).toBe(200)
  })
})
```

---

## 11. Cypress Automation Scripts

```javascript
// cypress/e2e/fees/fee-setup.cy.js
describe('Fee Setup', () => {
  beforeEach(() => {
    cy.loginAsSchoolAdmin(Cypress.env('SCHOOL_CODE'), Cypress.env('SCHOOL_PASS'))
    cy.visit('/school-admin')
    cy.get('[data-testid="nav-fee-management"]').click()
  })

  it('FC-001: Creates a monthly fee category', () => {
    cy.get('[data-testid="fee-tab-setup"]').click()
    cy.get('[data-testid="add-category-btn"]').click()
    cy.get('[name="name"]').type('Tuition Fee')
    cy.get('[name="frequency"]').select('monthly')
    cy.get('[data-testid="save-category-btn"]').click()
    cy.contains('Tuition Fee').should('be.visible')
  })

  it('FC-006: Rejects duplicate category name', () => {
    cy.get('[data-testid="fee-tab-setup"]').click()
    cy.get('[data-testid="add-category-btn"]').click()
    cy.get('[name="name"]').type('Tuition Fee')
    cy.get('[data-testid="save-category-btn"]').click()
    cy.contains(/already exists/i).should('be.visible')
  })
})

// cypress/e2e/fees/payments.cy.js
describe('Fee Payments', () => {
  before(() => {
    cy.setupTestFees() // custom command to generate test data via API
  })

  beforeEach(() => {
    cy.loginAsSchoolAdmin(Cypress.env('SCHOOL_CODE'), Cypress.env('SCHOOL_PASS'))
    cy.visit('/school-admin')
    cy.get('[data-testid="nav-fee-management"]').click()
  })

  it('PY-001: Cash payment sets status to paid', () => {
    cy.get('[data-testid="fee-tab-ledger"]').click()
    cy.get('[data-testid^="pay-btn-"]').first().click()
    cy.get('[name="amount"]').clear().type('5000')
    cy.get('[name="payment_mode"]').select('cash')
    cy.get('[data-testid="confirm-payment-btn"]').click()
    cy.contains(/receipt/i).should('be.visible')
    cy.get('[data-testid^="status-"]').first().should('contain', 'Paid')
  })

  it('PY-004: Overpayment shows error', () => {
    cy.get('[data-testid="fee-tab-ledger"]').click()
    cy.get('[data-testid^="pay-btn-"]').first().click()
    cy.get('[name="amount"]').clear().type('99999')
    cy.get('[data-testid="confirm-payment-btn"]').click()
    cy.contains(/exceeds balance/i).should('be.visible')
  })
})

// cypress/e2e/fees/year-end.cy.js
describe('Year End', () => {
  beforeEach(() => {
    cy.loginAsSchoolAdmin(Cypress.env('SCHOOL_CODE'), Cypress.env('SCHOOL_PASS'))
    cy.visit('/school-admin')
    cy.get('[data-testid="nav-fee-management"]').click()
    cy.get('[data-testid="fee-tab-yearend"]').click()
  })

  it('YE-012: Close year blocks payments', () => {
    cy.get('[data-testid="close-year-btn"]').click()
    cy.get('[data-testid="confirm-close-btn"]').click()
    cy.contains(/year closed/i).should('be.visible')

    // Navigate to ledger and try to pay
    cy.get('[data-testid="fee-tab-ledger"]').click()
    cy.get('[data-testid^="pay-btn-"]').first().click()
    cy.contains(/year is closed/i).should('be.visible')
  })

  it('YE-015: Reopen year allows edits', () => {
    cy.get('[data-testid="reopen-year-btn"]').click()
    cy.get('[name="reason"]').type('Correction required')
    cy.get('[data-testid="confirm-reopen-btn"]').click()
    cy.contains(/reopened/i).should('be.visible')
  })
})

// cypress/support/commands.js
Cypress.Commands.add('loginAsSchoolAdmin', (schoolCode, password) => {
  cy.request({
    method: 'POST', url: '/api/auth/login',
    body: { identifier: schoolCode, password }
  }).then(res => {
    const cookie = res.headers['set-cookie']
      .find(c => c.startsWith('wlyl-auth='))
    cy.setCookie('wlyl-auth', cookie.split('=')[1].split(';')[0])
  })
})

Cypress.Commands.add('setupTestFees', () => {
  // Idempotent setup: create category, structure, generate fees
  cy.request({
    method: 'POST', url: '/api/fees/generate',
    headers: { Cookie: `wlyl-auth=${Cypress.env('ADMIN_TOKEN')}` },
    body: { school_id: Cypress.env('SCHOOL_ID'), academic_year: '2025-26' }
  })
})
```

---

## 12. Test Environment Checklist

Before running the full suite:

- [ ] Dev server running on localhost:3000
- [ ] DB migrations applied (lib/db.ts ensureDB run)
- [ ] Test school created with `school_code` in env
- [ ] At least 10 active students across 3 grades
- [ ] At least 1 monthly, 1 quarterly, 1 annual fee category configured
- [ ] Fee structures set for all grades
- [ ] Playwright installed: `node node_modules/playwright/cli.js install chromium`
- [ ] Cypress installed: `npx cypress install`
- [ ] Environment variables set: SCHOOL_CODE, SCHOOL_PASS, SCHOOL_ID

---

*Total: 260+ test cases across functional, API, DB, UI, security, performance, and edge case categories.*
