# Academic Year Lifecycle — Flow Diagrams

Paste each diagram block at https://mermaid.live to preview.

---

## Diagram 1 — Complete Year Lifecycle

```mermaid
flowchart TD
    A([School Admin]) --> B[Create Academic Year\nlabel + start date + end date]
    B --> C[Set Up Fee Structures\ngrade x category x amount]
    C --> D[Generate Bills\none bill per student per period]
    D --> E[Fee Collection\nover the year]
    E --> F{15 days before\nend date?}
    F -- No --> E
    F -- Yes --> G[Warning Banner shown\nYear ending soon]
    G --> E
    E --> H{end date\npassed?}
    H -- No --> E
    H -- Yes --> I[Bills flip to OVERDUE\nauto on every page load]
    I --> J[Year-End Review\nresolve dues per student]
    J --> K[Close Fee Year\nlock fee records]
    K --> L[Create Next Academic Year]
    L --> M[Snapshot Student History\npermanent record before any change]
    M --> N[Promote Students\ngrade N to grade N plus 1]
    N --> O[Generate New Year Bills]
    O --> P[Activate New Year\npassword required]
    P --> E
```

---

## Diagram 2 — Fee Bill Lifecycle

```mermaid
flowchart TD
    A([Admin generates bills]) --> B[Bill created in student_fee_ledger\nstatus = pending\ndue_date = year end date]
    B --> C{Payment received?}
    C -- Partial payment --> D[status = partial\namount_paid updated]
    D --> C
    C -- Full payment --> E([status = paid])
    C -- No payment --> F{Year end date\npassed?}
    F -- No --> C
    F -- Yes --> G[status = overdue]
    G --> H{Admin extended\nthe year?}
    H -- Yes --> I[status reverts to pending\ndue_date updated to new end date]
    I --> C
    H -- No --> J[Year-End Review]
    J --> K{Admin decision}
    K -- Carry Forward --> L[Original bill = waived\nNew bill created in next year\ncarried_forward_to_ledger_id set]
    K -- Write Off --> M([status = waived\nwrite-off record written])
    K -- Leave Open --> N([status stays overdue\ncounted in year close record])
    L --> O([Done])
```

---

## Diagram 3 — Year-End Dues Resolution

```mermaid
flowchart TD
    A([Admin opens Year-End tab]) --> B[Load all students with unpaid balance]
    B --> C[Admin picks decision per student]
    C --> D{Decision?}
    D -- Carry Forward --> E{Student continuing\nnext year?}
    E -- Yes --> F[Create Previous Year Dues bill\nin next year at same amount]
    F --> G[Mark original bills waived\nwaiver_type = carry_forward]
    G --> H[carried_forward_to_ledger_id set\nblocks double payment on original]
    E -- No graduating or left --> I[Cannot carry forward\nMust write off or leave open]
    D -- Write Off --> J[All bills marked waived\nReason recorded]
    D -- Leave Open --> K[Bills stay open\ncounted in year close]
    H --> L[Admin closes fee year]
    I --> L
    J --> L
    K --> L
    L --> M([fee_year_close record written\ncarried and written-off and open counts saved])
```

---

## Diagram 4 — Student Grade Promotion

```mermaid
flowchart TD
    A([Admin runs Year Rollover]) --> B[Fetch all active students]
    B --> C{Student has\ngrade set?}
    C -- No --> D[Skip student\nlog warning]
    C -- Yes --> E{Is final grade?\ne.g. Grade 12}
    E -- Yes --> F[Write student_class_history\npromoted_to_grade = NULL]
    F --> G[Update students\nstatus = graduated]
    E -- No --> H[Write student_class_history\ngrade = current\npromoted_to_grade = next]
    H --> I[Update students\ngrade = next grade]
    D --> J[Next student]
    G --> J
    I --> J
    J --> K{More students?}
    K -- Yes --> C
    K -- No --> L[Switch active year\nis_current = new year]
    L --> M([Rollover complete\nall history permanently recorded])
```

Grade sequence used: `Nursery → LKG → UKG → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → Graduated`

---

## Diagram 5 — Year Extension and Bill Cascade

```mermaid
flowchart TD
    A([Admin clicks Extend Year]) --> B[Enter new end date\ne.g. plus 30 days]
    B --> C[System shows impact preview\nX bills will revert to pending\nY bills will become overdue]
    C --> D[Admin enters password to confirm]
    D --> E{Password correct?}
    E -- No --> F([Rejected])
    E -- Yes --> G[Save ledger snapshot to\nacademic_year_snapshots]
    G --> H[UPDATE academic_years\nend_date = new date]
    H --> I[UPDATE student_fee_ledger\ndue_date = new end date\nonly for unpaid and partial bills]
    I --> J[Overdue status recalculated\npending becomes overdue if past new date\noverdue reverts to pending if before new date]
    J --> K([Extension complete\nAll bills show correct due date])
```

---

## Diagram 6 — New Year Transition Wizard

```mermaid
flowchart TD
    START([Admin starts Year Transition]) --> S1

    S1[STEP 1 - Review Dues\nCarry Forward or Write Off or Leave Open\nper student]
    S1 --> S1C{All students\ndecided?}
    S1C -- No --> S1
    S1C -- Yes --> S2

    S2[STEP 2 - Close Fee Year\nLock fee records\nfee_year_close record written]
    S2 --> S2C{Year\nclosed?}
    S2C -- No --> S2
    S2C -- Yes --> S3

    S3[STEP 3 - Create Next Academic Year\nEnter label + start date + end date]
    S3 --> S3C{Next year\nexists?}
    S3C -- No --> S3
    S3C -- Yes --> S4

    S4[STEP 4 - Snapshot and Promote Students\nstudent_class_history written\ngrades incremented]
    S4 --> S4C{Rollover\ncomplete?}
    S4C -- No --> S4
    S4C -- Yes --> S5

    S5[STEP 5 - Generate New Year Bills\nbased on new fee structures\nnew amounts and categories apply]
    S5 --> S5C{Bills\ngenerated?}
    S5C -- No --> S5
    S5C -- Yes --> S6

    S6[STEP 6 - Activate New Year\nPassword confirmation required\nis_current switches to new year]
    S6 --> DONE([Year Transition Complete])
```

---

## Diagram 7 — Table Relationships

```mermaid
erDiagram
    academic_years {
        int id
        int school_id
        text label
        date start_date
        date end_date
        bool is_current
    }

    fee_structures {
        int id
        int school_id
        text academic_year
        text grade
        int fee_category_id
        numeric amount
        text frequency
    }

    student_fee_ledger {
        int id
        int school_id
        int student_id
        int fee_category_id
        text academic_year
        text period_label
        numeric amount_due
        numeric amount_paid
        numeric waiver_amount
        date due_date
        text status
        int carried_forward_to_ledger_id
    }

    fee_payments {
        int id
        int ledger_id
        numeric amount
        text payment_mode
        text payment_status
        date paid_date
    }

    fee_waivers {
        int id
        int ledger_id
        text waiver_type
        numeric waiver_amount
        text reason
    }

    fee_year_close {
        int id
        int school_id
        text academic_year
        text closed_by
        bool is_reopened
        int carried_count
        int writeoff_count
        int open_count
    }

    students {
        int id
        int school_id
        text name
        text grade
        text section
        text status
    }

    student_class_history {
        int id
        int student_id
        int academic_year_id
        text grade
        text section
        text promoted_to_grade
        timestamptz promoted_at
    }

    academic_years ||--o{ fee_structures : "fee amounts set per year"
    academic_years ||--o{ student_class_history : "history snapshot per year"
    students ||--o{ student_fee_ledger : "bills raised for student"
    students ||--o{ student_class_history : "grade history of student"
    student_fee_ledger ||--o{ fee_payments : "paid via"
    student_fee_ledger ||--o{ fee_waivers : "waived via"
    student_fee_ledger ||--o| student_fee_ledger : "carried forward to"
```
