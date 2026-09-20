# Student Portal

**Status:** 8 Built | 1 Partial
**Last updated:** 2026-06-18

---

## Overview

The Student portal is the learning interface at `/student`. It covers syllabus progress, exam marks, rewards, and daily knowledge content. (My Tasks / Homework and My Doubts / Ask a Doubt were pulled out for rework — see below.)

---

## Features

### Home

| Feature | Status | Description |
|---------|--------|-------------|
| Dashboard | Built | Recent exam marks, announcements (filtered to students). Quick navigation — published-tasks and open-doubts tiles removed with #136/#137 |
| My Timetable | Built | Class weekly schedule with period times, subjects, teachers, rooms |

### Learning

| Feature | Status | Description |
|---------|--------|-------------|
| My Tasks | Removed | Pulled out of `dev` for rework — full code + removal notes on `feature/136-remove-homework-tasks` (issue #136) |
| Syllabus | Built | Chapter/topic coverage progress per subject. See what teacher has marked as covered |
| My Doubts | Removed | Pulled out of `dev` for rework — full code + removal notes on `feature/137-remove-ask-a-doubt` (issue #137) |
| Daily Knowledge / Learning Hub | Removed | Pulled out of `dev` (#164) — unreachable and its `/api/hub/*` + `/api/newspapers/*` routes do not exist. Preserved on `feature/164-student-learning-hub-daily-knowledge` (draft PR #169). Student-independent: not a Platform-Admin feature |

### Academic

| Feature | Status | Description |
|---------|--------|-------------|
| My Marks | Built | Exam marks per subject. Pass/fail status. Cross-exam comparison |
| Test Calendar | Built | Upcoming tests/exams |
| Rewards screen & Marketplace | Removed | The student Rewards screen (unreachable; built on hub/test/marketplace points) and the Rewards Marketplace (student, parent, admin) were pulled out of `dev` (#165). Preserved on `feature/165-rewards-marketplace` (draft PR #170). Points/badges/streak data and `GET /api/students/{id}/rewards` remain (used by the admin's student panel) |
| Weekly Test | Removed | Pulled out of `dev` (#168), with the teacher results screen and the weekly cron. Preserved on `feature/168-weekly-test` (draft PR #173). When restored it becomes its own Platform-Admin feature (`weekly-test`) |

### Account

| Feature | Status | Description |
|---------|--------|-------------|
| Profile | Built | View student info (name, grade, section, roll number). Change password |

---

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/exams/[id]/marks` | View marks |
| `GET /api/students/[id]/rewards` | Rewards data |
| `GET /api/syllabus` | Syllabus progress |

---

## My Attendance & School Calendar (#153)

- **My Attendance:** own calendar, month and year %, trend, upcoming holidays. No classmates' data. The dashboard ring uses the same figure.
- **School Calendar:** read-only.
