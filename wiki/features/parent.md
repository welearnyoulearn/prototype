# Parent Portal

**Status:** 5 Built | 2 Partial
**Last updated:** 2026-09-20

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

## Sign-in and password reset (#152)

- **Sign in:** email or 10-digit Indian mobile number, plus password. A phone typed as "+91 98765-43210" is cleaned to `9876543210`; anything that isn't a valid Indian mobile is rejected before the request is made.
- **Forgot password (WhatsApp code):** `/parent/forgot-password` is a three-step page. (1) registered mobile number, (2) six-box 6-digit code sent on WhatsApp, (3) new password + confirm, then back to `/parent/login?reset=1` with a confirmation. Small "Use email instead" link sends the older reset link by email.
- **Rules:** code valid 5 minutes, single use, 5 attempts; resend after 30 s; 3 codes per number per hour, 10 per IP per hour, daily cap. The response never reveals whether the number is registered.
- **Phone numbers everywhere:** must be 10-digit Indian mobiles (start 6–9), validated on add, bulk import, edit and sign-in; stored as the bare 10 digits.
- **Endpoints:** `POST /api/parent/auth/otp/send`, `/otp/verify`, `/otp/reset`. Setup for the WhatsApp sender: `docs/WHATSAPP-SETUP.md`.
