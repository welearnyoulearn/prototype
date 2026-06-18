# Full Database Schema ERD

This is the complete Entity Relationship Diagram for all 60+ tables in the WLYL school management platform. For easier reading, see the domain-specific diagrams linked in the [ERD index](README.md).

> **Note:** This diagram shows all tables with their primary keys, foreign keys, and key columns. Some columns are omitted for readability. Refer to `lib/db.ts` for the full column definitions.

## Complete Entity Relationship Diagram

```mermaid
erDiagram
    %% ━━━ CORE ━━━
    schools {
        SERIAL id PK
        VARCHAR name
        VARCHAR school_code UK
        VARCHAR status
        VARCHAR board
        TIMESTAMPTZ deleted_at
    }
    school_subscriptions {
        SERIAL id PK
        INTEGER school_id FK, UK
        VARCHAR tier
    }
    users {
        SERIAL id PK
        VARCHAR email
        VARCHAR school_code UK
        VARCHAR role
        INTEGER school_id FK
    }
    user_profiles {
        SERIAL id PK
        INTEGER user_id FK, UK
        VARCHAR full_name
    }
    password_reset_tokens {
        SERIAL id PK
        INTEGER user_id FK
        VARCHAR token UK
        VARCHAR role
    }
    plan_features {
        SERIAL id PK
        VARCHAR feature_key
        VARCHAR tier
        BOOLEAN enabled
    }
    plan_pricing {
        SERIAL id PK
        VARCHAR tier UK
        NUMERIC monthly_price
    }
    school_feature_overrides {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR feature_key
        BOOLEAN enabled
    }
    app_bootstrap_state {
        TEXT key PK
        TIMESTAMPTZ completed_at
    }

    %% ━━━ SCHOOL CONFIG ━━━
    school_schedule_settings {
        SERIAL id PK
        INTEGER school_id FK, UK
        INTEGER periods_per_day
    }
    schedule_templates {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        JSONB settings
    }
    school_subject_templates {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        JSONB subjects
    }
    school_calendar {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR title
        DATE event_date
    }
    academic_years {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR label
        BOOLEAN is_current
    }
    curriculum_assignments {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR grade
        VARCHAR curriculum_type
    }
    display_tokens {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR token UK
    }
    platform_audit_log {
        SERIAL id PK
        INTEGER actor_id FK
        VARCHAR action
        VARCHAR entity_type
    }

    %% ━━━ PEOPLE ━━━
    teachers {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR employee_id
        VARCHAR department
        VARCHAR staff_type
        TIMESTAMPTZ removed_at
    }
    students {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR grade
        VARCHAR section
        VARCHAR roll_number
    }
    parents {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR email
    }
    student_parents {
        SERIAL id PK
        INTEGER student_id FK
        INTEGER parent_id FK
    }
    classes {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR grade
        VARCHAR section
        INTEGER class_teacher_id FK
        TIMESTAMPTZ deleted_at
    }
    class_subjects {
        SERIAL id PK
        INTEGER class_id FK
        VARCHAR subject_name
        INTEGER teacher_id FK
        INTEGER periods_per_week
    }
    department_hods {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR department
        INTEGER teacher_id FK
    }
    student_class_history {
        SERIAL id PK
        INTEGER student_id FK
        INTEGER academic_year_id FK
        VARCHAR grade
        VARCHAR section
    }

    %% ━━━ SCHEDULING ━━━
    class_timetable {
        SERIAL id PK
        INTEGER class_id FK
        INTEGER school_id FK
        INTEGER teacher_id FK
        VARCHAR day_of_week
        INTEGER period_number
        VARCHAR subject_name
        BOOLEAN is_break
        INTEGER template_id FK
    }
    timetable {
        SERIAL id PK
        INTEGER teacher_id FK
        INTEGER school_id FK
        VARCHAR day_of_week
        INTEGER period_number
        VARCHAR subject
    }
    timetable_versions {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR status
    }
    class_timetable_modes {
        SERIAL id PK
        INTEGER class_id FK, UK
        INTEGER school_id FK
        VARCHAR mode
        INTEGER master_source_id FK
    }
    teacher_unavailability {
        SERIAL id PK
        INTEGER teacher_id FK
        INTEGER school_id FK
        VARCHAR day_of_week
        INTEGER period_number
    }

    %% ━━━ ATTENDANCE & LEAVE ━━━
    attendance {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER class_id FK
        INTEGER student_id FK
        DATE date
        VARCHAR session
        VARCHAR status
        INTEGER marked_by_teacher_id FK
    }
    leave_requests {
        SERIAL id PK
        INTEGER teacher_id FK
        INTEGER school_id FK
        VARCHAR leave_type
        DATE start_date
        DATE end_date
        VARCHAR status
    }
    substitute_assignments {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER leave_request_id FK
        INTEGER original_teacher_id FK
        INTEGER substitute_teacher_id FK
        INTEGER class_id FK
        DATE date
        INTEGER period_number
    }

    %% ━━━ TASKS ━━━
    tasks {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER class_id FK
        INTEGER teacher_id FK
        VARCHAR title
        VARCHAR subject
        VARCHAR task_type
        VARCHAR status
        DATE due_date
    }
    task_submissions {
        SERIAL id PK
        INTEGER task_id FK
        INTEGER student_id FK
        INTEGER school_id FK
        NUMERIC score
        VARCHAR status
        INTEGER reviewed_by FK
    }
    task_reminders {
        SERIAL id PK
        INTEGER task_id FK
        INTEGER school_id FK
        INTEGER sent_by FK
    }

    %% ━━━ DOUBTS ━━━
    doubts {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER class_id FK
        INTEGER student_id FK
        VARCHAR subject
        TEXT question
        INTEGER task_id FK
        VARCHAR status
    }
    doubt_messages {
        SERIAL id PK
        INTEGER doubt_id FK
        VARCHAR sender_type
        TEXT message
    }
    doubt_upvotes {
        SERIAL id PK
        INTEGER doubt_id FK
        INTEGER student_id FK
    }

    %% ━━━ EXAMS ━━━
    exam_records {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER class_id FK
        INTEGER created_by FK
        VARCHAR exam_name
        VARCHAR exam_type
        VARCHAR status
    }
    exam_subjects {
        SERIAL id PK
        INTEGER exam_id FK
        VARCHAR subject_name
        INTEGER teacher_id FK
        INTEGER max_marks
    }
    exam_marks {
        SERIAL id PK
        INTEGER exam_id FK
        INTEGER student_id FK
        VARCHAR subject_name
        NUMERIC marks_obtained
    }
    parent_mark_acks {
        SERIAL id PK
        INTEGER exam_id FK
        INTEGER student_id FK
    }
    report_card_config {
        SERIAL id PK
        INTEGER school_id FK, UK
        JSONB grading_scheme
    }
    report_card_remarks {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        INTEGER exam_id FK
        TEXT class_teacher_remark
    }

    %% ━━━ SYLLABUS ━━━
    syllabus_topics {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER class_id FK
        VARCHAR subject
        VARCHAR chapter_name
        VARCHAR topic_name
        VARCHAR status
        INTEGER covered_by FK
        BOOLEAN published
    }
    weekly_tests {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER class_id FK
        INTEGER student_id FK
        DATE week_start
        JSONB questions
        VARCHAR status
    }
    textbook_library {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR grade
        VARCHAR subject
    }
    textbook_chunks {
        SERIAL id PK
        INTEGER textbook_id FK
        TEXT content
    }

    %% ━━━ FEES ━━━
    fee_categories {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR frequency
    }
    fee_structures {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER fee_category_id FK
        VARCHAR grade
        NUMERIC amount
        VARCHAR academic_year
    }
    fee_structure_locks {
        SERIAL id PK
        INTEGER school_id
        TEXT academic_year
    }
    fee_structure_amendments {
        SERIAL id PK
        INTEGER fee_structure_id FK
        INTEGER fee_category_id FK
        NUMERIC old_amount
        NUMERIC new_amount
    }
    student_fee_ledger {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        INTEGER fee_category_id FK
        INTEGER fee_structure_id FK
        NUMERIC amount_due
        NUMERIC amount_paid
        VARCHAR status
    }
    student_fee_ledger_edits {
        SERIAL id PK
        INTEGER ledger_id FK
        NUMERIC old_amount
        NUMERIC new_amount
    }
    fee_payments {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        INTEGER ledger_id FK
        NUMERIC amount
        VARCHAR payment_mode
        VARCHAR receipt_number UK
    }
    fee_waivers {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        INTEGER ledger_id FK
        VARCHAR waiver_type
        NUMERIC waiver_amount
    }
    school_payment_config {
        SERIAL id PK
        INTEGER school_id FK, UK
        TEXT cashfree_app_id
        BOOLEAN is_active
    }
    payment_transactions {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        VARCHAR cashfree_order_id UK
        NUMERIC amount
        VARCHAR status
    }
    payment_webhook_log {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR cashfree_order_id
        JSONB raw_payload
    }

    %% ━━━ ENGAGEMENT ━━━
    announcements {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR title
        VARCHAR target_audience
        VARCHAR priority
    }
    notifications {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER recipient_teacher_id FK
        INTEGER recipient_student_id FK
        VARCHAR type
        BOOLEAN is_read
    }
    daily_newspapers {
        SERIAL id PK
        INTEGER school_id FK
        DATE date
        VARCHAR title
    }
    student_newspaper_reads {
        SERIAL id PK
        INTEGER student_id FK
        INTEGER newspaper_id FK
    }
    hub_daily_content {
        SERIAL id PK
        DATE content_date UK
        JSONB gk_questions
        JSONB word_of_day
    }
    student_hub_completions {
        SERIAL id PK
        INTEGER student_id FK
        VARCHAR activity_type
        DATE completed_date
    }
    student_points {
        SERIAL id PK
        INTEGER student_id FK
        VARCHAR action_type
        INTEGER points
    }
    student_badges {
        SERIAL id PK
        INTEGER student_id FK
        VARCHAR badge_type
    }
    student_streaks {
        INTEGER student_id PK, FK
        INTEGER current_streak
        INTEGER longest_streak
    }
    marketplace_items {
        SERIAL id PK
        VARCHAR name UK
        INTEGER cost_points
    }
    marketplace_orders {
        SERIAL id PK
        INTEGER student_id FK
        INTEGER item_id FK
        INTEGER points_spent
        VARCHAR status
    }
    student_portal_sessions {
        SERIAL id PK
        INTEGER student_id FK
    }
    student_portal_activity {
        SERIAL id PK
        INTEGER student_id FK
        INTEGER session_id FK
        VARCHAR action_type
    }
    ai_chat_sessions {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER student_id FK
        VARCHAR subject
    }
    teacher_ai_sessions {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER teacher_id FK
        VARCHAR context
    }

    %% ━━━ WHATSAPP & BILLING ━━━
    school_whatsapp_config {
        SERIAL id PK
        INTEGER school_id FK, UK
        VARCHAR provider
        BOOLEAN is_active
    }
    whatsapp_messages {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR recipient_phone
        VARCHAR message_type
        VARCHAR status
    }
    whatsapp_usage_summary {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR year_month
        INTEGER sent_count
    }
    billing_cycles {
        SERIAL id PK
        INTEGER school_id FK
        DATE cycle_start
        DATE cycle_end
        VARCHAR status
    }
    usage_ledger {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER billing_cycle_id FK
        VARCHAR event_type
    }
    saas_invoices {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER billing_cycle_id FK
        VARCHAR invoice_number UK
        VARCHAR status
        NUMERIC total_amount
    }
    saas_invoice_items {
        SERIAL id PK
        INTEGER invoice_id FK
        INTEGER school_id FK
        VARCHAR item_type
        NUMERIC amount
    }
    saas_payments {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER invoice_id FK
        NUMERIC amount
    }

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% RELATIONSHIPS
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    %% Core
    schools ||--o| school_subscriptions : "subscription"
    schools ||--o{ users : "admins"
    schools ||--o| school_schedule_settings : "schedule config"
    schools ||--o{ schedule_templates : "templates"
    schools ||--o{ school_subject_templates : "subject sets"
    schools ||--o{ school_calendar : "calendar"
    schools ||--o{ academic_years : "years"
    schools ||--o{ curriculum_assignments : "curricula"
    schools ||--o{ display_tokens : "displays"
    schools ||--o{ school_feature_overrides : "overrides"
    schools ||--o| school_payment_config : "payment config"
    schools ||--o| school_whatsapp_config : "WA config"
    schools ||--o| report_card_config : "report config"
    users ||--o| user_profiles : "profile"
    users ||--o{ password_reset_tokens : "reset tokens"
    users ||--o{ platform_audit_log : "audit trail"

    %% People
    schools ||--o{ teachers : "employs"
    schools ||--o{ students : "enrolls"
    schools ||--o{ parents : "has parents"
    schools ||--o{ classes : "has classes"
    schools ||--o{ department_hods : "has HODs"
    teachers ||--o| classes : "class teacher"
    teachers ||--o{ class_subjects : "teaches"
    teachers ||--o{ department_hods : "HOD"
    students ||--o{ student_parents : "parents"
    parents ||--o{ student_parents : "children"
    classes ||--o{ class_subjects : "subjects"
    students ||--o{ student_class_history : "history"
    academic_years ||--o{ student_class_history : "year"

    %% Scheduling
    classes ||--o{ class_timetable : "schedule"
    classes ||--o| class_timetable_modes : "mode"
    teachers ||--o{ class_timetable : "teaches period"
    teachers ||--o{ timetable : "personal schedule"
    teachers ||--o{ teacher_unavailability : "unavailable"
    schedule_templates ||--o{ class_timetable : "template"
    schools ||--o{ timetable_versions : "versions"

    %% Attendance & Leave
    classes ||--o{ attendance : "attendance"
    students ||--o{ attendance : "attendance"
    teachers ||--o{ attendance : "marks"
    teachers ||--o{ leave_requests : "requests leave"
    leave_requests ||--o{ substitute_assignments : "subs"
    classes ||--o{ substitute_assignments : "receives subs"

    %% Tasks
    classes ||--o{ tasks : "assigned"
    teachers ||--o{ tasks : "creates"
    tasks ||--o{ task_submissions : "submissions"
    tasks ||--o{ task_reminders : "reminders"
    students ||--o{ task_submissions : "submits"

    %% Doubts
    classes ||--o{ doubts : "raised in"
    students ||--o{ doubts : "asks"
    tasks ||--o{ doubts : "about task"
    doubts ||--o{ doubt_messages : "chat"
    doubts ||--o{ doubt_upvotes : "upvotes"
    students ||--o{ doubt_upvotes : "upvotes"

    %% Exams
    classes ||--o{ exam_records : "exams"
    teachers ||--o{ exam_records : "creates"
    exam_records ||--o{ exam_subjects : "subjects"
    exam_records ||--o{ exam_marks : "marks"
    exam_records ||--o{ parent_mark_acks : "acks"
    exam_records ||--o{ report_card_remarks : "remarks"
    students ||--o{ exam_marks : "scores"
    students ||--o{ report_card_remarks : "remarks"

    %% Syllabus
    classes ||--o{ syllabus_topics : "syllabus"
    teachers ||--o{ syllabus_topics : "covers"
    classes ||--o{ weekly_tests : "tests"
    students ||--o{ weekly_tests : "takes"
    schools ||--o{ textbook_library : "textbooks"
    textbook_library ||--o{ textbook_chunks : "chunks"

    %% Fees
    schools ||--o{ fee_categories : "fee types"
    fee_categories ||--o{ fee_structures : "amounts"
    fee_categories ||--o{ student_fee_ledger : "billed"
    fee_structures ||--o{ student_fee_ledger : "generates"
    fee_structures ||--o{ fee_structure_amendments : "amended"
    students ||--o{ student_fee_ledger : "owes"
    student_fee_ledger ||--o{ fee_payments : "paid"
    student_fee_ledger ||--o{ fee_waivers : "waived"
    student_fee_ledger ||--o{ student_fee_ledger_edits : "edits"
    students ||--o{ payment_transactions : "online pay"

    %% Engagement
    schools ||--o{ announcements : "posts"
    schools ||--o{ notifications : "notifies"
    schools ||--o{ daily_newspapers : "newspapers"
    daily_newspapers ||--o{ student_newspaper_reads : "reads"
    students ||--o{ student_newspaper_reads : "reads"
    students ||--o{ student_hub_completions : "hub"
    students ||--o{ student_points : "points"
    students ||--o{ student_badges : "badges"
    students ||--o| student_streaks : "streak"
    marketplace_items ||--o{ marketplace_orders : "ordered"
    students ||--o{ marketplace_orders : "orders"
    students ||--o{ student_portal_sessions : "sessions"
    student_portal_sessions ||--o{ student_portal_activity : "activity"
    students ||--o{ ai_chat_sessions : "AI chat"
    teachers ||--o{ teacher_ai_sessions : "AI chat"

    %% WhatsApp & Billing
    schools ||--o{ whatsapp_messages : "sends"
    schools ||--o{ whatsapp_usage_summary : "usage"
    schools ||--o{ billing_cycles : "billed"
    billing_cycles ||--o{ usage_ledger : "usage"
    billing_cycles ||--o{ saas_invoices : "invoiced"
    saas_invoices ||--o{ saas_invoice_items : "items"
    saas_invoices ||--o{ saas_payments : "payments"
```
