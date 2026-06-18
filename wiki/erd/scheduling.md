# Scheduling: Timetable, Attendance, Leave & Substitutes

This diagram covers the scheduling domain: timetable generation, teacher/student attendance, leave management, and substitute teacher assignments.

## Tables

| Table | Purpose |
|---|---|
| **class_timetable** | Source of truth for each class's schedule. One row per class + day + period. Includes breaks, lock state, and source tracking (auto/manual/cloned). |
| **timetable** | Teacher's personal schedule view, synced from class_timetable. Denormalized for fast teacher-portal queries. |
| **timetable_versions** | Version tracking for timetable snapshots (draft vs. published). |
| **class_timetable_modes** | Master/slave/independent mode per class. Slave classes clone their timetable from a master source class. |
| **teacher_unavailability** | Hard constraints for the timetable generator. Teachers mark specific day+period slots as unavailable. |
| **attendance** | Student attendance records. Two sessions per day (morning + afternoon). Marked by a teacher. |
| **leave_requests** | Teacher leave applications. Flows through pending -> approved/rejected. |
| **substitute_assignments** | When a teacher is on approved leave, admin assigns substitute teachers per period. Linked to the leave request. |

## Entity Relationship Diagram

```mermaid
erDiagram
    classes {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR grade
        VARCHAR section
        INTEGER class_teacher_id FK
    }

    class_timetable {
        SERIAL id PK
        INTEGER class_id FK
        INTEGER school_id FK
        VARCHAR day_of_week
        INTEGER period_number
        VARCHAR time_from
        VARCHAR time_to
        VARCHAR subject_name
        INTEGER teacher_id FK
        VARCHAR room
        BOOLEAN is_break
        VARCHAR break_label
        BOOLEAN is_locked
        BOOLEAN is_manual
        VARCHAR source
        INTEGER template_id FK
    }

    timetable {
        SERIAL id PK
        INTEGER teacher_id FK
        INTEGER school_id FK
        VARCHAR day_of_week
        INTEGER period_number
        VARCHAR time_from
        VARCHAR time_to
        VARCHAR subject
        VARCHAR grade
        VARCHAR section
        VARCHAR room
    }

    timetable_versions {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR status
        BOOLEAN is_active
        TIMESTAMPTZ circulated_at
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
        TEXT reason
    }

    schedule_templates {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        JSONB settings
    }

    attendance {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER class_id FK
        INTEGER student_id FK
        DATE date
        VARCHAR session
        VARCHAR status
        INTEGER marked_by_teacher_id FK
        TIMESTAMPTZ marked_at
    }

    leave_requests {
        SERIAL id PK
        INTEGER teacher_id FK
        INTEGER school_id FK
        VARCHAR leave_type
        DATE start_date
        DATE end_date
        TEXT reason
        VARCHAR status
        TIMESTAMP reviewed_at
    }

    substitute_assignments {
        SERIAL id PK
        INTEGER school_id FK
        INTEGER leave_request_id FK
        INTEGER original_teacher_id FK
        INTEGER substitute_teacher_id FK
        INTEGER class_id FK
        DATE date
        VARCHAR day_of_week
        INTEGER period_number
        VARCHAR subject_name
    }

    teachers {
        SERIAL id PK
        VARCHAR name
    }

    students {
        SERIAL id PK
        VARCHAR name
    }

    schools {
        SERIAL id PK
        VARCHAR name
    }

    schools ||--o{ class_timetable : "has schedules"
    schools ||--o{ timetable : "has teacher schedules"
    schools ||--o{ timetable_versions : "has versions"
    schools ||--o{ attendance : "tracks attendance"
    schools ||--o{ leave_requests : "manages leaves"
    schools ||--o{ substitute_assignments : "assigns subs"
    classes ||--o{ class_timetable : "has periods"
    classes ||--o| class_timetable_modes : "has mode"
    classes ||--o{ attendance : "has attendance"
    classes ||--o{ substitute_assignments : "receives subs"
    classes ||--o| class_timetable_modes : "is master for"
    teachers ||--o{ class_timetable : "assigned to period"
    teachers ||--o{ timetable : "personal schedule"
    teachers ||--o{ teacher_unavailability : "blocked slots"
    teachers ||--o{ leave_requests : "applies for leave"
    teachers ||--o{ attendance : "marks attendance"
    students ||--o{ attendance : "has records"
    leave_requests ||--o{ substitute_assignments : "needs coverage"
    schedule_templates ||--o{ class_timetable : "used by"
```
