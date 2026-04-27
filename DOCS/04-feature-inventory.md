# WLYL Platform — Feature Inventory

> Last updated: 2026-04-16  
> Status legend: ✅ Built & working | ⚠️ Partial (exists but incomplete) | ❌ Not built (planned) | 🔜 Coming soon (explicitly flagged)

---

## Summary

| Portal | Built | Partial | Not Built |
|---|---|---|---|
| School Admin | 22 | 3 | 4 |
| Teacher | 12 | 1 | 0 |
| Student | 8 | 1 | 0 |
| Parent | 5 | 2 | 0 |
| Platform Admin | 7 | 0 | 0 |
| Display / Kiosk | 2 | 0 | 0 |
| Auth | 3 | 2 | 0 |

---

## 1. School Admin Portal

### OVERVIEW

| Feature | Status | Details |
|---|---|---|
| Overview Dashboard | ✅ Built | Stats cards (teachers, students, classes), pending leaves, timetable conflicts, uncovered periods, attendance summary, upcoming exams, fee collection %. Uses batched `/api/admin/overview` |
| Daily Briefing | ✅ Built | Morning briefing: uncovered periods today, teachers on leave, emergency cover needs. Loaded from `/api/admin/briefing` |

---

### PEOPLE

| Feature | Status | Details |
|---|---|---|
| Staff Directory | ✅ Built | Full teacher list with search, filter by department/staff type, soft-delete (removes from active without deleting records) |
| Staff Onboarding | ✅ Built | Add teachers individually or bulk import via CSV. Auto-generates employee_id and temp password |
| Student Directory | ✅ Built | Full student list with search, filter by grade/section, promote students |
| Student Onboarding | ✅ Built | Add students individually or bulk import via CSV. Auto-generates roll number |
| Class Management | ✅ Built | Create classes (grade + section), assign class teacher, add subjects with teacher assignment, view students per class, sync classes from student data |

---

### SCHEDULING

| Feature | Status | Details |
|---|---|---|
| Timetable Management | ✅ Built | Generate timetable for one class or all classes, view conflicts, swap periods, lock/publish. Master/slave sync mode. Version control (draft → published). Teacher unavailability constraints. Schedule templates (save/restore). Notifies teachers + students on circulate |
| Attendance Dashboard | ✅ Built | School-wide view of all classes' attendance status per day. Mark attendance per class per session (morning/afternoon). Offline support via service worker. View who marked, counts, missing classes |
| Leave Requests | ✅ Built | List all pending/approved/rejected teacher leaves. Approve or reject with one click. Shows substitute coverage status |
| Emergency Cover | ✅ Built | View uncovered periods from approved leaves. Assign substitute teachers to specific periods. Shows substitute teacher availability |
| Exam Schedule | ✅ Built | Create exams (unit test, mid term, final, practical). Add subjects with teacher assignments. Track marks entry status per subject. Publish marks (freezes entry, notifies parents). View upcoming exams calendar |

---

### ANALYTICS

| Feature | Status | Details |
|---|---|---|
| Class Analytics | ✅ Built | Per-class performance: average marks, attendance %, task submission rate, top students |
| Academic Analytics | ✅ Built | School-wide academic trends: overall pass rate, subject performance comparison, top performers |
| Student-Teacher Analysis | ✅ Built | Cross-analysis of student performance relative to teacher assignments |
| Year-in-Review Report | ✅ Built | Full-year report: total attendance, pass rate, fee collection, top students, subject performance |
| School Health Score | ❌ Not built | Defined in `lib/features.ts` as `school-health` but no component or API implemented |
| Syllabus Predictor | ❌ Not built | Defined in `lib/features.ts` as `syllabus-predictor` but no component or API implemented |

---

### COMMUNICATION

| Feature | Status | Details |
|---|---|---|
| Announcement Board | ✅ Built | Create announcements with audience targeting (everyone / teachers only / students only / parents only / any combination). Set priority (normal/high/urgent), expiry date. Filter/view by audience. TV Mode section with gradient display |
| Notification Center | ✅ Built | Full notification history for the school. View all notifications sent (timetable changes, task reminders, exam publishes) |
| Student Leaderboard | ✅ Built | Points-based ranking with filter by month or all-time. Shows badges earned, current streak. Gamification overview |
| Parent Engagement | ✅ Built | Metrics on parent portal usage: logins, features accessed, child progress viewed |
| Anonymous Class Pulse | ❌ Not built | Defined in `lib/features.ts` as `class-pulse` but no component implemented |

---

### MANAGEMENT

| Feature | Status | Details |
|---|---|---|
| Fee Management | ✅ Built | Set fee categories (tuition, exam, transport) and structures by grade per academic year. Generate ledger entries. Track payments (cash/cheque/DD/online/UPI). Grant waivers (%, fixed, full). View collection stats and overdue count |
| Parent Engagement Tracking | ✅ Built | See which parents accessed what, when, and how often |
| Year Rollover | ✅ Built | Preview promotion plan, execute rollover (promote students one grade up), archive year history, set new academic year as current |

---

### TOOLS

| Feature | Status | Details |
|---|---|---|
| Academic Calendar | ✅ Built | Add holidays, events, meetings. Color-coded. Multi-day event support. View monthly/list |
| Export & Reports | ✅ Built | Export marks to PDF. Export attendance to PDF. Select date range and class |
| School Settings | ✅ Built | Edit school profile (name, contact, logo), configure schedule (periods per day, break times), set grading scheme, manage subject templates per grade range |
| Report Cards | ⚠️ Partial | DB tables exist (`report_card_config`, `report_card_remarks`). API partially built. No school-admin UI component for generating/printing report cards |
| Command Bar | ✅ Built | Keyboard-accessible command palette (`Cmd+K`) for quick navigation between modules |
| Subject Templates | ⚠️ Partial | API (`/api/schools/subject-templates`) and DB table built. UI within SchoolSettings is partial — can save templates but auto-apply on class creation not fully wired |

---

## 2. Teacher Portal

### MAIN

| Feature | Status | Details |
|---|---|---|
| Smart Snapshot | ✅ Built | Dashboard: today's period-wise schedule, tasks with pending submissions, open doubts, upcoming exams, school announcements (filtered to teachers) |

---

### MY CLASSES

| Feature | Status | Details |
|---|---|---|
| My Classes | ✅ Built | List of assigned classes with grade, section, student count, class teacher status |
| My Students | ✅ Built | All students across all assigned classes. Sortable, searchable |
| Class View | ✅ Built | Drill into a class: student list, attendance summary, tasks, doubts, marks overview |
| Timetable | ✅ Built | Personal full weekly schedule with times, rooms, subjects, grades |
| Attendance Marking | ✅ Built | Mark attendance per class, per session (morning/afternoon). Works offline (service worker). View previous attendance. Auto-saves to DB |

---

### TASKS & LEARNING

| Feature | Status | Details |
|---|---|---|
| Tasks | ✅ Built | Create tasks (homework/practice/test), set due date, publish to class. View all submissions. Grade individual submissions with score + feedback. Request resubmission. Send reminders to non-submitters |
| Doubt Center | ✅ Built | View all open doubts from assigned classes. Live chat with students. Mark as resolved. Toggle as class FAQ (shared with all students). View AI-generated initial answers |
| Syllabus Tracker | ✅ Built | View chapter/topic list per subject per class. Mark topics as covered with date |
| Test Calendar | ✅ Built | View upcoming tests/exams in calendar format |
| Performance Analytics | 🔜 Coming soon | Navigation item exists but flagged `comingSoon: true`. No component loaded |

---

### MY ACCOUNT

| Feature | Status | Details |
|---|---|---|
| My Profile | ✅ Built | View and edit profile (name, email, phone, qualification). Change password |
| Leave Request | ✅ Built | Submit leave requests (casual/sick/earned). View approval status. See approved leaves history |

---

## 3. Student Portal

### HOME

| Feature | Status | Details |
|---|---|---|
| Dashboard | ✅ Built | Summary of published tasks, recent exam marks, open doubts, school announcements (filtered to students). Quick navigation to all modules |
| My Timetable | ✅ Built | Class weekly schedule with period times, subjects, teachers, rooms |

---

### LEARNING

| Feature | Status | Details |
|---|---|---|
| My Tasks | ✅ Built | View assigned tasks. Submit text answers or upload files (via Cloudinary). View score and teacher feedback. Request re-check if resubmission requested |
| Syllabus | ✅ Built | View chapter and topic coverage progress per subject. See which topics teacher has marked as covered |
| My Doubts | ✅ Built | Ask a doubt (link to task optionally). Live chat with teacher. View peer FAQs (anonymised). Upvote relevant doubts |
| Daily Knowledge | ✅ Built | Read today's AI-curated article. Answer quiz question. Earn points for reading (+1) and correct quiz answer (+2). Wrong answer (-1) |

---

### ACADEMIC

| Feature | Status | Details |
|---|---|---|
| My Marks | ✅ Built | View exam marks per exam per subject. Pass/fail status. Comparison view across exams |
| Test Calendar | ✅ Built | View upcoming tests/exams |
| Rewards | ✅ Built | Total points, current/longest streak, earned badges with dates |
| Weekly Test | ⚠️ Partial | DB table (`weekly_tests`) and schema designed for AI-generated MCQ tests. Not yet surfaced in student portal UI |

---

### ACCOUNT

| Feature | Status | Details |
|---|---|---|
| Profile | ✅ Built | View student info (name, grade, section, roll number). Change password |

---

## 4. Parent Portal

| Feature | Status | Details |
|---|---|---|
| Child Summary | ✅ Built | Overview card: attendance %, recent exam marks, pending tasks count, school announcements. Fetched in parallel via `Promise.all` |
| Attendance Calendar | ✅ Built | Month-view attendance calendar for the child. Shows present/absent/late per day |
| Fee Ledger | ✅ Built | View outstanding fees, payment history, waiver details. Shows amount due vs paid per category |
| Learning Activity | ✅ Built | Child's recent portal activity: tasks submitted, doubts asked, newspapers read, rewards earned |
| Timetable View | ✅ Built | Child's class timetable (read only) |
| Parent Login | ⚠️ Partial | Lookup by parent phone + child roll number works. No proper JWT session for parents — portal accessed via lookup flow, not persistent login |
| Mark Acknowledgement | ⚠️ Partial | API (`POST /api/exams/[id]/acknowledge`) and DB table (`parent_mark_acks`) exist. Not prominently surfaced in parent portal UI |

---

## 5. Platform Admin Portal

| Feature | Status | Details |
|---|---|---|
| School Directory | ✅ Built | List all schools (active/inactive/deleted). Search by name, city, code. Filter by subscription tier |
| Create School | ✅ Built | Create new school with full details. Auto-generates school_code and temp admin password. Sends onboarding email with credentials |
| Subscription Management | ✅ Built | Set tier (none/basic/standard/premium), plan dates, billing amount per school. Logged in audit trail |
| Platform Statistics | ✅ Built | Total schools, teachers, students, subscription tier breakdown |
| Audit Log | ✅ Built | Immutable log of all platform admin actions: create school, update subscription, delete school, reset password. With actor, entity, before/after snapshot |
| Feature Configuration | ✅ Built | Enable/disable each feature per subscription tier. Changes reflect instantly for all schools on that tier |
| School Admin Password Reset | ✅ Built | Platform admin can reset any school's admin password. Sends email with new temp password |

---

## 6. Display / Kiosk Mode

| Feature | Status | Details |
|---|---|---|
| TV Display | ✅ Built | Fullscreen kiosk mode at `/display`. Shows timetable summary, active announcements, attendance summary. Auto-refreshes |
| Display Tokens | ✅ Built | Generate named tokens (e.g., "Main Lobby", "Library"). Token-based access — no login required. Track last used time |

---

## 7. Authentication & Access

| Feature | Status | Details |
|---|---|---|
| School Admin Auth | ✅ Built | Login via school_code + password. JWT cookie (7d). First-login force password change. Profile setup flow. Forgot/reset password via email |
| Platform Admin Auth | ✅ Built | Login via email + password. Same JWT flow. Initial setup route (`/api/auth/setup-admin`) for first-time setup |
| Teacher Auth | ✅ Built | Login via employee_id + password. Separate JWT cookie (`wlyl_teacher_auth`). First-login flag. Password change flow |
| Student Auth | ⚠️ Partial | Password hash stored in DB. Change-password API exists. But student portal currently uses dropdown selection (demo mode) not a proper login form |
| Parent Auth | ⚠️ Partial | Lookup by parent phone + child roll number. No JWT session for parents — each visit requires re-looking up. No persistent parent login |

---

## Features Defined but Not Yet Built

These exist in `lib/features.ts` (and therefore appear in the platform admin feature matrix) but have no implemented component or API:

| Feature Key | Label | Category | Notes |
|---|---|---|---|
| `school-health` | School Health Score | Analytics | Composite score of attendance, marks, task completion, fee collection |
| `syllabus-predictor` | Syllabus Predictor | Analytics | AI prediction of syllabus completion date based on current pace |
| `class-pulse` | Anonymous Class Pulse | Communication | Anonymous student feedback on class experience |
| `report-cards` | Report Cards | Academic | Print/download formatted report cards per student per exam — config and remarks tables exist, no UI |

---

## Feature to API Mapping

| Feature | Key API Endpoints |
|---|---|
| Overview Dashboard | `GET /api/admin/overview` (batched) |
| Daily Briefing | `GET /api/admin/briefing` |
| Attendance | `GET/POST /api/attendance`, `GET /api/attendance/analytics` |
| Leave Requests | `GET/POST/PUT /api/leave-requests` |
| Emergency Cover | `GET/POST /api/substitutes`, `GET /api/teacher-availability` |
| Timetable | `POST /api/class-timetable/generate`, `GET/POST /api/class-timetable`, `POST /api/class-timetable/swap`, `POST /api/class-timetable/circulate` |
| Exam Schedule | `GET/POST /api/exams`, `POST /api/exams/[id]/subjects`, `POST /api/exams/[id]/marks`, `POST /api/exams/[id]/publish` |
| Staff Management | `GET/POST /api/teachers`, `POST /api/teachers/bulk` |
| Student Management | `GET/POST /api/students`, `POST /api/students/bulk`, `POST /api/students/promote` |
| Class Management | `GET/POST /api/classes`, `GET/POST /api/classes/[id]/subjects`, `POST /api/classes/sync` |
| Fee Management | `GET/POST /api/fees/categories`, `/fees/structures`, `/fees/ledger`, `/fees/payments`, `/fees/waivers`, `/fees/stats` |
| Announcements | `GET/POST/PUT/DELETE /api/announcements` |
| Notifications | `GET/POST /api/notifications` |
| Year Rollover | `GET/POST /api/academic-years`, `POST /api/academic-years/rollover` |
| Tasks | `GET/POST/PUT/DELETE /api/tasks`, `GET/POST /api/tasks/[id]/submissions`, `PUT /api/tasks/[id]/submissions/[sid]` |
| Doubts | `GET/POST /api/doubts`, `GET/POST /api/doubts/[id]/messages`, `PUT /api/doubts/[id]` |
| Syllabus | `GET/POST /api/syllabus`, `PUT /api/syllabus/[id]`, `GET /api/syllabus/analytics` |
| Rewards | `GET /api/students/[id]/rewards`, `GET /api/leaderboard` |
| Daily Newspaper | `GET /api/newspapers/today`, `POST /api/newspapers/[id]/read` |
| Parent Portal | `GET /api/parent/child-summary`, `/parent/attendance`, `/parent/fees`, `/parent/activity`, `/parent/timetable` |
| School Settings | `PUT /api/schools/[id]`, `GET/PUT /api/school-schedule`, `GET/POST /api/schedule-templates` |
| Export | `POST /api/export/marks`, `POST /api/export/attendance` |
| Academic Calendar | `GET/POST /api/school-calendar`, `PUT/DELETE /api/school-calendar/[id]` |
| Display / Kiosk | `POST /api/display-token`, `GET /api/display-data` |
