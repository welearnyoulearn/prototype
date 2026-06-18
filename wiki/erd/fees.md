# Fees: Fee Management, Payments & Online Transactions

This diagram covers the complete fee lifecycle: category definitions, grade-level fee structures, per-student ledger entries, payments (cash and online), waivers, and the online payment gateway integration (Cashfree).

## Tables

| Table | Purpose |
|---|---|
| **fee_categories** | Fee types defined by a school (Tuition, Transport, Exam Fee, etc.). Each has a frequency (monthly/quarterly/annual/one_time). |
| **fee_structures** | Amount per category per grade per academic year. Defines how much each grade pays for each fee category. |
| **fee_structure_locks** | Locks a school's fee structure for an academic year to prevent accidental edits after finalization. |
| **fee_structure_amendments** | Audit trail when a locked fee structure amount is changed. Records old/new amounts and reason. |
| **student_fee_ledger** | Per-student billing records. One row per student per fee category per period. Tracks amount due, paid, and status. |
| **student_fee_ledger_edits** | Audit trail for manual edits to individual student ledger entries. |
| **fee_payments** | Payment records against ledger entries. Supports cash, cheque, DD, online, UPI. Each gets a receipt number. |
| **fee_waivers** | Discount/waiver records (percentage, fixed amount, or full). Linked to specific ledger entries. |
| **school_payment_config** | Per-school Cashfree gateway configuration. Secret is AES-256-GCM encrypted. |
| **payment_transactions** | Online payment link records created for parents. Tracks Cashfree order lifecycle. |
| **payment_webhook_log** | Raw Cashfree webhook payloads logged for idempotency and audit. |

## Entity Relationship Diagram

```mermaid
erDiagram
    schools {
        SERIAL id PK
        VARCHAR name
    }

    students {
        SERIAL id PK
        VARCHAR name
        VARCHAR grade
    }

    fee_categories {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        TEXT description
        VARCHAR frequency
        BOOLEAN is_active
    }

    fee_structures {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER fee_category_id FK
        VARCHAR grade
        NUMERIC amount
        INTEGER due_day
        VARCHAR academic_year
    }

    fee_structure_locks {
        SERIAL id PK
        INTEGER school_id
        TEXT academic_year
        TEXT locked_by
        TIMESTAMPTZ locked_at
    }

    fee_structure_amendments {
        SERIAL id PK
        INTEGER school_id
        INTEGER fee_structure_id FK
        INTEGER fee_category_id FK
        TEXT grade
        TEXT academic_year
        NUMERIC old_amount
        NUMERIC new_amount
        DATE effective_from
        TEXT reason
        TEXT changed_by
    }

    student_fee_ledger {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        INTEGER fee_category_id FK
        INTEGER fee_structure_id FK
        VARCHAR academic_year
        VARCHAR period_label
        NUMERIC amount_due
        NUMERIC amount_paid
        NUMERIC waiver_amount
        DATE due_date
        VARCHAR status
    }

    student_fee_ledger_edits {
        SERIAL id PK
        INTEGER ledger_id FK
        INTEGER school_id
        INTEGER student_id
        NUMERIC old_amount
        NUMERIC new_amount
        TEXT reason
        TEXT changed_by
    }

    fee_payments {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        INTEGER ledger_id FK
        NUMERIC amount
        VARCHAR payment_mode
        VARCHAR payment_status
        VARCHAR receipt_number UK
        VARCHAR transaction_ref
        DATE paid_date
        VARCHAR collected_by_name
        TEXT verified_by
        TIMESTAMPTZ verified_at
        TEXT rejection_reason
    }

    fee_waivers {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        INTEGER ledger_id FK
        VARCHAR waiver_type
        NUMERIC waiver_value
        NUMERIC waiver_amount
        TEXT reason
        VARCHAR granted_by_name
    }

    school_payment_config {
        SERIAL id PK
        INTEGER school_id FK, UK
        TEXT cashfree_app_id
        TEXT cashfree_secret_encrypted
        VARCHAR cashfree_env
        BOOLEAN is_active
    }

    payment_transactions {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        INTEGER_ARRAY ledger_ids
        VARCHAR cashfree_order_id UK
        VARCHAR cashfree_payment_id
        NUMERIC amount
        VARCHAR status
        VARCHAR idempotency_key UK
        TEXT payment_link
        VARCHAR parent_name
        VARCHAR parent_phone
        TEXT failure_reason
    }

    payment_webhook_log {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR cashfree_order_id
        VARCHAR event_type
        JSONB raw_payload
        BOOLEAN signature_valid
        BOOLEAN processed
    }

    schools ||--o{ fee_categories : "defines"
    schools ||--o{ fee_structures : "sets amounts"
    schools ||--o{ fee_structure_locks : "locks structure"
    schools ||--o| school_payment_config : "has gateway config"
    schools ||--o{ payment_transactions : "has online payments"
    schools ||--o{ payment_webhook_log : "receives webhooks"
    fee_categories ||--o{ fee_structures : "has amounts per grade"
    fee_categories ||--o{ student_fee_ledger : "billed under"
    fee_categories ||--o{ fee_structure_amendments : "amended"
    fee_structures ||--o{ student_fee_ledger : "generates entries"
    fee_structures ||--o{ fee_structure_amendments : "amended"
    students ||--o{ student_fee_ledger : "owes"
    students ||--o{ fee_payments : "pays"
    students ||--o{ fee_waivers : "receives waiver"
    students ||--o{ payment_transactions : "online payment"
    student_fee_ledger ||--o{ fee_payments : "paid via"
    student_fee_ledger ||--o{ fee_waivers : "waived via"
    student_fee_ledger ||--o{ student_fee_ledger_edits : "edit history"
```
