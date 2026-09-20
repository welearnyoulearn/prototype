# Teacher Portal

**Status:** 12 Built | 1 Partial
**Last updated:** 2026-06-18

---

## Overview

The Teacher portal is the daily workspace for teachers at `/teacher`. It covers class management, attendance, syllabus tracking, and personal account management. (Homework/Tasks, Ask a Doubt, and Leave Requests were pulled out for rework — see the Tasks & Learning and My Account sections below.)

---

## Features

### Dashboard

| Feature | Status | Description |
|---------|--------|-------------|
| Smart Snapshot | Built | Today's schedule, upcoming exams, announcements (filtered to teachers) — the tasks-pending and open-doubts tiles were removed with Homework/Tasks (#136) and Ask a Doubt (#137) |

### My Classes

| Feature | Status | Description |
|---------|--------|-------------|
| My Classes | Built | List of assigned classes with grade, section, student count, class teacher status |
| My Students | Built | All students across assigned classes. Sortable, searchable |
| Class View | Built | Drill-down: student list, attendance summary, marks overview (Homework and Doubts tabs removed, #136/#137) |
| Timetable | Built | Personal weekly schedule with times, rooms, subjects, grades |
| Attendance Marking | Built | Mark per class per session. Offline support via service worker. Auto-saves |

### Tasks & Learning

| Feature | Status | Description |
|---------|--------|-------------|
| Tasks | Removed | Pulled out of `dev` for rework — full code + removal notes on `feature/136-remove-homework-tasks` (issue #136) |
| Doubt Center | Removed | Pulled out of `dev` for rework — full code + removal notes on `feature/137-remove-ask-a-doubt` (issue #137) |
| Syllabus Tracker | Built | Chapter/topic list per subject per class. Mark topics as covered with date. Add/rename chapters and subtopics; a sparkle **Translate** button converts English-letter typing into Telugu or Hindi script (#116) |
| Test Calendar | Built | Upcoming tests/exams in calendar format |
| Performance Analytics | Partial | Navigation item exists but flagged `comingSoon: true`. No component loaded |

### My Account

| Feature | Status | Description |
|---------|--------|-------------|
| My Profile | Built | View/edit profile (name, email, phone, qualification). Change password |
| Leave Request | Removed | Pulled out of `dev` for rework — full code + removal notes on `feature/139-remove-leave-requests` (issue #139) |

---

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/class-timetable` | Teacher's timetable |
| `GET/POST /api/attendance` | Attendance marking |
| `GET/POST /api/syllabus` | Syllabus tracking |
| `GET /api/transliterate` | Staff-only: English letters → Telugu/Hindi spellings for syllabus names (#116) |

Task, doubt, and leave-request endpoints were removed with #136/#137/#139 — see each feature's preservation branch.

---

## Attendance (#153)

- **My class** (class teacher only): the class's attendance dashboard — student list with filters, trend, weekday pattern, absent today. Subject teachers do not see it.
- **Attendance:** pick a date (today or up to 2 days back), a class and Morning/Afternoon. Every class shows whether each session is already marked and by whom. Open → all Present by default → tap Absent/Late → review → submit. If someone already marked it: *"Already marked by <name> at <time>"* (read-only) with **Report a mistake**. The marker can edit their own session the same day.
- Holidays and weekly-off days: no marking (the screen says why). **History** tab: look back at any class/day. **School Calendar** tab: read-only.
- Class view / student detail percentages use the shared rule.
