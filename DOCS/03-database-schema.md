# WLYL Platform — Database Schema

> **Database:** PostgreSQL  
> **Managed via:** `lib/db.ts` — `initDB()` runs all CREATE TABLE + migrations on startup  
> **Migration strategy:** Defensive — each ALTER TABLE wrapped in try/catch to allow partial re-runs  
> **Total tables:** 50+

---

## Entity Relationship Overview

```
schools
  ├── school_subscriptions (1:1)
  ├── users (school admins) (1:many)
  │     └── user_profiles (1:1)
  │     └── password_reset_tokens
  ├── teachers (1:many)
  ├── students (1:many)
  ├── classes (1:many)
  │     └── class_subjects (1:many)
  │     └── class_timetable (1:many)
  │     └── class_timetable_modes (1:1)
  ├── timetable (teacher view, derived from class_timetable)
  ├── timetable_versions
  ├── schedule_templates
  ├── school_schedule_settings (1:1)
  ├── school_calendar
  ├── academic_years (1:many)
  │     └── student_class_history
  ├── announcements
  ├── notifications
  ├── display_tokens
  ├── plan_features
  └── platform_audit_log

teachers
  ├── attendance (marked_by_teacher_id)
  ├── leave_requests
  ├── substitute_assignments (original + substitute)
  ├── teacher_unavailability
  ├── tasks (created_by teacher_id)
  ├── exams (created_by)
  ├── exam_subjects (teacher per subject)
  ├── syllabus_topics (covered_by)
  └── timetable (assigned to teacher)

students
  ├── attendance
  ├── task_submissions
  ├── doubts
  │     └── doubt_messages
  │     └── doubt_upvotes
  ├── exam_marks
  ├── student_fee_ledger
  │     └── fee_payments
  │     └── fee_waivers
  ├── student_points
  ├── student_badges
  ├── student_streaks
  ├── student_newspaper_reads
  ├── weekly_tests
  ├── student_portal_sessions
  ├── student_portal_activity
  └── report_card_remarks
```

---

## Table Definitions

---

### CORE: Schools & Users

#### `schools`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| name | VARCHAR(255) | NOT NULL | |
| type | VARCHAR(100) | | Private/Public/Govt |
| city | VARCHAR(100) | | |
| country | VARCHAR(100) | | |
| phone | VARCHAR(50) | | |
| email | VARCHAR(255) | | School contact email |
| address | TEXT | | |
| school_code | VARCHAR(100) | UNIQUE | Auto-generated: `wlyl-schl-{slug}-{id}` |
| logo_url | VARCHAR(500) | | Cloudinary URL |
| grading_scheme | JSONB | | Custom grade thresholds |
| status | VARCHAR(20) | DEFAULT 'active' | active / inactive |
| plan_start_date | DATE | | |
| plan_end_date | DATE | | |
| plan_amount | NUMERIC(10,2) | | |
| deleted_at | TIMESTAMPTZ | | Soft-delete timestamp |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

#### `school_subscriptions`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools, UNIQUE | One per school |
| tier | VARCHAR(20) | DEFAULT 'none' | none / basic / standard / premium |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

---

#### `users` (School admins & platform admin)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| email | VARCHAR(255) | UNIQUE | Platform admin uses email |
| school_code | VARCHAR(100) | UNIQUE | School admin uses school_code |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| role | VARCHAR(20) | NOT NULL | school_admin / platform_admin |
| school_id | INTEGER | FK schools | NULL for platform_admin |
| first_login | BOOLEAN | DEFAULT TRUE | Force password change |
| profile_completed | BOOLEAN | DEFAULT FALSE | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

#### `user_profiles`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| user_id | INTEGER | FK users, UNIQUE | |
| full_name | VARCHAR(255) | | |
| phone | VARCHAR(50) | | |
| designation | VARCHAR(100) | | Principal, Vice Principal, etc. |
| bio | TEXT | | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

---

#### `password_reset_tokens`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| user_id | INTEGER | FK users | |
| token | VARCHAR(255) | UNIQUE | 48-char random string |
| expires_at | TIMESTAMP | | 1 hour from creation |
| used | BOOLEAN | DEFAULT FALSE | One-time use |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

### PEOPLE: Teachers & Students

#### `teachers`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| email | VARCHAR(255) | | |
| subject | VARCHAR(100) | | Primary subject |
| phone | VARCHAR(50) | | |
| employee_id | VARCHAR(50) | | Unique per school (for login) |
| department | VARCHAR(100) | | Science / Arts / Commerce |
| qualification | VARCHAR(200) | | B.Ed, M.Sc, etc. |
| date_of_joining | DATE | | |
| staff_type | VARCHAR(20) | DEFAULT 'teaching' | teaching / support |
| teaches_grades | TEXT | | e.g. "6,7,8" or "6A,6B,7A" |
| password_hash | VARCHAR(255) | | For teacher portal login |
| password_changed | BOOLEAN | DEFAULT FALSE | First-login flag |
| status | VARCHAR(20) | DEFAULT 'active' | active / inactive |
| removed_at | TIMESTAMPTZ | | Soft-delete timestamp |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

#### `students`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| email | VARCHAR(255) | | |
| grade | VARCHAR(20) | NOT NULL | 1–12 |
| section | VARCHAR(10) | NOT NULL | A, B, C, etc. |
| roll_number | VARCHAR(50) | | Auto: `wlyl-stu-{slug}-{num}` |
| phone | VARCHAR(50) | | Student's own phone |
| parent_name | VARCHAR(255) | | Primary parent/guardian |
| parent_phone | VARCHAR(50) | | |
| parent_email | VARCHAR(255) | | For parent portal |
| password_hash | VARCHAR(255) | | For student login |
| password_changed | BOOLEAN | DEFAULT FALSE | |
| status | VARCHAR(20) | DEFAULT 'active' | active / graduated / transferred |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

#### `parents`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| name | VARCHAR(255) | | |
| email | VARCHAR(255) | | For parent portal login |
| phone | VARCHAR(50) | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

#### `student_parents` (Many-to-many: student ↔ parent)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| student_id | INTEGER | FK students | |
| parent_id | INTEGER | FK parents | |
| | | UNIQUE(student_id, parent_id) | |

---

### CLASSES & TIMETABLE

#### `classes`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools, NOT NULL | |
| grade | VARCHAR(20) | NOT NULL | |
| section | VARCHAR(10) | NOT NULL | |
| class_teacher_id | INTEGER | FK teachers | |
| timetable_generated_at | TIMESTAMPTZ | | Set once when generated |
| timetable_generated_by | VARCHAR(50) | | |
| timetable_circulated_at | TIMESTAMPTZ | | Last published date |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(school_id, grade, section) | |

---

#### `class_subjects`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| class_id | INTEGER | FK classes | |
| subject_name | VARCHAR(100) | NOT NULL | |
| teacher_id | INTEGER | FK teachers | Assigned subject teacher |
| periods_per_week | INTEGER | DEFAULT 4 | Used for timetable generation |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(class_id, subject_name) | |

---

#### `class_timetable` (Source of truth for class schedule)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| class_id | INTEGER | FK classes | |
| school_id | INTEGER | FK schools | |
| day_of_week | VARCHAR(10) | | Monday–Saturday |
| period_number | INTEGER | | 1–11 (includes break slots) |
| time_from | VARCHAR(10) | | "08:30" |
| time_to | VARCHAR(10) | | "09:25" |
| subject_name | VARCHAR(100) | | |
| teacher_id | INTEGER | FK teachers | |
| room | VARCHAR(50) | | "Room 107", "Science Lab" |
| is_break | BOOLEAN | DEFAULT FALSE | TRUE for break slots |
| break_label | VARCHAR(50) | | "Morning Break", "Lunch" |
| is_locked | BOOLEAN | DEFAULT FALSE | Locked after admin publishes |
| is_manual | BOOLEAN | DEFAULT FALSE | Legacy — use source |
| source | VARCHAR(20) | DEFAULT 'auto' | auto / manual / cloned / master |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(class_id, day_of_week, period_number) | |

---

#### `timetable` (Teacher's personal schedule view — synced from class_timetable)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| teacher_id | INTEGER | FK teachers | |
| school_id | INTEGER | FK schools | |
| day_of_week | VARCHAR(10) | | |
| period_number | INTEGER | | |
| time_from | VARCHAR(10) | | |
| time_to | VARCHAR(10) | | |
| subject | VARCHAR(100) | | |
| grade | VARCHAR(20) | | |
| section | VARCHAR(10) | | |
| room | VARCHAR(50) | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(teacher_id, school_id, day_of_week, period_number) | |

---

#### `timetable_versions`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| name | VARCHAR(200) | DEFAULT 'Draft' | |
| status | VARCHAR(20) | DEFAULT 'draft' | draft / published |
| is_active | BOOLEAN | DEFAULT FALSE | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| circulated_at | TIMESTAMPTZ | | |

---

#### `class_timetable_modes` (Master/slave sync system)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| class_id | INTEGER | FK classes, UNIQUE | |
| school_id | INTEGER | FK schools | |
| mode | VARCHAR(20) | DEFAULT 'slave' | slave / master / independent |
| master_source_id | INTEGER | FK classes | Which class to clone from |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `teacher_unavailability` (Hard constraints for generator)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| teacher_id | INTEGER | FK teachers | |
| school_id | INTEGER | FK schools | |
| day_of_week | VARCHAR(10) | | |
| period_number | INTEGER | | |
| reason | TEXT | | "On leave", "Medical appointment" |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(teacher_id, day_of_week, period_number) | |

---

#### `school_schedule_settings`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools, UNIQUE | One per school |
| periods_per_day | INTEGER | DEFAULT 8 | |
| start_time | VARCHAR(5) | DEFAULT '08:30' | "HH:MM" format |
| end_time | VARCHAR(5) | DEFAULT '17:00' | |
| morning_break_after_period | INTEGER | DEFAULT 3 | Insert break after this period |
| morning_break_duration | INTEGER | DEFAULT 15 | Minutes |
| lunch_after_period | INTEGER | DEFAULT 5 | |
| lunch_duration | INTEGER | DEFAULT 45 | Minutes |
| afternoon_break_after_period | INTEGER | DEFAULT 7 | |
| afternoon_break_duration | INTEGER | DEFAULT 10 | Minutes |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `schedule_templates` (Named saved schedule configs)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| name | VARCHAR(100) | NOT NULL | "Full Day", "Half Day", "Exam Day" |
| settings | JSONB | | Serialised schedule_settings object |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(school_id, name) | |

---

### ATTENDANCE

#### `attendance`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| class_id | INTEGER | FK classes | |
| student_id | INTEGER | FK students | |
| date | DATE | NOT NULL | |
| session | VARCHAR(20) | DEFAULT 'morning' | morning / afternoon |
| status | VARCHAR(20) | DEFAULT 'present' | present / absent / late |
| marked_by_teacher_id | INTEGER | FK teachers | |
| marked_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(student_id, date, class_id, session) | |

---

### LEAVE & SUBSTITUTES

#### `leave_requests`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| teacher_id | INTEGER | FK teachers | |
| school_id | INTEGER | FK schools | |
| leave_type | VARCHAR(50) | | casual / sick / earned |
| start_date | DATE | | |
| end_date | DATE | | |
| reason | TEXT | | |
| status | VARCHAR(20) | DEFAULT 'pending' | pending / approved / rejected |
| reviewed_at | TIMESTAMP | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

#### `substitute_assignments`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| leave_request_id | INTEGER | FK leave_requests | |
| original_teacher_id | INTEGER | FK teachers | |
| substitute_teacher_id | INTEGER | FK teachers | |
| class_id | INTEGER | FK classes | |
| date | DATE | | |
| day_of_week | VARCHAR(10) | | |
| period_number | INTEGER | | |
| subject_name | VARCHAR(100) | | |
| time_from | VARCHAR(10) | | |
| time_to | VARCHAR(10) | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(class_id, date, period_number) | One sub per period per class |

---

### TASKS & SUBMISSIONS

#### `tasks`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| class_id | INTEGER | FK classes | |
| teacher_id | INTEGER | FK teachers | |
| title | VARCHAR(255) | NOT NULL | |
| subject | VARCHAR(100) | | |
| task_type | VARCHAR(20) | DEFAULT 'homework' | homework / practice / test |
| max_marks | INTEGER | DEFAULT 10 | |
| instructions | TEXT | | |
| assigned_to | VARCHAR(20) | DEFAULT 'all' | all / selected |
| status | VARCHAR(20) | DEFAULT 'draft' | draft / published |
| due_date | DATE | | |
| due_time | TIME | DEFAULT '23:59:00' | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `task_submissions`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| task_id | INTEGER | FK tasks | |
| student_id | INTEGER | FK students | |
| school_id | INTEGER | FK schools | |
| submitted_at | TIMESTAMPTZ | DEFAULT NOW() | |
| submission_text | TEXT | | Written answer |
| file_url | VARCHAR(1000) | | Cloudinary URL |
| file_name | VARCHAR(255) | | Original filename |
| file_public_id | VARCHAR(255) | | Cloudinary ID (for deletion) |
| file_size_kb | INTEGER | | |
| score | NUMERIC(5,2) | | Out of task.max_marks |
| feedback | TEXT | | Teacher's comment |
| status | VARCHAR(20) | DEFAULT 'pending' | pending / reviewed / resubmission_requested |
| resubmission_requested | BOOLEAN | DEFAULT FALSE | |
| reviewed_at | TIMESTAMPTZ | | |
| reviewed_by | INTEGER | FK teachers | |
| | | UNIQUE(task_id, student_id) | One submission per student per task |

---

#### `task_reminders`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| task_id | INTEGER | FK tasks | |
| school_id | INTEGER | FK schools | |
| sent_by | INTEGER | FK teachers | |
| sent_at | TIMESTAMPTZ | DEFAULT NOW() | |
| target_type | VARCHAR(20) | DEFAULT 'all' | all / selected |
| student_count | INTEGER | DEFAULT 0 | |
| student_ids | JSONB | DEFAULT '[]' | Array of student IDs |

---

### DOUBTS & Q&A

#### `doubts`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| class_id | INTEGER | FK classes | |
| student_id | INTEGER | FK students | |
| subject | VARCHAR(100) | | |
| question | TEXT | NOT NULL | |
| task_id | INTEGER | FK tasks | Optional: doubt about a task |
| ai_answer | TEXT | | AI-generated initial answer |
| teacher_answer | TEXT | | Deprecated — use messages |
| answered_by | INTEGER | FK teachers | |
| answered_at | TIMESTAMPTZ | | |
| status | VARCHAR(20) | DEFAULT 'open' | open / in_progress / resolved |
| last_message_at | TIMESTAMPTZ | | |
| resolved_at | TIMESTAMPTZ | | |
| resolved_by | INTEGER | FK teachers | |
| closed_by_teacher | BOOLEAN | DEFAULT FALSE | |
| is_class_faq | BOOLEAN | DEFAULT FALSE | Shared with the whole class |
| faq_set_by | INTEGER | FK teachers | |
| upvote_count | INTEGER | DEFAULT 0 | Peer voting count |
| message_count | INTEGER | DEFAULT 0 | Chat messages count |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `doubt_messages`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| doubt_id | INTEGER | FK doubts | |
| school_id | INTEGER | | |
| sender_type | VARCHAR(10) | | student / teacher |
| sender_id | INTEGER | | teacher_id or student_id |
| sender_name | VARCHAR(100) | | Denormalized for display |
| message | TEXT | NOT NULL | |
| is_final_answer | BOOLEAN | DEFAULT FALSE | Marks the solution message |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `doubt_upvotes`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| doubt_id | INTEGER | FK doubts | |
| student_id | INTEGER | FK students | |
| school_id | INTEGER | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(doubt_id, student_id) | One upvote per student per doubt |

---

### EXAMS & MARKS

#### `exam_records`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| class_id | INTEGER | FK classes | |
| created_by | INTEGER | FK teachers | |
| exam_name | VARCHAR(200) | NOT NULL | "Unit Test 1", "Mid Term" |
| exam_type | VARCHAR(50) | DEFAULT 'unit_test' | unit_test / mid_term / final / practical |
| exam_date | DATE | | |
| passing_pct | INTEGER | DEFAULT 35 | Percentage needed to pass |
| status | VARCHAR(20) | DEFAULT 'draft' | draft / collecting / published |
| published_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `exam_subjects`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| exam_id | INTEGER | FK exam_records | |
| school_id | INTEGER | | |
| subject_name | VARCHAR(100) | NOT NULL | |
| teacher_id | INTEGER | FK teachers | Teacher entering marks |
| teacher_name | VARCHAR(100) | | Denormalized |
| max_marks | INTEGER | DEFAULT 100 | |
| status | VARCHAR(20) | DEFAULT 'pending' | pending / submitted |
| submitted_at | TIMESTAMPTZ | | Marks locked after submit |
| submitted_by | INTEGER | FK teachers | |
| | | UNIQUE(exam_id, subject_name) | |

---

#### `exam_marks`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| exam_id | INTEGER | FK exam_records | |
| school_id | INTEGER | | |
| student_id | INTEGER | FK students | |
| subject_name | VARCHAR(100) | | |
| marks_obtained | NUMERIC(5,2) | | |
| is_absent | BOOLEAN | DEFAULT FALSE | |
| entered_by | INTEGER | FK teachers | |
| entered_at | TIMESTAMPTZ | | |
| | | UNIQUE(exam_id, student_id, subject_name) | |

---

#### `parent_mark_acks` (Parent acknowledgement of marks)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| exam_id | INTEGER | FK exam_records | |
| student_id | INTEGER | FK students | |
| school_id | INTEGER | | |
| parent_name | VARCHAR(100) | | |
| parent_phone | VARCHAR(20) | | |
| acknowledged_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(exam_id, student_id) | |

---

### SYLLABUS & CURRICULUM

#### `syllabus_topics`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| class_id | INTEGER | FK classes | |
| subject | VARCHAR(100) | NOT NULL | |
| chapter_name | VARCHAR(200) | | |
| chapter_order | INTEGER | DEFAULT 0 | Display order |
| topic_name | VARCHAR(200) | | |
| topic_order | INTEGER | DEFAULT 0 | Within chapter |
| status | VARCHAR(20) | DEFAULT 'pending' | pending / covered |
| covered_date | DATE | | |
| covered_by | INTEGER | FK teachers | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `curriculum_assignments` (Which curriculum a school uses per grade)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| grade | VARCHAR(20) | | |
| curriculum_type | VARCHAR(20) | | CBSE / APSSC |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(school_id, grade) | |

---

#### `school_subject_templates` (Default subjects for a grade range)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| name | VARCHAR(100) | | "Primary (1-5)", "Secondary (6-10)" |
| from_grade | INTEGER | DEFAULT 1 | |
| to_grade | INTEGER | DEFAULT 12 | |
| subjects | JSONB | | Array of subject name strings |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

### FEE MANAGEMENT

#### `fee_categories`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| name | VARCHAR(100) | NOT NULL | "Tuition Fee", "Exam Fee", "Transport" |
| description | TEXT | | |
| frequency | VARCHAR(20) | | monthly / quarterly / annual / one_time |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(school_id, name) | |

---

#### `fee_structures` (Amount per grade per category per year)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| fee_category_id | INTEGER | FK fee_categories | |
| grade | VARCHAR(20) | | |
| amount | NUMERIC(10,2) | NOT NULL | |
| due_day | INTEGER | DEFAULT 10 | Day of month payment is due |
| academic_year | VARCHAR(10) | | "2025-26" |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(school_id, fee_category_id, grade, academic_year) | |

---

#### `student_fee_ledger`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| student_id | INTEGER | FK students | |
| fee_category_id | INTEGER | FK fee_categories | |
| fee_structure_id | INTEGER | FK fee_structures | |
| academic_year | VARCHAR(10) | | "2025-26" |
| period_label | VARCHAR(50) | | "April 2025", "Q1 2025" |
| amount_due | NUMERIC(10,2) | | |
| amount_paid | NUMERIC(10,2) | DEFAULT 0 | |
| due_date | DATE | | |
| status | VARCHAR(20) | | pending / paid / partial / overdue / waived |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `fee_payments`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| student_id | INTEGER | FK students | |
| ledger_id | INTEGER | FK student_fee_ledger | |
| amount | NUMERIC(10,2) | NOT NULL | |
| payment_mode | VARCHAR(20) | | cash / cheque / dd / online / upi |
| payment_status | VARCHAR(20) | | completed / pending_verification |
| receipt_number | VARCHAR(50) | UNIQUE | |
| transaction_ref | VARCHAR(200) | | Cheque/UTR/UPI reference |
| paid_date | DATE | DEFAULT CURRENT_DATE | |
| collected_by_name | VARCHAR(100) | | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `fee_waivers`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| student_id | INTEGER | FK students | |
| ledger_id | INTEGER | FK student_fee_ledger | |
| waiver_type | VARCHAR(30) | | percentage / fixed_amount / full |
| waiver_value | NUMERIC(10,2) | | % or amount |
| waiver_amount | NUMERIC(10,2) | | Calculated amount waived |
| reason | TEXT | | "Merit Scholarship", "EWS" |
| granted_by_name | VARCHAR(100) | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

### ANNOUNCEMENTS & NOTIFICATIONS

#### `announcements`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| created_by | INTEGER | FK users | School admin user |
| title | VARCHAR(255) | NOT NULL | |
| content | TEXT | | |
| announcement_type | VARCHAR(50) | DEFAULT 'general' | general / urgent / event |
| target_audience | VARCHAR(100) | DEFAULT 'all' | all / teachers / students / parents / comma-separated |
| priority | VARCHAR(20) | DEFAULT 'normal' | normal / high / urgent |
| expires_at | DATE | | After this date, stops showing |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Audience matching logic (SQL):**
```sql
WHERE target_audience = 'all'
   OR target_audience = $audience
   OR target_audience LIKE $audience || ',%'
   OR target_audience LIKE '%,' || $audience
   OR target_audience LIKE '%,' || $audience || ',%'
```

---

#### `notifications`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| recipient_teacher_id | INTEGER | FK teachers | NULL if for student/school |
| recipient_student_id | INTEGER | FK students | NULL if for teacher/school |
| recipient_school_id | INTEGER | FK schools | School-wide broadcast |
| sender_teacher_id | INTEGER | FK teachers | NULL = system generated |
| type | VARCHAR(50) | | timetable / task / exam / announce / leave |
| title | VARCHAR(200) | | |
| message | TEXT | | |
| data | JSONB | | Context (task_id, exam_id, etc.) |
| is_read | BOOLEAN | DEFAULT FALSE | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

### ACADEMIC CALENDAR & YEARS

#### `school_calendar`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| title | VARCHAR(200) | NOT NULL | |
| event_date | DATE | NOT NULL | |
| end_date | DATE | | For multi-day events |
| event_type | VARCHAR(30) | | holiday / event / meeting |
| color | VARCHAR(20) | DEFAULT 'blue' | blue / red / green / yellow |
| description | TEXT | | |
| all_day | BOOLEAN | DEFAULT TRUE | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `academic_years`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| label | VARCHAR(20) | NOT NULL | "2024-25" |
| start_date | DATE | | |
| end_date | DATE | | |
| is_current | BOOLEAN | DEFAULT FALSE | Active academic year |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(school_id, label) | |

---

#### `student_class_history` (Audit trail of promotions)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| student_id | INTEGER | FK students | |
| school_id | INTEGER | | |
| academic_year_id | INTEGER | FK academic_years | |
| grade | VARCHAR(20) | | Grade during that year |
| section | VARCHAR(10) | | |
| promoted_to_grade | VARCHAR(20) | | NULL if graduated |
| promoted_at | TIMESTAMPTZ | | When rollover was run |
| | | UNIQUE(student_id, academic_year_id) | |

---

### DAILY NEWSPAPER & LEARNING

#### `daily_newspapers`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| date | DATE | NOT NULL | |
| title | VARCHAR(255) | | |
| subtitle | VARCHAR(255) | | |
| content | TEXT | | Full article |
| fun_fact | TEXT | | |
| quiz_question | TEXT | | |
| quiz_answer | TEXT | | |
| topic | VARCHAR(100) | | History / Science / Math / Geography |
| category | VARCHAR(50) | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(school_id, date) | One article per school per day |

---

#### `student_newspaper_reads`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| student_id | INTEGER | FK students | |
| newspaper_id | INTEGER | FK daily_newspapers | |
| school_id | INTEGER | | |
| completed_at | TIMESTAMPTZ | DEFAULT NOW() | |
| points_awarded | INTEGER | DEFAULT 0 | |
| | | UNIQUE(student_id, newspaper_id) | |

---

#### `weekly_tests` (AI-generated MCQ tests)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| class_id | INTEGER | FK classes | |
| student_id | INTEGER | FK students | |
| week_start | DATE | | Monday of that week |
| questions | JSONB | | Array of `{ q, options, answer }` |
| student_answers | JSONB | | Array of selected answers |
| score | INTEGER | | |
| max_score | INTEGER | | |
| status | VARCHAR(20) | DEFAULT 'available' | available / submitted |
| generated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| submitted_at | TIMESTAMPTZ | | |
| | | UNIQUE(student_id, week_start) | |

---

### STUDENT REWARDS & GAMIFICATION

#### `student_points` (Point transaction log)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| student_id | INTEGER | FK students | |
| school_id | INTEGER | | |
| action_type | VARCHAR(50) | | task_submitted / doubt_resolved / newspaper_read / quiz_correct / streak_7 etc. |
| points | INTEGER | DEFAULT 0 | |
| reference_id | INTEGER | | task_id / doubt_id / newspaper_id |
| reference_type | VARCHAR(50) | | task / doubt / newspaper |
| earned_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Point values:** task_submitted=5, task_scored_high(≥80%)=10, doubt_resolved=5, newspaper_read=1, quiz_correct=2, quiz_wrong=-1, streak_7days=20, streak_30days=50

---

#### `student_badges`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| student_id | INTEGER | FK students | |
| school_id | INTEGER | | |
| badge_type | VARCHAR(50) | | See badge types below |
| earned_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(student_id, badge_type) | One of each badge per student |

**Badge types:**
| Badge | Trigger |
|---|---|
| first_task | First task submitted |
| task_10 | 10 tasks submitted |
| task_50 | 50 tasks submitted |
| high_scorer | Scored ≥90% on a task |
| doubt_solver | 5 doubts resolved |
| streak_7 | 7-day activity streak |
| streak_30 | 30-day activity streak |
| reader_5 | Read 5 newspapers |
| reader_20 | Read 20 newspapers |
| points_100 | Earned 100 total points |
| points_500 | Earned 500 total points |

---

#### `student_streaks`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| student_id | INTEGER | FK students, PK | One row per student |
| school_id | INTEGER | | |
| current_streak | INTEGER | DEFAULT 0 | Days with any activity |
| longest_streak | INTEGER | DEFAULT 0 | All-time best |
| last_activity_date | DATE | | Date of most recent activity |

---

### REPORT CARDS

#### `report_card_config`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools, UNIQUE | One per school |
| show_attendance | BOOLEAN | DEFAULT TRUE | |
| show_rank | BOOLEAN | DEFAULT TRUE | |
| show_remarks | BOOLEAN | DEFAULT TRUE | |
| show_grade_points | BOOLEAN | DEFAULT TRUE | |
| grading_scheme | JSONB | | e.g. `[{"label":"A+","min":90},...]` |
| header_text | TEXT | DEFAULT 'Progress Report' | |
| footer_text | TEXT | | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `report_card_remarks`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| student_id | INTEGER | FK students | |
| exam_id | INTEGER | FK exam_records | |
| class_teacher_remark | TEXT | | |
| conduct | VARCHAR(30) | | Excellent / Good / Satisfactory / Needs Improvement |
| attendance_remark | TEXT | | |
| next_term_advice | TEXT | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(student_id, exam_id) | |

---

### STUDENT ACTIVITY TRACKING

#### `student_portal_sessions`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| student_id | INTEGER | FK students | |
| school_id | INTEGER | | |
| started_at | TIMESTAMPTZ | DEFAULT NOW() | |
| ended_at | TIMESTAMPTZ | | |
| duration_minutes | INTEGER | | |

---

#### `student_portal_activity`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| student_id | INTEGER | FK students | |
| school_id | INTEGER | | |
| session_id | INTEGER | FK student_portal_sessions | |
| action_type | VARCHAR(50) | | page_view / task_view / task_submit / doubt_ask / newspaper_read etc. |
| action_detail | VARCHAR(200) | | "Math Task 1", "Science Doubt #12" |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

### DISPLAY / KIOSK

#### `display_tokens`
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| school_id | INTEGER | FK schools | |
| token | VARCHAR(64) | UNIQUE | 64-char hex string |
| label | VARCHAR(100) | | "Main Lobby", "Library Screen" |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| last_used_at | TIMESTAMPTZ | | |

---

### PLATFORM ADMINISTRATION

#### `platform_audit_log` (Immutable action trail)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| actor_id | INTEGER | FK users | Platform admin |
| actor_email | VARCHAR(200) | | |
| action | VARCHAR(50) | | create_school / update_subscription / delete_school / reset_password |
| entity_type | VARCHAR(50) | | school / subscription / user |
| entity_id | INTEGER | | |
| entity_name | VARCHAR(200) | | School name, email, etc. |
| details | JSONB | | Before/after snapshot |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `plan_features` (Feature enablement per subscription tier)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | |
| feature_key | VARCHAR(50) | | overview / attendance / timetable / fees etc. |
| tier | VARCHAR(20) | | basic / standard / premium |
| enabled | BOOLEAN | DEFAULT TRUE | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(feature_key, tier) | |

**All feature keys (35+):** overview, briefing, attendance, leave-requests, emergency-cover, staff, students, class-management, timetable, exam-schedule, class-analytics, academic-analytics, analysis, announcements, notifications, leaderboard, calendar, export, settings, fee-management, parent-engagement, year-rollover, year-review, curriculum, weekly-test, rewards, doubts, syllabus, report-cards, display, notifications-center

---

## Key Relationships Summary

```
schools          (1) ─── (1) school_subscriptions
schools          (1) ─── (∞) users
schools          (1) ─── (∞) teachers
schools          (1) ─── (∞) students
schools          (1) ─── (∞) classes
schools          (1) ─── (1) school_schedule_settings
schools          (1) ─── (∞) academic_years
schools          (1) ─── (∞) announcements
schools          (1) ─── (∞) school_calendar
schools          (1) ─── (∞) display_tokens

classes          (1) ─── (∞) class_subjects
classes          (1) ─── (∞) class_timetable
classes          (1) ─── (1) class_timetable_modes
classes          (1) ─── (∞) attendance
classes          (1) ─── (∞) tasks
classes          (1) ─── (∞) exam_records
classes          (1) ─── (∞) doubts
classes          (1) ─── (∞) syllabus_topics
classes          (1) ─── (∞) weekly_tests

teachers         (1) ─── (∞) timetable (personal view)
teachers         (1) ─── (∞) leave_requests
teachers         (1) ─── (∞) teacher_unavailability
teachers         (1) ─── (∞) tasks (created_by)
teachers         (1) ─── (∞) exam_subjects

students         (1) ─── (∞) attendance
students         (1) ─── (∞) task_submissions
students         (1) ─── (∞) doubts
students         (1) ─── (∞) exam_marks
students         (1) ─── (∞) student_fee_ledger
students         (1) ─── (∞) student_points
students         (1) ─── (∞) student_badges
students         (1) ─── (1) student_streaks
students         (1) ─── (∞) weekly_tests
students         (∞) ─── (∞) parents  [via student_parents]

leave_requests   (1) ─── (∞) substitute_assignments
fee_categories   (1) ─── (∞) fee_structures
fee_structures   (1) ─── (∞) student_fee_ledger
student_fee_ledger (1) ─── (∞) fee_payments
student_fee_ledger (1) ─── (∞) fee_waivers
exam_records     (1) ─── (∞) exam_subjects
exam_records     (1) ─── (∞) exam_marks
exam_records     (1) ─── (∞) report_card_remarks
doubts           (1) ─── (∞) doubt_messages
doubts           (1) ─── (∞) doubt_upvotes
daily_newspapers (1) ─── (∞) student_newspaper_reads
academic_years   (1) ─── (∞) student_class_history
```
