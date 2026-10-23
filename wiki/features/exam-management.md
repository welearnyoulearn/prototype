# Feature: Exam Management, Calendar & Notifications

**Portal:** School Admin / Teacher / Student / Parent (cross-portal)
**Status:** Built
**Last updated:** 2026-09-15

---

## What it does

Admin creates and manages exams (schedule, reschedule, cancel, delete) with full detail — date, start/end time, room, syllabus, instructions, an invigilating teacher, and either the whole class/section or a specific list of students. Every portal sees only the exams relevant to its role, enforced server-side, and everyone gets automatic notifications when an exam is created, rescheduled, cancelled, or changes venue/instructions, plus 7-day/1-day/exam-day reminders.

## How it works

- **Admin** (`ExamSchedule.tsx`, "+ Schedule Exam" wizard): picks classes/sections (or specific students within one class), enters name/type/date/time/room/syllabus/instructions/invigilator. Before creating, the server checks every affected student for an overlapping exam and refuses with a 409 + the conflicting exam(s) if found. "Manage Exams" tab lists every exam with Class/Section/Subject/Exam Type/Teacher/Status/Date filters and Edit/Reschedule/Cancel/Delete actions. "Reminders" tab toggles which automatic notifications fire (spec section 11).
- **Teacher** ("Exam Schedule" nav item, `TeacherExamSchedule.tsx`): a portal-wide calendar of every exam across the teacher's assigned classes/subjects. A class teacher sees every subject's exams for their own class; a subject teacher sees only their subject's exams, across all their classes.
- **Student** (`StudentMarks.tsx`, "Upcoming Exams" tab): calendar + countdown ("2 Days Left" → "Starts in 45 Minutes" on exam day), Today's/Completed exams, full syllabus and instructions on the exam detail.
- **Parent** (parent portal "Exam Calendar" nav): same calendar for the selected child only, switching automatically via the existing multi-child selector — schedule fields only (name/subject/date/time/room), syllabus and instructions are stripped server-side.
- **Reschedule/cancel**: `PUT /api/exams/[id]` re-runs the conflict check when date/time actually moves and notifies every affected student/parent/teacher; `POST /api/exams/[id]/cancel` sets a real `cancelled` status (distinct from hard `DELETE`, which stays for a mistake no one's seen yet) and notifies the same audience.
- **Reminders**: a daily cron (`/api/cron/exam-reminders`) sends the 7-day/1-day/exam-day notifications, deduped per (exam, reminder type) so a re-run never double-sends, and gated by each school's toggle in Reminders settings.

## Key files

| File | Purpose |
|------|---------|
| `app/school-admin/components/ExamSchedule.tsx` | Admin: create wizard, calendar, Manage Exams, Results & Release, Reminders settings |
| `app/components/TestCalendar.tsx` | Shared calendar used by admin/teacher/student/parent — role-aware rendering (subjects/status for staff, countdown/syllabus for students, schedule-only for parents) |
| `app/teacher/components/TeacherExamSchedule.tsx` | Teacher's portal-wide exam calendar |
| `app/student/components/StudentMarks.tsx` | Student's Results + Upcoming Exams tabs |
| `app/parent/page.tsx` (Exam Calendar section) | Parent's per-child calendar + list |
| `lib/examsAuth.ts` | Session-derived identity + role checks (`isClassTeacherOf`, `isTeacherLinkedToClass`, `parentOwnsStudent`, `examNotificationEnabled`) — every exam route authorizes off these, never a client-supplied id |
| `lib/examConflicts.ts` | `findExamConflicts()` — shared same-student/overlapping-time check used on create and reschedule |
| `lib/examGrading.ts` | Single source for grade bands and pass/fail |
| `app/api/cron/exam-status-sweep/route.ts` | Daily: flips `scheduled` → `collecting` once `exam_date` passes |
| `app/api/cron/exam-reminders/route.ts` | Daily: 7-day/1-day/exam-day reminders, deduped via `exam_reminders_sent` |

## API endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/exams/schedule` | Admin creates an exam across one or more classes, with conflict check |
| GET | `/api/exams` | List exams — admin/teacher only (role-scoped); students/parents use the endpoints below |
| GET/PUT/DELETE | `/api/exams/[id]` | Detail / edit-reschedule (with re-conflict-check + notify) / hard delete |
| POST | `/api/exams/[id]/cancel` | Soft-cancel with notification, distinct from delete |
| GET | `/api/exams/calendar` | Role-scoped calendar feed (admin/teacher/student/parent) — includes time/room/syllabus/instructions, syllabus+instructions stripped for parent callers |
| GET | `/api/students/[id]/exams` | Student's released results (self/linked-parent only) |
| GET | `/api/parent/child-summary` | Parent dashboard summary incl. upcoming exams for the selected child |
| GET/PUT | `/api/exam-notification-settings` | Admin's reminder on/off toggles |
| POST | `/api/exams/[id]/marks`, `/review`, `/release`, `/acknowledge`, `/nudge-parent` | Marks entry → class-teacher review → admin release → parent acknowledgement (unchanged v2 workflow) |

## Database tables

| Table | Role |
|-------|------|
| `exam_records` | One row per class per exam — name/type/academic_year/date/start_time/end_time/duration/room/syllabus/instructions/assigned_teacher_id/student_scope/status (`scheduled → collecting → teacher_reviewed → released`, or `cancelled`) |
| `exam_subjects` | Per-subject marks-entry slot, FK'd to `class_subjects` |
| `exam_marks` | Per-student-per-subject marks |
| `exam_applicable_students` | When `exam_records.student_scope = 'specific'`, the exact students the exam applies to |
| `exam_reminders_sent` | Dedup log for the reminder cron — `UNIQUE(exam_id, reminder_type)` |
| `exam_notification_settings` | Per-school reminder/notification toggles |
| `parent_mark_acks`, `parent_mark_ack_nudges` | Parent sign-off on released results |
| `notifications` | Shared notification table — `exam_scheduled`, `exam_updated`, `exam_cancelled`, `exam_reminder_7day/1day/today`, `marks_released`, etc. |

## Status history

| Date | Change | Issue |
|------|--------|-------|
| 2026-09-15 | v3: time/room/syllabus/instructions/invigilator/academic_year fields, specific-student targeting, conflict detection, reschedule/cancel notifications, 7-day/1-day/exam-day reminder cron, per-school reminder settings, teacher/student/parent cross-portal calendars, fixed a bug where `scheduled` exams were hidden from student/parent calendars by default, fixed a teacher cross-class read-access gap on `GET /api/exams` | #TBD |
| Earlier | v2: admin-created exams, class-teacher review → admin release workflow, real parent identity on acknowledgement, `class_subjects` FK | — |

## Known issues

- [ ] No GitHub issue filed yet for the v3 work (environment had no `gh` CLI access) — retrofit the link when one exists.
- [ ] `exam_group_id` is a display-grouping tag only, not a true single entity — editing "the exam" across a multi-class batch still means editing each class's row individually via Manage Exams.
- [ ] No per-subject exam date (a multi-day mid-term shares one date/time across every subject in the exam).

## Notes

- Every exam route resolves the acting identity from the session (`lib/examsAuth.ts`), never from a client-supplied `student_id`/`teacher_id`/`parent_id` — this was a deliberate fix for a real prior vulnerability class and every new route in v3 follows the same pattern.
- The calendar's `include_draft` query param was removed — a calendar shows every non-cancelled exam regardless of status; excluding `scheduled` by default (the status nearly every future exam sits in) had been silently hiding upcoming exams from students and parents.
