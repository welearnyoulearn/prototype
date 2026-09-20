# Parent Portal

**Status:** 5 Built | 2 Partial
**Last updated:** 2026-06-18

---

## Overview

The Parent portal provides read-only visibility into a child's school life at `/parent`. Covers attendance, fees, marks, activity, and timetable.

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| Child Summary | Built | Overview: attendance %, upcoming/released exam results. Fetched via `Promise.all` (a "recent tasks/homework" tile was in the UI but never wired to real data — removed along with Homework/Tasks, #136) |
| Attendance Calendar | Built | Month-view calendar for the child. Shows present/absent/late per day |
| Fee Ledger | Built | Outstanding fees, payment history, waiver details. Amount due vs paid per category |
| Learning Activity | Built | Child's recent activity: newspapers read, rewards earned (tasks-submitted/doubts-asked entries removed with #136/#137) |
| Timetable View | Built | Child's class timetable (read-only) |
| Parent Login | Partial | Lookup by parent phone + child roll number works. No proper JWT session — no persistent login |
| Mark Acknowledgement | Partial | API and DB table exist. Not prominently surfaced in parent portal UI |

---

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/parent/child-summary` | Child overview data |
| `GET /api/parent/attendance` | Attendance calendar |
| `GET /api/parent/fees` | Fee ledger |
| `GET /api/parent/activity` | Learning activity |
| `GET /api/parent/timetable` | Class timetable |
| `POST /api/exams/[id]/acknowledge` | Acknowledge marks |

---

## Attendance & School Calendar (#153)

- **Attendance:** (now also shows the full-days-in-a-row streak and a trend chart) for the selected child only — colour-coded month calendar (present / late / absent / half day / holiday / weekly off / not marked), this month and year-to-date %, six-month trend, upcoming holidays, a plain-language message under 75%. Tap a day for Morning/Afternoon.
- **School Calendar:** read-only (staff-only entries are hidden). Numbers match the teacher and student views exactly.
