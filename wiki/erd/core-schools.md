# Core: Schools, Users & Configuration

This diagram covers the foundational entities: schools, their subscriptions, admin users, platform-level configuration, and school-level settings.

## Tables

| Table | Purpose |
|---|---|
| **schools** | Central entity. Every record in the system belongs to a school. Holds contact info, branding, plan dates, soft-delete. |
| **school_subscriptions** | 1:1 with school. Tracks the subscription tier (none/basic/standard/premium). |
| **users** | School admins and platform admins. School admins log in via school_code, platform admins via email. |
| **user_profiles** | 1:1 extension of users with full name, phone, designation, bio. |
| **password_reset_tokens** | Time-limited tokens for password recovery across all roles. |
| **plan_features** | Feature-flag matrix: which features are enabled for each subscription tier. |
| **plan_pricing** | Pricing, quotas, and capability flags per tier. |
| **school_feature_overrides** | Per-school overrides on top of tier-level plan_features. |
| **school_schedule_settings** | 1:1. Configures periods per day, break timings, start/end times. |
| **schedule_templates** | Named saved schedule configurations (Full Day, Half Day, Exam Day). |
| **school_subject_templates** | Default subject sets per grade range, auto-applied when creating classes. |
| **school_calendar** | Academic calendar: holidays, events, meetings. |
| **academic_years** | Tracks academic year labels (e.g. "2024-25") with start/end dates and current flag. |
| **curriculum_assignments** | Maps which curriculum (CBSE/APSSC) a school uses per grade. |
| **display_tokens** | Authentication tokens for TV/kiosk display screens. |
| **platform_audit_log** | Immutable log of every platform admin action (create, update, delete). |
| **app_bootstrap_state** | Internal: tracks whether schema bootstrap has completed. |

## Entity Relationship Diagram

```mermaid
erDiagram
    schools {
        SERIAL id PK
        VARCHAR name
        VARCHAR type
        VARCHAR city
        VARCHAR country
        VARCHAR phone
        VARCHAR email
        TEXT address
        VARCHAR school_code UK
        VARCHAR logo_url
        JSONB grading_scheme
        VARCHAR status
        VARCHAR board
        DATE plan_start_date
        DATE plan_end_date
        NUMERIC plan_amount
        TIMESTAMPTZ deleted_at
        TIMESTAMP created_at
    }

    school_subscriptions {
        SERIAL id PK
        INTEGER school_id FK, UK
        VARCHAR tier
        TIMESTAMP updated_at
    }

    users {
        SERIAL id PK
        VARCHAR email
        VARCHAR school_code UK
        VARCHAR password_hash
        VARCHAR role
        INTEGER school_id FK
        BOOLEAN first_login
        BOOLEAN profile_completed
        VARCHAR full_name
        VARCHAR status
        TIMESTAMPTZ last_login_at
        TIMESTAMP created_at
    }

    user_profiles {
        SERIAL id PK
        INTEGER user_id FK, UK
        VARCHAR full_name
        VARCHAR phone
        VARCHAR designation
        TEXT bio
        TIMESTAMP updated_at
    }

    password_reset_tokens {
        SERIAL id PK
        INTEGER user_id FK
        VARCHAR token UK
        TIMESTAMP expires_at
        BOOLEAN used
        VARCHAR role
        INTEGER reference_id
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
        VARCHAR display_name
        NUMERIC monthly_price
        INTEGER included_whatsapp_messages
        NUMERIC whatsapp_overage_rate
        BOOLEAN online_payments_included
        BOOLEAN whatsapp_included
        BOOLEAN usage_billing_enabled
    }

    school_feature_overrides {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR feature_key
        BOOLEAN enabled
        TEXT updated_by
    }

    school_schedule_settings {
        SERIAL id PK
        INTEGER school_id FK, UK
        INTEGER periods_per_day
        VARCHAR start_time
        VARCHAR end_time
        INTEGER morning_break_after_period
        INTEGER lunch_after_period
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
        INTEGER from_grade
        INTEGER to_grade
        JSONB subjects
    }

    school_calendar {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR title
        DATE event_date
        DATE end_date
        VARCHAR event_type
        VARCHAR color
    }

    academic_years {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR label
        DATE start_date
        DATE end_date
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
        VARCHAR label
    }

    platform_audit_log {
        SERIAL id PK
        INTEGER actor_id FK
        VARCHAR actor_email
        VARCHAR action
        VARCHAR entity_type
        INTEGER entity_id
        JSONB details
    }

    schools ||--o| school_subscriptions : "has subscription"
    schools ||--o{ users : "has admins"
    schools ||--o| school_schedule_settings : "has schedule config"
    schools ||--o{ schedule_templates : "has templates"
    schools ||--o{ school_subject_templates : "has subject sets"
    schools ||--o{ school_calendar : "has calendar events"
    schools ||--o{ academic_years : "has academic years"
    schools ||--o{ curriculum_assignments : "has curricula"
    schools ||--o{ display_tokens : "has display tokens"
    schools ||--o{ school_feature_overrides : "has feature overrides"
    users ||--o| user_profiles : "has profile"
    users ||--o{ password_reset_tokens : "has reset tokens"
    users ||--o{ platform_audit_log : "performed actions"
```
