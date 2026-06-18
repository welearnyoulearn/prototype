# Database Entity Relationship Diagrams

> **Source of truth:** `lib/db.ts` -- the `initDB()` function  
> **Database:** PostgreSQL (via Supabase)  
> **Total tables:** 60+  
> **Last updated:** 2026-06-18

This folder contains Mermaid ERD diagrams for the WLYL school management platform database. The schema is split into logical groups so each diagram remains readable.

All diagrams use GitHub-compatible Mermaid syntax and render natively in the GitHub web UI.

---

## Diagram Index

| Diagram | Tables | Description |
|---|---|---|
| [Core: Schools & Configuration](core-schools.md) | 18 | Schools, subscriptions, users, profiles, plan features, schedule settings, calendars, academic years, display tokens, audit log |
| [People: Teachers, Students & Classes](people.md) | 8 | Teachers, students, parents, student-parent join, classes, class subjects, department HODs, student class history |
| [Scheduling: Timetable & Attendance](scheduling.md) | 8 | Class timetable, teacher timetable, versions, modes, unavailability, attendance, leave requests, substitute assignments |
| [Academics: Exams, Tasks & Doubts](academics.md) | 18 | Exam records/subjects/marks, tasks/submissions/reminders, doubts/messages/upvotes, syllabus topics, weekly tests, report cards, textbooks, AI chat |
| [Fees: Payments & Billing](fees.md) | 11 | Fee categories/structures/locks/amendments, student ledger/edits, payments, waivers, Cashfree config, payment transactions, webhook log |
| [Engagement: Notifications & Rewards](engagement.md) | 22 | Announcements, notifications, student points/badges/streaks, newspapers, hub content, marketplace, portal sessions/activity, WhatsApp, SaaS billing/invoices |
| [Full Schema (reference)](full-schema.md) | All | Complete ERD with every table -- use the domain diagrams above for easier reading |

---

## How to Read the Diagrams

The diagrams use standard Mermaid ER notation:

| Symbol | Meaning |
|---|---|
| `\|\|--o{` | One-to-many (e.g. one school has many teachers) |
| `\|\|--o\|` | One-to-one (e.g. one school has one subscription) |
| `PK` | Primary Key |
| `FK` | Foreign Key |
| `UK` | Unique constraint |

---

## High-Level Architecture

```
                              schools (central entity)
                                  |
        +-----------+-------------+-------------+-----------+
        |           |             |             |           |
    teachers     students      classes       parents     users
        |           |             |             |           |
   timetable   attendance   class_subjects  student_   user_
   leave_req   task_subs    class_timetable parents    profiles
   tasks       doubts       syllabus_topics
   exams       exam_marks
               fee_ledger
               points/badges
               portal_sessions
```

Key design principles:
- **school_id** is present on nearly every table for multi-tenancy isolation
- **Soft deletes** used for schools (deleted_at), teachers (removed_at), and classes (deleted_at)
- **Audit trails** for fees (amendments, ledger edits), platform actions (audit log), and payments (webhook log)
- **Denormalized views** where needed for performance (e.g. timetable mirrors class_timetable for teacher queries)
