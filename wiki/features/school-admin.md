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
| Overview Dashboard | Built | Stats cards (teachers, students, classes), attendance summary, upcoming exams, fee collection %. Uses batched `/api/admin/overview` (pending-leaves and uncovered-periods metrics removed with Leave Requests/Emergency Cover below) |
| Daily Briefing | Built | Morning briefing: exams, chronic absentees, syllabus coverage, announcements. From `/api/admin/briefing` (leave/uncovered-periods alerts removed with Leave Requests/Emergency Cover below) |

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
| Timetable Management | Removed | Removed from `dev` (#176). The complete workflow lives on `feature/175-timetable-full-workflow` (draft PR #177). |
| Attendance Dashboard | Built | Day/Month/Year tabs. Day: school-wide per-class cards (morning+afternoon), class-detail drilldown, substitute coverage, offline queue via service worker. Month: attendance % calendar heatmap + sortable class-wise table. Year: month-over-month trend chart, best/worst month, best/worst classes. Insights tab: rolling 7/30/90-day trend + chronic-absentee list (3+ absences). All views green/amber/red color-coded (≥85% / 70-84% / <70%). Backed by `GET /api/attendance/analytics` (`view=month\|year`, defaults to rolling window) |
| Leave Requests | Removed | Pulled out of `dev` for rework — full code + removal notes on `feature/139-remove-leave-requests` (issue #139) |
| Emergency Cover | Removed | Pulled out of `dev` for rework — full code + removal notes on `feature/140-remove-emergency-cover` (issue #140) |
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
| Fee Management | Built | Fee categories, structures by grade, ledger, payments (cash/cheque/DD/online/UPI), waivers, collection stats, past-records archive. See `wiki/features/fee-management.md` |
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
| `GET/POST /api/attendance` | Attendance marking + daily/monthly reads |
| `GET /api/attendance/analytics` | Rolling-window, month, and year attendance analytics (dashboard) |
| `GET/POST/PUT /api/leave-requests` | Leave management |
| `GET/POST /api/substitutes` | Substitute assignments |
| `GET/POST /api/exams` | Exam CRUD |
| `GET/POST /api/announcements` | Announcement CRUD |
| `GET/POST /api/fees/*` | Fee management |
| `POST /api/academic-years/rollover` | Year rollover |

---

## Attendance & Academic Calendar (#153)

- **Student profile (360):** click a student's name (Class Management, Student Management, or Attendance → class → student → *Full profile*). Slide-over with talking points for the parent, contacts, attendance, marks, fees, activity; year switcher for past years. Read-only; private to the office.
- **Attendance → Overview:** KPIs, trend, class ranking, students needing attention, quick student search; tap a class, then a student. **Day register** tab holds the daily class cards.
- **Attendance → Today panel:** classes marked (Morning/Afternoon), who has NOT marked (with the class teacher to ask), holiday banner, **Mark today as a holiday**, and mistake reports from teachers (resolve when fixed). Day/month/year dashboards use the shared rule and mark holidays.
- **Academic Calendar:** month grid; add/edit/delete holidays, exams, events, meetings (date or range; audience everyone/staff); weekly-off weekdays. A holiday closes attendance for those dates; warns first if they already have attendance.
- **Corrections:** the admin can change any session at any time. Export: class register CSV and the day's absentee list.
- Full detail: `docs/ATTENDANCE.md`.
