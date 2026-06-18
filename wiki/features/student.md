# Student Portal

**Status:** 8 Built | 1 Partial
**Last updated:** 2026-06-18

---

## Overview

The Student portal is the learning interface at `/student`. It covers tasks, doubts, syllabus progress, exam marks, rewards, and daily knowledge content.

---

## Features

### Home

| Feature | Status | Description |
|---------|--------|-------------|
| Dashboard | Built | Published tasks, recent exam marks, open doubts, announcements (filtered to students). Quick navigation |
| My Timetable | Built | Class weekly schedule with period times, subjects, teachers, rooms |

### Learning

| Feature | Status | Description |
|---------|--------|-------------|
| My Tasks | Built | View assigned tasks. Submit text or upload files (via Cloudinary). View score and feedback. Resubmit if requested |
| Syllabus | Built | Chapter/topic coverage progress per subject. See what teacher has marked as covered |
| My Doubts | Built | Ask doubts (link to task optionally). Chat with teacher. View peer FAQs (anonymised). Upvote relevant doubts |
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
| `GET /api/tasks` | Assigned tasks |
| `POST /api/tasks/[id]/submissions` | Submit work |
| `GET/POST /api/doubts` | Ask doubts |
| `GET /api/doubts/peers` | View peer FAQs |
| `GET /api/exams/[id]/marks` | View marks |
| `GET /api/students/[id]/rewards` | Rewards data |
| `GET /api/newspapers/today` | Daily knowledge |
| `GET /api/syllabus` | Syllabus progress |
