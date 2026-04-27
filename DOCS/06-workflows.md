# WLYL Platform — Key Workflow Diagrams

> Last updated: 2026-04-16  
> This document covers the 8 most important end-to-end workflows in the platform.

---

## Workflow Index

1. [School Onboarding (Platform Admin)](#1-school-onboarding)
2. [Timetable Generation & Publishing](#2-timetable-generation--publishing)
3. [Attendance Marking (Morning/Afternoon)](#3-attendance-marking)
4. [Teacher Leave → Emergency Cover](#4-teacher-leave--emergency-cover)
5. [Announcement Targeting & Delivery](#5-announcement-targeting--delivery)
6. [Exam → Marks Entry → Parent Notification](#6-exam--marks-entry--parent-notification)
7. [Student Doubt Lifecycle](#7-student-doubt-lifecycle)
8. [Year Rollover](#8-year-rollover)

---

## 1. School Onboarding

**Who does it:** Platform Admin  
**Where:** `/platform-admin`

```
Platform Admin
    │
    ▼
Fill school form
  - Name, type, city, country
  - Contact phone, email, address
    │
    ▼
POST /api/schools
    │
    ├── DB: INSERT into schools
    ├── DB: INSERT into school_subscriptions (tier = 'none')
    ├── DB: INSERT into users (role = 'school_admin')
    ├── Generate school_code  ──→ "wlyl-schl-{slug}-{id}"
    ├── Generate temp_password (10 chars, no ambiguous letters)
    └── Hash password → store in users.password_hash
    │
    ▼
Send onboarding email
  - To: school contact email
  - Contains: school_code, temp_password, login URL
    │
    ▼
Platform Admin sets subscription tier
  POST /api/schools/[id]/subscription
  - tier: basic / standard / premium
  - plan_start_date, plan_end_date, plan_amount
    │
    ▼
Logged in platform_audit_log
  - action: create_school / update_subscription
  - actor: platform admin email
  - entity: school name
    │
    ▼
School Admin receives email
    │
    ▼
School Admin logs in at /login
  - school_code + temp_password
    │
    ▼
Forced to /change-password (first_login = true)
    │
    ▼
Redirected to /profile-setup
    │
    ▼
School Admin is in → portal loads features
based on their subscription tier
```

---

## 2. Timetable Generation & Publishing

**Who does it:** School Admin  
**Where:** School Admin → Timetable Management

```
School Admin
    │
    ▼
Prerequisites (must exist first):
  1. Classes created (grade + section)
  2. Teachers added with subjects
  3. class_subjects set (subject → teacher, periods_per_week)
  4. Schedule settings configured (periods/day, break times)
    │
    ▼
Click "Generate Timetable"
  Select: one class OR all classes
  Option: force_replace = true/false
    │
    ▼
POST /api/class-timetable/generate
    │
    ├── Load class_subjects for the class
    │     (subject_name, teacher_id, periods_per_week)
    │
    ├── Load teacher_unavailability
    │     (blocked day/period combos per teacher)
    │
    ├── Load school_schedule_settings
    │     → buildScheduleFromSettings() → ScheduleSlot[]
    │     → 8 academic slots + 3 break slots per day
    │
    ├── GENERATION ALGORITHM:
    │   For each day (Mon–Sat):
    │     For each academic slot (P1–P8):
    │       Pick subject with most remaining periods needed
    │       (Prefer core subjects — Math/Science/English — before lunch)
    │       Check teacher is NOT blocked in this slot
    │       Assign: subject + teacher + auto room
    │       Decrement subject's remaining_periods counter
    │
    ├── DB: INSERT into class_timetable
    │     (class_id, day_of_week, period_number,
    │      subject_name, teacher_id, room, is_break, source='auto')
    │
    └── Sync to teacher view:
        POST /api/class-timetable/sync
        → copies rows to `timetable` table per teacher_id
    │
    ▼
School Admin reviews generated timetable
    │
    ├── Spot conflict? → POST /api/class-timetable/validate
    │     Returns: teacher overlaps, uncovered periods
    │
    ├── Swap periods? → POST /api/class-timetable/swap
    │     { slot_a: {day, period}, slot_b: {day, period} }
    │     Swaps subject+teacher in class_timetable
    │     Re-syncs to teacher timetable
    │
    └── Satisfied → Publish
    │
    ▼
POST /api/class-timetable/circulate
    │
    ├── Sets class_timetable.is_locked = true for all rows
    ├── Sets classes.timetable_circulated_at = NOW()
    └── notifyTimetableChange()
          → INSERT notifications for all teachers in class
          → INSERT notifications for all students in class
    │
    ▼
Teachers see notification in portal
Students see notification in portal
Both can view published timetable immediately
```

---

## 3. Attendance Marking

**Who does it:** Teacher (or School Admin)  
**Where:** Teacher portal → Attendance | School Admin → Attendance Dashboard

```
Teacher opens Attendance tab
    │
    ▼
Select class (if assigned multiple)
Select session: morning / afternoon
Date defaults to today
    │
    ▼
GET /api/attendance?class_id=X&date=YYYY-MM-DD&session=morning
    │
    ├── Returns existing records if already marked
    └── Returns student list with default status = 'present'
    │
    ▼
Teacher sees student list
  - Each student: toggle Present / Absent / Late
  - Bulk: "Mark all present" button
    │
    ▼
─────────── ONLINE PATH ───────────
    │
    ▼
POST /api/attendance
  {
    class_id, school_id, teacher_id,
    date, session,
    attendance: [{ student_id, status }]
  }
    │
    ├── DB: INSERT/UPDATE attendance rows
    │     UNIQUE(student_id, date, class_id, session)
    │     → ON CONFLICT UPDATE status
    └── Returns: saved count
    │
    ▼
─────── OFFLINE PATH (service worker) ───────
    │
    ▼
No network detected?
  → Data stored in IndexedDB (sw-attendance.js)
  → UI shows "Saved offline – will sync when connected"
    │
    ▼
Network restored?
  → Service worker flushes queue
  → POST /api/attendance for each queued batch
    │
    ▼
School Admin Overview shows:
  Attendance widget: "20/24 classes marked today"
  Unmarked classes highlighted in red
    │
    ▼
GET /api/attendance?school_id=X&date=today&view=school
  Returns per-class: marked/not marked, present/absent counts
```

---

## 4. Teacher Leave → Emergency Cover

**Who does it:** Teacher submits → School Admin approves → assigns cover  
**Where:** Teacher portal → Leave | School Admin → Leave Requests + Emergency Cover

```
STEP 1: Teacher requests leave
─────────────────────────────
Teacher
    │
    ▼
POST /api/leave-requests
  {
    teacher_id, school_id,
    leave_type: casual/sick/earned,
    start_date, end_date,
    reason
  }
    │
    ▼
DB: INSERT leave_requests (status = 'pending')
    │
    ▼
School Admin sees pending count on Overview Dashboard
  (from batched /api/admin/overview → leaves.pending)

────────────────────────────────────────
STEP 2: School Admin approves/rejects
────────────────────────────────────────
School Admin opens Leave Requests tab
    │
    ▼
GET /api/leave-requests?school_id=X&status=pending
    │
    ▼
Reviews request → Click Approve / Reject
    │
    ▼
PUT /api/leave-requests/[id]
  { status: 'approved' | 'rejected' }
    │
    ├── DB: UPDATE leave_requests.status
    └── DB: UPDATE reviewed_at = NOW()
    │
    ▼
Teacher sees updated status in their leave history

────────────────────────────────────────
STEP 3: Assign substitute cover
────────────────────────────────────────
School Admin opens Emergency Cover tab
    │
    ▼
GET /api/admin/overview → uncovered.periods
  Shows: which classes/periods have no teacher
  due to approved leaves
    │
    ▼
For each uncovered period:
  GET /api/teacher-availability
    ?teacher_id=X&school_id=Y
  → Returns: free slots (not in timetable AND not on leave)
    │
    ▼
School Admin selects available substitute teacher
    │
    ▼
POST /api/substitutes
  {
    school_id,
    leave_request_id,
    original_teacher_id,
    substitute_teacher_id,
    class_id, date, day_of_week,
    period_number, subject_name,
    time_from, time_to
  }
    │
    ├── DB: INSERT substitute_assignments
    │     UNIQUE(class_id, date, period_number)
    └── Substitute teacher sees updated timetable for the day
    │
    ▼
Daily Briefing shows covered vs uncovered status
  GET /api/admin/briefing → all_covered = true/false
```

---

## 5. Announcement Targeting & Delivery

**Who does it:** School Admin creates → auto-filters to correct portals  
**Where:** School Admin → Announcements

```
School Admin
    │
    ▼
Create announcement form:
  - Title, content
  - Type: general / urgent / event
  - Priority: normal / high / urgent
  - Expiry date (optional)
  - Audience selector (multi-select chips):
      🌐 Everyone  👨‍🏫 Teachers  🎓 Students  👨‍👩‍👧 Parents
    │
    ▼
Audience logic:
  Select "Everyone"    → clears others → target_audience = 'all'
  Select individuals   → removes "Everyone" → joined: "teachers,students"
  Select all 3 groups  → auto-normalise → target_audience = 'all'
    │
    ▼
POST /api/announcements
  {
    school_id, created_by,
    title, content, type,
    target_audience: "all" | "teachers" | "students" | "parents"
                   | "teachers,students" | "teachers,parents" | ...
    priority, expires_at
  }
    │
    ▼
DB: INSERT announcements

────────────────────────────────────────
DELIVERY: Each portal fetches filtered
────────────────────────────────────────

Teacher Portal (SmartSnapshot.tsx):
  GET /api/announcements?school_id=X&audience=teachers
  SQL WHERE:
    target_audience = 'all'
    OR target_audience = 'teachers'
    OR target_audience LIKE 'teachers,%'
    OR target_audience LIKE '%,teachers'
    OR target_audience LIKE '%,teachers,%'
  → Shows only announcements meant for teachers

Student Portal (StudentDashboard.tsx):
  GET /api/announcements?school_id=X&audience=students
  → Shows only announcements meant for students

Parent Portal (page.tsx):
  GET /api/announcements?school_id=X&audience=parents
  → Shows only announcements meant for parents

School Admin (AnnouncementBoard.tsx):
  GET /api/announcements?school_id=X (no audience filter)
  → Sees ALL announcements with audience labels
  Filter tabs: All / Teachers / Students / Parents
    │
    ▼
Expired announcements:
  expires_at < NOW() → excluded from all fetches
  (SQL: AND (expires_at IS NULL OR expires_at >= CURRENT_DATE))
```

---

## 6. Exam → Marks Entry → Parent Notification

**Who does it:** School Admin creates → Teachers enter marks → Admin publishes → Parents acknowledge  
**Where:** School Admin → Exam Schedule | Teacher portal → (marks entry inline)

```
STEP 1: Create exam
────────────────────
School Admin
    │
    ▼
POST /api/exams
  {
    school_id, class_id, created_by,
    exam_name: "Unit Test 1",
    exam_type: unit_test/mid_term/final/practical,
    exam_date, passing_pct: 35
  }
    │
    ▼
DB: INSERT exam_records (status = 'draft')

────────────────────────────────────────
STEP 2: Add subjects + assign teachers
────────────────────────────────────────
POST /api/exams/[id]/subjects
  { subject_name, teacher_id, max_marks: 100 }
    │
    ▼
DB: INSERT exam_subjects (status = 'pending')
  (one row per subject in the exam)

────────────────────────────────────────
STEP 3: Teachers enter marks
────────────────────────────────────────
Teacher (assigned to that subject)
    │
    ▼
GET /api/exams/[id]/marks
  Returns: all students in class + existing marks

Teacher enters marks for each student:
  { student_id, marks_obtained, is_absent }
    │
    ▼
POST /api/exams/[id]/marks
  {
    subject_name, entered_by,
    marks: [{ student_id, marks_obtained, is_absent }]
  }
    │
    ├── DB: INSERT/UPDATE exam_marks
    │     UNIQUE(exam_id, student_id, subject_name)
    └── DB: UPDATE exam_subjects.status = 'submitted'
             exam_subjects.submitted_at = NOW()
    │
    ▼
School Admin sees marks entry progress:
  Subject status: pending / submitted
  Can see which subjects still need marks

────────────────────────────────────────
STEP 4: School Admin publishes
────────────────────────────────────────
All subjects submitted?
    │
    ▼
POST /api/exams/[id]/publish
    │
    ├── DB: UPDATE exam_records.status = 'published'
    ├── DB: UPDATE exam_records.published_at = NOW()
    └── INSERT notifications for:
          → All students in class: "Your marks are out"
          → All parents linked to those students
    │
    ▼
Students see marks in their portal immediately
Parents see notification → open parent portal

────────────────────────────────────────
STEP 5: Parent acknowledges
────────────────────────────────────────
Parent views marks in parent portal
    │
    ▼
POST /api/exams/[id]/acknowledge
  { student_id, parent_name, parent_phone }
    │
    ▼
DB: INSERT parent_mark_acks
  UNIQUE(exam_id, student_id) → one ack per student per exam
    │
    ▼
School Admin can see acknowledgement status
  (which parents have/haven't acknowledged)
```

---

## 7. Student Doubt Lifecycle

**Who does it:** Student asks → Teacher answers → resolved  
**Where:** Student portal → My Doubts | Teacher portal → Doubt Center

```
STEP 1: Student asks doubt
────────────────────────────
Student
    │
    ▼
Select subject, type question
Optional: link to a task
    │
    ▼
POST /api/doubts
  {
    school_id, class_id, student_id,
    subject, question,
    task_id (optional)
  }
    │
    ├── DB: INSERT doubts (status = 'open')
    └── (Future: AI generates initial answer → doubts.ai_answer)
    │
    ▼
Student sees doubt in "My Doubts" list
Status: Open

────────────────────────────────────────
STEP 2: Teacher views and responds
────────────────────────────────────────
Teacher opens Doubt Center
    │
    ▼
GET /api/doubts?class_id=X&status=open
  → Shows all open doubts for assigned classes
    │
    ▼
Teacher clicks on a doubt
    │
    ▼
GET /api/doubts/[id]/messages
  → Full chat history

Teacher types response:
    │
    ▼
POST /api/doubts/[id]/messages
  {
    sender_type: 'teacher',
    sender_id, sender_name,
    message,
    is_final_answer: false/true
  }
    │
    ├── DB: INSERT doubt_messages
    ├── DB: UPDATE doubts.message_count++
    └── DB: UPDATE doubts.last_message_at = NOW()
    │
    ▼
Student sees new message notification
    │
    ▼
Back-and-forth chat continues...

────────────────────────────────────────
STEP 3: Marking as resolved / FAQ
────────────────────────────────────────
Teacher satisfied with answer:
    │
    ├── OPTION A: Mark as resolved
    │     PUT /api/doubts/[id]
    │       { status: 'resolved' }
    │     DB: UPDATE resolved_at, resolved_by
    │
    └── OPTION B: Make it class FAQ
          PUT /api/doubts/[id]
            { is_class_faq: true }
          DB: UPDATE doubts.is_class_faq = true
              doubts.faq_set_by = teacher_id
    │
    ▼
If FAQ:
  All students in class can now see this doubt
  GET /api/doubts/peers?class_id=X
  → Returns anonymised FAQ doubts
  → Student names hidden ("A student asked...")
    │
    ▼
PEER UPVOTING:
  Other students can upvote FAQs:
  POST /api/doubts/[id]/upvote
    { student_id }
  UNIQUE(doubt_id, student_id) → one upvote per student
  DB: UPDATE doubts.upvote_count++

────────────────────────────────────────
REWARDS earned during this flow:
────────────────────────────────────────
  When doubt is resolved:
    → Student earns +5 points (action: doubt_resolved)
    → Checked for badges: doubt_solver (5 doubts resolved)
```

---

## 8. Year Rollover

**Who does it:** School Admin  
**Where:** School Admin → Year Rollover

```
PREREQUISITE: Current academic year must exist and be active
  GET /api/academic-years?school_id=X
    │
    ▼
STEP 1: School Admin opens Year Rollover
    │
    ▼
Preview rollover plan:
  System calculates:
    Grade 1 → Grade 2
    Grade 2 → Grade 3
    ...
    Grade 11 → Grade 12
    Grade 12 → graduated (no promotion)

  Shows: student count per grade, destination grade
    │
    ▼
Review and confirm (no going back after this)
    │
    ▼
POST /api/academic-years/rollover
  { school_id, from_year_id, to_label: "2025-26" }
    │
    ▼
SERVER EXECUTES (in transaction):

  1. CREATE new academic year
     INSERT academic_years
       (school_id, label: "2025-26", is_current: true)
     UPDATE old academic_year: is_current = false

  2. ARCHIVE current student placements
     For each student:
       INSERT student_class_history
         (student_id, academic_year_id, grade, section,
          promoted_to_grade, promoted_at)

  3. PROMOTE students
     For each active student:
       If grade < 12:
         UPDATE students.grade = grade + 1
         students.section = same (or reassigned)
       If grade = 12:
         UPDATE students.status = 'graduated'
    │
    ▼
POST /api/students/promote (called internally)
  promotions: [{ student_id, new_grade, new_section }]
    │
    ▼
After rollover:
  - All students are in new grades
  - Previous year's grades are in student_class_history
  - Old timetables remain (admin must regenerate)
  - Old exams/marks remain (historical)
  - Attendance from old year remains (archived)
    │
    ▼
School Admin should then:
  1. Reassign class teachers (grades shifted)
  2. Update class subjects for new grade structure
  3. Regenerate timetables for all classes
  4. Set new fee structures for the new academic year
  5. Generate new fee ledger entries
```

---

## Quick Reference: Who Triggers What

| Action | Triggered by | API |
|---|---|---|
| School created | Platform Admin | `POST /api/schools` |
| Timetable generated | School Admin | `POST /api/class-timetable/generate` |
| Timetable published | School Admin | `POST /api/class-timetable/circulate` |
| Attendance marked | Teacher / School Admin | `POST /api/attendance` |
| Leave requested | Teacher | `POST /api/leave-requests` |
| Leave approved | School Admin | `PUT /api/leave-requests/[id]` |
| Substitute assigned | School Admin | `POST /api/substitutes` |
| Announcement created | School Admin | `POST /api/announcements` |
| Task created | Teacher | `POST /api/tasks` |
| Task submitted | Student | `POST /api/tasks/[id]/submissions` |
| Task graded | Teacher | `PUT /api/tasks/[id]/submissions/[sid]` |
| Exam created | School Admin / Teacher | `POST /api/exams` |
| Marks entered | Teacher | `POST /api/exams/[id]/marks` |
| Marks published | School Admin | `POST /api/exams/[id]/publish` |
| Doubt asked | Student | `POST /api/doubts` |
| Doubt answered | Teacher | `POST /api/doubts/[id]/messages` |
| Doubt made FAQ | Teacher | `PUT /api/doubts/[id]` |
| Year rollover | School Admin | `POST /api/academic-years/rollover` |
| Points awarded | System (automatic) | Internal `awardPoints()` |
