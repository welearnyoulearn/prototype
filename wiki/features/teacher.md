# Teacher Portal

**Status:** 12 Built | 1 Partial
**Last updated:** 2026-06-18

---

## Overview

The Teacher portal is the daily workspace for teachers at `/teacher`. It covers class management, attendance, tasks, doubts, syllabus tracking, and personal account management.

---

## Features

### Dashboard

| Feature | Status | Description |
|---------|--------|-------------|
| Smart Snapshot | Built | Today's schedule, tasks with pending submissions, open doubts, upcoming exams, announcements (filtered to teachers) |

### My Classes

| Feature | Status | Description |
|---------|--------|-------------|
| My Classes | Built | List of assigned classes with grade, section, student count, class teacher status |
| My Students | Built | All students across assigned classes. Sortable, searchable |
| Class View | Built | Drill-down: student list, attendance summary, tasks, doubts, marks overview |
| Timetable | Built | Personal weekly schedule with times, rooms, subjects, grades |
| Attendance Marking | Built | Mark per class per session. Offline support via service worker. Auto-saves |

### Tasks & Learning

| Feature | Status | Description |
|---------|--------|-------------|
| Tasks | Built | Create tasks (homework/practice/test), set due date, publish. View submissions, grade with score + feedback, request resubmission, send reminders |
| Doubt Center | Built | View open doubts. Live chat with students. Mark resolved. Toggle as class FAQ. View AI-generated initial answers |
| Syllabus Tracker | Built | Chapter/topic list per subject per class. Mark topics as covered with date. Add/rename chapters and subtopics; a sparkle **Translate** button converts English-letter typing into Telugu or Hindi script (#116) |
| Test Calendar | Built | Upcoming tests/exams in calendar format |
| Performance Analytics | Partial | Navigation item exists but flagged `comingSoon: true`. No component loaded |

### My Account

| Feature | Status | Description |
|---------|--------|-------------|
| My Profile | Built | View/edit profile (name, email, phone, qualification). Change password |
| Leave Request | Built | Submit leave requests (casual/sick/earned). View approval status and history |

---

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/class-timetable` | Teacher's timetable |
| `GET/POST /api/attendance` | Attendance marking |
| `GET/POST /api/tasks` | Task CRUD |
| `POST /api/tasks/[id]/submissions/[sid]` | Grade submissions |
| `GET/POST /api/doubts` | Doubt management |
| `GET/POST /api/doubts/[id]/messages` | Doubt chat |
| `GET/POST /api/syllabus` | Syllabus tracking |
| `GET /api/transliterate` | Staff-only: English letters → Telugu/Hindi spellings for syllabus names (#116) |
| `POST /api/leave-requests` | Submit leave |
