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
| Daily Knowledge | Built | AI-curated article + quiz. Points: +1 reading, +2 correct answer, -1 wrong answer |

### Academic

| Feature | Status | Description |
|---------|--------|-------------|
| My Marks | Built | Exam marks per subject. Pass/fail status. Cross-exam comparison |
| Test Calendar | Built | Upcoming tests/exams |
| Rewards | Built | Total points, streak, earned badges with dates |
| Weekly Test | Partial | DB table (`weekly_tests`) designed for AI-generated MCQ tests. Not surfaced in UI |

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
| `GET /api/newspapers/today` | Daily knowledge |
| `GET /api/syllabus` | Syllabus progress |
