# School Admin Portal

**Status:** 23 Built | 3 Partial | 4 Planned
**Last updated:** 2026-09-07

---

## Overview

The School Admin portal is the primary management interface at `/school-admin`. It covers staff/student management, scheduling, analytics, communication, fees, and school settings.

---

## Features

### Overview & Briefing

| Feature | Status | Description |
|---------|--------|-------------|
| Overview Dashboard | Built | Stats cards (teachers, students, classes), pending leaves, timetable conflicts, uncovered periods, attendance summary, upcoming exams, fee collection %. Uses batched `/api/admin/overview` |
| Daily Briefing | Built | Morning briefing: uncovered periods, teachers on leave, emergency cover needs. From `/api/admin/briefing` |

### People Management

| Feature | Status | Description |
|---------|--------|-------------|
| Staff Directory | Built | Full teacher list with search, filter by department/staff type, soft-delete |
| Staff Onboarding | Built | Add teachers individually or bulk CSV import. Auto-generates employee_id and temp password |
| Student Directory | Built | Full student list with search, filter by grade/section, promote students |
| Student Onboarding | Built | Add students individually or bulk CSV import. Auto-generates roll number |
| Class Management | Built | Create classes (grade + section), assign class teacher, add subjects with teacher assignment, sync classes from student data |

### Scheduling

| Feature | Status | Description |
|---------|--------|-------------|
| Timetable Management | Built | Generate, view conflicts, swap periods, lock/publish. Master/slave sync. Version control (draft → published). Teacher unavailability constraints. Schedule templates |
| Attendance Dashboard | Built | School-wide view per day. Mark per class per session. Offline support via service worker |
| Leave Requests | Built | List all pending/approved/rejected leaves. Approve/reject. Shows substitute coverage status |
| Emergency Cover | Built | View uncovered periods from approved leaves. Assign substitute teachers. Shows availability |
| Exam Schedule | Built | Create exams, add subjects, track marks entry status, publish marks, exam calendar |

### Analytics

| Feature | Status | Description |
|---------|--------|-------------|
| Class Analytics | Built | Per-class: average marks, attendance %, task submission rate, top students |
| Academic Analytics | Built | School-wide: pass rate, subject performance comparison, top performers |
| Student-Teacher Analysis | Built | Student performance relative to teacher assignments |
| Year-in-Review Report | Built | Full-year: attendance, pass rate, fee collection, top students |
| School Health Score | Planned | Composite score of attendance, marks, tasks, fees. Defined in `lib/features.ts` as `school-health` but not implemented |
| Syllabus Predictor | Planned | AI prediction of syllabus completion date. Defined in `lib/features.ts` as `syllabus-predictor` but not implemented |

### Communication

| Feature | Status | Description |
|---------|--------|-------------|
| Announcement Board | Built | Create with audience targeting, priority, expiry. TV Mode section |
| Notification Center | Built | Full notification history for the school |
| Student Leaderboard | Built | Points-based ranking with badges, streaks, gamification |
| Parent Engagement | Built | Metrics on parent portal usage |
| Feedback Management | Built | No-login QR-code feedback form (parent/student/teacher/visitor/other) with a school-admin dashboard, issue pipeline, category CRUD, and QR poster generation. `feedback-management` in `lib/features.ts`. See `wiki/features/feedback-management.md` |
| Anonymous Class Pulse | Planned | Anonymous student feedback. Defined in `lib/features.ts` as `class-pulse` but not implemented |

### Management

| Feature | Status | Description |
|---------|--------|-------------|
| Fee Management | Built | Fee categories, structures by grade, ledger, payments (cash/cheque/DD/online/UPI), waivers, collection stats |
| Year Rollover | Built | Preview promotion, execute rollover, archive history, set new academic year |

### Tools

| Feature | Status | Description |
|---------|--------|-------------|
| Academic Calendar | Built | Holidays, events, meetings. Color-coded, multi-day support |
| Export & Reports | Built | Export marks/attendance to PDF with date range and class filters |
| School Settings | Built | School profile, schedule config, grading scheme, subject templates |
| Report Cards | Partial | DB tables exist (`report_card_config`, `report_card_remarks`). API partially built. No UI |
| Command Bar | Built | `Cmd+K` command palette for quick navigation |
| Subject Templates | Partial | API and DB built. UI partial — can save templates but auto-apply not fully wired |

---

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/overview` | Batched dashboard stats |
| `GET /api/admin/briefing` | Daily briefing data |
| `GET/POST /api/teachers` | Staff CRUD |
| `GET/POST /api/students` | Student CRUD |
| `GET/POST /api/classes` | Class CRUD |
| `POST /api/class-timetable/generate` | Timetable generation |
| `POST /api/class-timetable/circulate` | Publish timetable |
| `GET/POST /api/attendance` | Attendance marking |
| `GET/POST/PUT /api/leave-requests` | Leave management |
| `GET/POST /api/substitutes` | Substitute assignments |
| `GET/POST /api/exams` | Exam CRUD |
| `GET/POST /api/announcements` | Announcement CRUD |
| `GET/POST /api/fees/*` | Fee management |
| `POST /api/academic-years/rollover` | Year rollover |
