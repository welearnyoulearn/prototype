# People: Teachers, Students, Parents & Classes

This diagram covers the people entities and their class assignments. These are the core actors in the school management system.

## Tables

| Table | Purpose |
|---|---|
| **teachers** | School staff. Can be teaching or support staff. Logs in via employee_id + password. Soft-deleted via removed_at. |
| **students** | Enrolled students. Assigned to a grade + section. Logs in via roll_number + password. |
| **parents** | Parent/guardian records. Linked to students via the student_parents join table. Logs in via email. |
| **student_parents** | Many-to-many join: a student can have multiple parents, a parent can have multiple children. |
| **classes** | A specific grade + section combination (e.g. "6A"). Has a class teacher. Unique per school. |
| **class_subjects** | Subjects taught in a class, with the assigned teacher and periods-per-week for timetable generation. |
| **department_hods** | Head of Department assignments. A teacher can be HOD for a department overseeing specific classes. |
| **student_class_history** | Immutable audit trail: which grade+section a student was in for each academic year. Written during rollover. |

## Entity Relationship Diagram

```mermaid
erDiagram
    schools {
        SERIAL id PK
        VARCHAR name
    }

    teachers {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR email
        VARCHAR subject
        VARCHAR phone
        VARCHAR employee_id
        VARCHAR department
        VARCHAR qualification
        DATE date_of_joining
        VARCHAR staff_type
        TEXT teaches_grades
        VARCHAR password_hash
        BOOLEAN password_changed
        VARCHAR status
        TIMESTAMPTZ removed_at
    }

    students {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR email
        VARCHAR grade
        VARCHAR section
        VARCHAR roll_number
        VARCHAR phone
        VARCHAR parent_name
        VARCHAR parent_phone
        VARCHAR parent_email
        VARCHAR password_hash
        BOOLEAN password_changed
        VARCHAR status
    }

    parents {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR name
        VARCHAR email
        VARCHAR phone
        VARCHAR password_hash
        BOOLEAN password_changed
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
        TIMESTAMPTZ timetable_generated_at
        VARCHAR timetable_generated_by
        TIMESTAMPTZ timetable_circulated_at
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
        INTEGER_ARRAY class_ids
    }

    student_class_history {
        SERIAL id PK
        INTEGER student_id FK
        INTEGER school_id
        INTEGER academic_year_id FK
        VARCHAR grade
        VARCHAR section
        VARCHAR promoted_to_grade
        TIMESTAMPTZ promoted_at
    }

    academic_years {
        SERIAL id PK
        INTEGER school_id FK
        VARCHAR label
    }

    schools ||--o{ teachers : "employs"
    schools ||--o{ students : "enrolls"
    schools ||--o{ parents : "has parents"
    schools ||--o{ classes : "has classes"
    schools ||--o{ department_hods : "has HODs"
    teachers ||--o{ class_subjects : "teaches"
    teachers ||--o| classes : "is class teacher of"
    teachers ||--o{ department_hods : "assigned as HOD"
    students ||--o{ student_parents : "has parents"
    parents ||--o{ student_parents : "has children"
    classes ||--o{ class_subjects : "has subjects"
    students ||--o{ student_class_history : "promotion trail"
    academic_years ||--o{ student_class_history : "for year"
```
