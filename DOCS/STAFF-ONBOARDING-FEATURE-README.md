# Staff Onboarding Feature — Complete Reference

> **Flowchart:** https://claude.ai/code/artifact/34c0571e-6efc-4e7d-8d02-89ea04adfb1b

> Last verified against code: 2026-09-03 (re-verified this session — CSV/paste-CSV removal, always-visible Excel Template button, Staff Type + Teaches Grades template dropdowns, shared name validation, and bidirectional teacher auto-assign)
> Scope: every part of the codebase that touches staff (teacher) onboarding — database tables, API routes, and UI screens across School Admin and Teacher portals.

This document explains staff onboarding **inch by inch**: what the `teachers` table stores, what every API route accepts and returns, what every screen looks like and does, and how the pieces connect into complete end-to-end workflows. Read it top to bottom once if you're new to this part of the codebase.

---

## Table of Contents

1. [The big picture in one paragraph](#1-the-big-picture-in-one-paragraph)
2. [Database schema](#2-database-schema)
3. [Every API route, in detail](#3-every-api-route-in-detail)
4. [lib/whatsapp.ts — the scaffold, from the staff angle](#4-libwhatsappts--the-scaffold-from-the-staff-angle)
5. [School Admin: the Staff Onboarding screen](#5-school-admin-the-staff-onboarding-screen)
6. [School Admin: the Staff/Teachers directory](#6-school-admin-the-staffteachers-directory)
7. [Credentials — generation, delivery, and recovery](#7-credentials--generation-delivery-and-recovery)
8. [Class assignment relationship — how staff onboarding connects to Class Management](#8-class-assignment-relationship--how-staff-onboarding-connects-to-class-management)
   - [8a. Auto-assign on onboard/edit — the reverse direction (new this session)](#8a-auto-assign-on-onboardedit--the-reverse-direction-new-this-session)
9. [Auth model — who can do what](#9-auth-model--who-can-do-what)
10. [Teacher-side academic year selector (new this session)](#10-teacher-side-academic-year-selector-new-this-session)
11. [End-to-end scenarios, step by step](#11-end-to-end-scenarios-step-by-step)
12. [Known gaps and quirks](#12-known-gaps-and-quirks)
13. [Quick-reference glossary](#13-quick-reference-glossary)

---

## 1. The big picture in one paragraph

A school admin onboards teaching and non-teaching staff exclusively through one screen, `StaffOnboarding.tsx`, which feeds one API route, `POST /api/teachers/bulk` — there is no separate single-add route (a dead-code duplicate was removed and its removal is documented right in `app/api/teachers/route.ts`). Every row requires a **name and a phone number**; email is optional but is the only thing that actually activates a login, since **teacher login is email-only** — there is no fallback identifier the way students always get a system-generated `roll_number`. A teacher with no email gets a fully functional record (department, subject, employee ID, class assignment eligibility) but no password and no way to ever log in until an admin adds an email. Credentials, when generated, are delivered over two channels — email (primary, required for the account to be usable) and WhatsApp (bonus, if a phone is on file) — via a scaffolded, not-yet-live WhatsApp integration shared with the student-onboarding feature. Once onboarded, a teacher's lifecycle runs through one generic update endpoint (`PUT /api/teachers/[id]`) that bundles three distinct, mutually-exclusive behaviors — a routine contact-info edit, a reactivation, and a becoming-inactive pause — and one removal endpoint (`DELETE /api/teachers/[id]`) that unlinks the teacher from every class/attendance/exam/syllabus/doubts table without deleting any of that history. From there, `teachers.subject` (a single onboarding-level field) and `class_subjects` (the real per-class teaching assignment table, populated through Class Management) are deliberately kept as two separate, unsynced sources of truth.

---

## 2. Database schema

All of this lives in `lib/db.ts` — the base `teachers` table is created in the fresh-bootstrap SQL block, and every column added afterward arrives via `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS` scattered through the `migrations[]` array and the later `runIncrementalMigrations()` function. This section merges that history into one picture.

### `teachers`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id` | INTEGER REFERENCES schools(id) ON DELETE CASCADE | Tenant key |
| `name` | VARCHAR(255) NOT NULL | |
| `email` | VARCHAR(255) | Optional at the DB level, but the **only** login identifier — `/api/teacher/auth/login` looks up `LOWER(email)` and never checks `employee_id` or `phone`. No email on file means no working login, permanently, until one is added |
| `subject` | VARCHAR(100) | The "primary" onboarding-level subject — a single free-text/dropdown-selected value, entirely separate from `class_subjects` (see [§8](#8-class-assignment-relationship--how-staff-onboarding-connects-to-class-management)) |
| `phone` | VARCHAR(50) | **Mandatory at onboarding** (bulk route rejects a row with no phone) — the WhatsApp delivery channel and, per the school-scoped unique index below, also intended as a stable per-school lookup key |
| `employee_id` | VARCHAR(50) | Server-generated, format `wlyl-tea-{school-slug}-{5-digit-random}` — see the collision-retry logic in [§3](#3-every-api-route-in-detail) |
| `department` | VARCHAR(100) | |
| `qualification` | VARCHAR(200) | |
| `date_of_joining` | DATE | |
| `staff_type` | VARCHAR(20) DEFAULT 'teaching' | `'teaching'` or `'non_teaching'` |
| `teaches_grades` | TEXT | Comma-separated grade list; blank means "teaches all grades" |
| `status` | VARCHAR(20) DEFAULT 'active' | Observed values: `active`, `inactive` (paused, reversible), `removed` (soft-deleted) |
| `password_hash` | VARCHAR(255) | bcrypt hash; NULL until an email exists and a temp password is generated |
| `password_changed` | BOOLEAN DEFAULT FALSE | Reset to FALSE on every fresh temp-password issuance (onboarding, reactivation, admin-triggered reset); set TRUE only by the teacher's own self-service change-password call |
| `removed_at` | TIMESTAMPTZ | Set on removal (DELETE), cleared back to NULL on reactivation — see the PUT route's `CASE WHEN $9 = 'active' THEN NULL ELSE removed_at END` |
| `created_at` | TIMESTAMP DEFAULT NOW() | |

### Indexes — the three unique indexes added this session

All three live in `runIncrementalMigrations()` near the bottom of `lib/db.ts`, all three are `WHERE ... AND removed_at IS NULL` partial indexes (so a removed teacher's old email/phone/employee_id is free to be reused without manual cleanup), all three use `CREATE UNIQUE INDEX IF NOT EXISTS` wrapped in a `.catch()` rather than being allowed to crash `ensureDB()` on a database that already has dirty duplicate data:

- **`idx_teachers_email_unique`** — `ON teachers (LOWER(email)) WHERE email IS NOT NULL AND removed_at IS NULL`. **Global**, not per-school — enforces that a given email can only belong to one active teacher anywhere on the platform, matching the fact that login is a global `LOWER(email)` lookup with no school scoping. Observed this session: this index has been seen to **fail to create**, logging `[migration] Skipped idx_teachers_email_unique — likely pre-existing duplicate active teacher emails. Resolve manually (see removed_at IS NULL rows sharing an email) then rerun.` This means the constraint is **intended but not currently active in practice** on at least one environment — the app-level dup checks in the bulk/PUT routes are still the only thing actually preventing new email collisions; pre-existing duplicate rows from before those checks existed are not retroactively cleaned up. Not reconfirmed independently in this pass — documented here as observed.
- **`idx_teachers_school_phone_unique`** — `ON teachers (school_id, phone) WHERE phone IS NOT NULL AND removed_at IS NULL`. Per-school, not global (unlike email) — the same phone number can legitimately belong to different teachers at different schools.
- **`idx_teachers_school_employee_id_unique`** — `ON teachers (school_id, employee_id) WHERE employee_id IS NOT NULL AND removed_at IS NULL`. Backs the 5-attempt collision-retry loop in the bulk route (see [§3](#3-every-api-route-in-detail)) — a `pgErr.constraint === 'idx_teachers_school_employee_id_unique'` check specifically re-rolls the random suffix and retries rather than surfacing an error.

The migration's own comment explains the underlying motivation precisely: teacher uniqueness used to be app-level-only (SELECT-then-INSERT), so two concurrent bulk imports could both pass the check and both insert, producing real duplicate rows (same login email, or the same employee_id shown in the UI). These indexes close that race at the database level; the app-level SELECT checks stay in place too so a genuine conflict surfaces as a friendly per-row message instead of a raw 500 (caught via Postgres error code `23505`, the `UNIQUE_VIOLATION` constant defined at the top of `app/api/teachers/bulk/route.ts`).

`CREATE INDEX IF NOT EXISTS idx_teachers_employee_id ON teachers(employee_id, school_id)` — an older, non-unique index, purely for lookup speed; predates and is independent of the three unique indexes above.

---

## 3. Every API route, in detail

### `POST /api/teachers/bulk` — the only onboarding route

Used for **both** single-teacher and multi-teacher submissions — `StaffOnboarding.tsx` never calls any other create route. Confirmed: `app/api/teachers/route.ts` has no `POST` handler at all — its file ends with a comment explaining exactly why a single-add POST was removed as dead code (it wrote into `class_teacher_grade`/`class_teacher_section` columns that don't exist on `teachers`; class-teacher assignment is done via `classes.class_teacher_id` through Class Management instead).

- **Auth:** `requireSchoolAdmin()` plus a manual `admin.schoolId === Number(school_id)` check (403 on mismatch) — the same two-step pattern used by student bulk onboarding.
- **Body:** `{ school_id, teachers: [{ name, phone, email?, subject?, department?, qualification?, date_of_joining?, staff_type?, teaches_grades? }] }`.
- **Validation regexes**, defined at the top of the file:
  - `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - `PHONE_RE = /^\+?[\d\s\-()[\]]{7,15}$/`
  Both re-validated server-side even though the onboarding UI already checks them client-side — a direct API call bypasses client checks entirely, and without this a malformed email would still get a password generated and a send attempt made (which fails silently, fire-and-forget), leaving a permanently unusable account.
- **Per-row required fields**: `name` and `phone` — a missing name or phone pushes an error into `errors[]` for that row and the row is skipped; the rest of the batch proceeds. **Email is optional.**
- **Batched dup-lookup queries**, run once up front (not per-row):
  - `phones` (deduped, trimmed) → one query: `SELECT name, phone FROM teachers WHERE school_id = $1 AND phone = ANY($2) AND removed_at IS NULL` — **scoped to this school**.
  - `emails` (deduped, lowercased) → one query joined to `schools`: `SELECT t.name, t.email, s.name AS school_name FROM teachers t JOIN schools s ON s.id = t.school_id WHERE LOWER(t.email) = ANY($1) AND t.removed_at IS NULL` — **scoped globally across every school**, because email is the login identifier platform-wide. A hit returns the exact other school's name, and the row-level error message names it explicitly: `"{email} is already registered to {name} at {school}. That school must remove them before this email can be reused here."`
- **In-batch dedup**: `seenEmails`/`seenPhones` `Set<string>` objects, populated as each row is successfully inserted within the same request loop — the batched lookups above only see rows already committed from an *earlier* request, never siblings still being processed in the current loop, so two rows in the same paste sharing an email or phone previously could both insert successfully. The `seenEmails`/`seenPhones` sets close that same-batch gap the same way the student bulk route's in-batch `Set` does.
- **Format validation** happens per-row, after the required-field check and before the seen/dup checks — an invalid email or phone produces its own specific error message and skips the row.
- **`employee_id` generation** — `generateEmployeeId(schoolName)` builds `wlyl-tea-{school-slug}-{5-digit-random}`. The insert runs inside a **5-attempt retry loop** (`for (let attempt = 0; attempt < 5 && !teacher; attempt++)`): on a Postgres unique-violation, if the violated constraint is specifically `idx_teachers_school_employee_id_unique`, the loop rerolls a new random suffix and retries; any other unique-violation (an email/phone collision that snuck past both the batched lookup and the in-batch `seenX` sets — a genuine same-batch race) is treated as a normal per-row dup error and the row is abandoned. If all 5 attempts are exhausted without a clean insert, the row gets `"{name}: could not generate a unique employee ID, please retry"`.
- **Temp-password-only-if-email rule**: `const tempPassword = email ? generateTempPassword(10) : null` — a temp password (and its bcrypt hash) is generated **only** when an email is present. A phone-only teacher gets a real, working account row (subject, department, employee ID, everything) but `password_hash` stays NULL and they cannot log in until an admin later adds an email (there is no route that generates a password without an email — see `reset-credentials` below, which explicitly refuses a teacher with no email).
- **WhatsApp+email delivery this session**: once a row inserts successfully —
  ```
  if (tempPassword && email) {
    sendTeacherWelcomeEmail({ to: email, name, schoolName, tempPassword, loginUrl }).catch(console.error)
    if (normPhone) {
      sendWhatsappMessage({ ..., templateName: 'staff_credentials', templateParams: { staff_name, school_name, login: email, temp_password, login_url } }).catch(console.error)
    }
  }
  ```
  Email is the gating condition (matches `tempPassword` itself only existing when email exists) — WhatsApp is strictly a **bonus** channel, sent only if a phone is *also* on file (which it always is, since phone is mandatory for every row that reaches this point) and only alongside an email send, never as a substitute for one. The code comment states this explicitly: *"Teacher login is email-only today ... WhatsApp is only worth sending when there's an actual email to log in with, same as why tempPassword itself is only generated when email is present."*
- **Response**: `{ inserted: count, teachers: [...], errors: [{row, message}] }`, HTTP `201` even when some/all rows failed.
- **Transaction**: the whole per-row insert loop runs inside one `BEGIN...COMMIT`/`ROLLBACK` on one connected client; email/WhatsApp sends fire **after** `COMMIT`, fire-and-forget.

### `GET /api/teachers/[id]`, `PUT`, `DELETE` — `app/api/teachers/[id]/route.ts`

Rewritten substantially this session. All three handlers use `requireFeeAccess(school_id)` (folds role check + tenant match into one call, and additionally admits `platform_admin` for any school) rather than the `requireSchoolAdmin()` + manual check pattern the bulk route uses.

#### GET

1. Looks up the teacher's `school_id` first, calls `requireFeeAccess()` against it, **before** any row data (including the excluded `password_hash`) leaves the server.
2. Returns an explicit column list — `id, school_id, name, email, phone, subject, department, qualification, date_of_joining, staff_type, status, teaches_grades, employee_id, password_changed, removed_at, created_at`. **`password_hash` is not selected** — confirmed no leak, unlike the student equivalent single-record route which still does `SELECT *`.

#### PUT — three distinct behaviors bundled into one generic update endpoint

The route first computes two booleans against the **existing** row before touching anything:

```ts
const becomingInactive = status === 'inactive' && existing.status !== 'inactive'
const becomingActive    = status === 'active'   && existing.status !== 'active'
```

`becomingActive` is true whether the teacher is coming from `'inactive'` (the lighter pause) **or** `'removed'` (a full removal) — both count as "was logged out, needs a fresh credential to get back in."

Then, critically:

```ts
const emailChanged = !becomingActive && trimmedEmail && trimmedEmail.toLowerCase() !== (existing.email || '').toLowerCase()
const phoneChanged = !becomingActive && trimmedPhone && trimmedPhone !== (existing.phone || '')
```

**`emailChanged`/`phoneChanged` are gated on `!becomingActive`.** This is the subtle precedence rule the code deliberately encodes: if a single PUT request both reactivates a teacher (`status: 'active'`) **and** includes a changed email/phone in the same body, the request is treated purely as a reactivation — `emailChanged`/`phoneChanged` are forced `false`, so the routine-edit notification path (below) never fires for that request, only the reactivation path. The new email/phone value is still saved to the row via the same `COALESCE`-based `UPDATE` — it just doesn't trigger its own separate contact-changed notification, because the reactivation notification is considered to already cover "your login details changed, here's your new password."

**Behavior (a) — routine contact-info edit** (`status` unchanged, `emailChanged` and/or `phoneChanged` true):
- **Duplicate checks before the update**:
  - Email: `SELECT t.name, s.name AS school_name, t.school_id = $2 AS same_school FROM teachers t JOIN schools s ON s.id = t.school_id WHERE LOWER(t.email) = LOWER($1) AND t.id != $3 AND t.removed_at IS NULL` — **no `school_id` filter at all**, matching the global email-uniqueness model. The `same_school` boolean picks between two different 409 error messages: `"{email} is already used by {name} at this school."` (same-school) vs. `"{email} is already registered to {name} at {school}. That school must remove them before this email can be reused here."` (cross-school). **This session's bug fix**: previously only the cross-school case was caught at all — a same-school duplicate email slipped through entirely. Both cases are now checked in one query.
  - Phone: `SELECT name FROM teachers WHERE school_id = $1 AND phone = $2 AND id != $3 AND removed_at IS NULL` — **new this session**, didn't exist before, same-school scoped (matching the phone unique index's scope).
- **Password is UNCHANGED** — `tempPassword` is only generated `if (becomingActive)`, so a routine edit never touches `password_hash`.
- **Notifications fire to BOTH the old and the new value**, per changed field:
  - Email: `sendStaffContactChangedEmail({ to: addr, name, schoolName, field: 'email', newValue })` sent to the new email always, and additionally to the old email if it existed and differs (case-insensitively).
  - Phone: a `contact_info_changed` WhatsApp message sent to the new phone always, and additionally to the old phone if it existed and differs.

**Behavior (b) — reactivation** (`becomingActive` true, from either `'inactive'` or `'removed'`):
- A brand-new temp password is generated (`generateTempPassword(10)`) and hashed; `password_changed` is reset to FALSE.
- `removed_at` is explicitly cleared back to NULL via `CASE WHEN $9 = 'active' THEN NULL ELSE removed_at END` in the same `UPDATE`.
- Notifications: `sendStaffReactivatedEmail` to the teacher's email (if present) and a `staff_reactivated` WhatsApp message to their phone (if present) — both carry the fresh temp password and login URL. Gated independently — `if (teacher.email)` / `if (teacher.phone)` — so a reactivated teacher with only one contact method still gets one delivery attempt.
- Note: reactivation does **not** re-link any previously-unlinked class/subject/timetable assignments — those were nulled out at either the earlier `becomingInactive` pause or the DELETE-time unlink, and reactivation only restores login access; the school admin must re-assign classes/subjects explicitly afterward.

**Behavior (c) — becoming inactive** (`becomingInactive` true):
- Unlinks the same three tables removal does: `class_subjects.teacher_id`, `class_timetable.teacher_id` (also resets `is_manual = FALSE`), `classes.class_teacher_id` — all set to `NULL` where they pointed at this teacher.
- The code comment explains why: *"A deactivated teacher can't log in, so Class Management showing them as still 'assigned' to a subject is misleading ... Reversible: Reactivate just flips status back; the school admin re-assigns the subject explicitly."*
- No notification fires specifically for becoming inactive (it isn't a contact-info change and isn't a reactivation — falls through the `if (becomingActive && tempPassword) {...} else {...}` structure into the `else` branch, but since `emailChanged`/`phoneChanged` are independently false when there's no actual contact-info change in the same request, nothing fires unless the request body also happened to change email/phone alongside the deactivation).

Cache invalidation: `invalidateCache('teachers:{schoolId}:all'|':teaching'|':non_teaching')` after every successful PUT.

#### DELETE — full removal, with a consequences-preview mode

`GET .../[id]?consequences=true` (despite being under the DELETE handler's file, this is a query-param-gated preview, not a separate method) returns, without deleting anything: `subjects_teaching` (from `class_subjects` joined to `classes`), `class_teacher_of` (from `classes.class_teacher_id`), and `timetable_slots` (from `class_timetable` joined to `classes`, non-break rows only) — this is what powers the Staff Directory's "Remove {name}?" confirmation dialog's impact preview.

The real DELETE, inside one transaction, unlinks (never deletes the referencing row's data) in this order:
1. `class_timetable.teacher_id = NULL` (+ `is_manual = FALSE`)
2. `class_subjects.teacher_id = NULL`
3. `classes.class_teacher_id = NULL`
4. `attendance.marked_by_teacher_id = NULL`
5. `substitute_assignments.original_teacher_id = NULL`
6. `substitute_assignments.substitute_teacher_id = NULL` (both directions of the same table, separately)
7. `tasks.teacher_id = NULL`
8. `task_submissions.reviewed_by = NULL`
9. `task_reminders.sent_by = NULL`
10. `doubts.answered_by = NULL`, `doubts.resolved_by = NULL`, `doubts.faq_set_by = NULL` (three separate columns on the same table)
11. `school_topic_progress.covered_by = NULL`
12. `syllabus_topics.covered_by = NULL`
13. `exam_records.created_by = NULL`
14. `exam_subjects.teacher_id = NULL`, `exam_subjects.submitted_by = NULL`
15. `exam_marks.entered_by = NULL`
16. `teacher_unavailability` — **DELETE**d outright (not unlinked; these are the teacher's own scheduling-constraint rows, meaningless without them)
17. `leave_requests` — **DELETE**d outright (same reasoning — a removed teacher's own leave requests)
18. `notifications.recipient_teacher_id = NULL`, `notifications.sender_teacher_id = NULL` — unlinked, not deleted, explicitly called out in a code comment as the one exception among the notification-adjacent rows that intentionally preserves history rather than following the delete-teacher's-own-data pattern used for `teacher_unavailability`/`leave_requests`.

Then: `UPDATE teachers SET status = 'removed', removed_at = NOW() WHERE id = $1 AND status != 'removed'`.

**State explicitly: none of the unlinked/reassigned tables' actual data rows are deleted — only the `teacher_id`-shaped foreign keys pointing at this specific teacher are nulled out.** Historical syllabus progress, exam marks, attendance records, task submissions, and doubts all survive completely intact; they simply show no attributed teacher where this one used to be referenced.

After commit: removal notifications, fire-and-forget — `sendStaffRemovedEmail` to the teacher's email if present, a `staff_removed` WhatsApp message to their phone if present.

### `POST /api/teacher/auth/login`

Confirms the email-only model directly: looks up `LOWER(t.email) = LOWER($1) AND t.removed_at IS NULL`, ordered `t.id DESC LIMIT 1` (a defensive tie-breaker for legacy duplicate-email rows predating the unique index, so a stale duplicate never silently wins over the account meant to be used). Never references `employee_id` or `phone` anywhere in the lookup. Refuses with `"Account not activated. Please contact your school admin."` if `password_hash` is NULL (i.e., a phone-only teacher who was never issued a password), and with a 403 `"Your account has been deactivated"` if `status !== 'active'` (covers both `'inactive'` and `'removed'`).

### `POST /api/teacher/auth/forgot-password`

Email-only lookup (`WHERE LOWER(t.email) = LOWER($1) AND t.removed_at IS NULL`), matching login being email-only — a teacher with no email cannot use forgot-password at all (there's no code path to reach it without one, since the form itself asks for an email). If found: generates a reset token, inserts into `password_reset_tokens` with `role = 'teacher'`, sends `sendPasswordResetEmail`, and — **new this session** — additionally sends a `password_reset` WhatsApp message to `teacher.phone` if one is on file. The code comment states the reasoning plainly: *"Login stays email-only (lookup above), but WhatsApp is still a useful second channel for actually receiving the link if their inbox is slow/unchecked."* Both the email-not-found and no-account cases return the same generic `{ success: true }` to avoid account enumeration.

### `POST /api/teachers/[id]/reset-credentials`

**Still exists, unchanged in essential behavior, but no longer wired to any UI** — the Credentials-tab Reset button that called it was removed this session (see [§6](#6-school-admin-the-staffteachers-directory)), matching the equivalent student-flow removal from earlier. Auth: `requireSchoolAdmin()` + explicit `teacher.school_id !== admin.schoolId` check. Refuses if the teacher's `status !== 'active'` ("reactivate them before resetting their password") or if `!teacher.email` ("This teacher has no email on file — add one before resetting their password"). Generates a fresh 10-char temp password, hashes it, resets `password_changed = FALSE`, sends `sendTeacherWelcomeEmail`, and returns `{ temp_password }`.

The route's own comment now documents this explicitly: it's kept as a live API for any future admin-tool or internal use, not currently reachable from any screen — the working UI recovery paths are reactivation (a deactivate→reactivate round-trip issues a fresh password automatically) and the teacher's own self-service forgot-password flow.

### `POST /api/teachers/[id]/change-password`

Unchanged this session. Teacher's own self-service password change: requires `current_password` (bcrypt-verified against the stored hash — this is the route's entire authorization mechanism, there is no separate check that the caller is that teacher's own logged-in session), `new_password` (min 8 chars), and `school_id`. Sets `password_changed = TRUE` on success — the one place this flag ever flips back to true.

---

## 4. lib/whatsapp.ts — the scaffold, from the staff angle

Shared verbatim with the student-onboarding feature — one file, one `sendWhatsappMessage()` function, one `whatsapp_messages` audit table, used by both features' call sites. From the staff angle specifically:

**What "queued but not sent" means**: every call —
1. Looks up the named template in `WHATSAPP_TEMPLATES` (no-ops with a console error if unknown).
2. Logs `[whatsapp] (scaffold — not sent) template=... to=... school=...` to the console.
3. Inserts one row into `whatsapp_messages` with `status: 'queued'` and `provider_message_id: null`.
4. Returns normally — never actually reaches Meta's Cloud API.

The file's own header comment lays out the exact steps to go live later: (1) add `WHATSAPP_ACCESS_TOKEN` handling, decrypting each school's own `school_whatsapp_config.access_token_encrypted` (same pattern `lib/encryption.ts` already uses for Cashfree secrets) rather than one shared env var, since each school has its own Meta WABA + `phone_number_id`; (2) replace the TODO block inside `sendWhatsappMessage()` with a real `fetch()` to `https://graph.facebook.com/v20.0/{phone_number_id}/messages`; (3) update the inserted `whatsapp_messages` row's `status`/`provider_message_id` from the real API response instead of hardcoding `'queued'`; (4) wire the delivery-status webhook (Meta calling back with delivered/read events) — explicitly out of scope for this scaffold. No call site anywhere (onboarding, PUT, DELETE, forgot-password) needs to change when this goes live — only the internals of this one function do.

**Every WhatsApp template name relevant to staff**, with exact param lists from `WHATSAPP_TEMPLATES`:

| Template | Params | Used by |
|---|---|---|
| `staff_credentials` | `staff_name, school_name, login, temp_password, login_url` | Bulk onboarding (new-teacher welcome) |
| `staff_removed` | `staff_name, school_name` | DELETE (removal notification) |
| `staff_reactivated` | `staff_name, school_name, login, temp_password, login_url` | PUT (reactivation) |
| `contact_info_changed` | `name, school_name, field, new_value` | PUT (routine email/phone edit) — shared exact template with the student/parent contact-change flow |
| `password_reset` | `name, reset_url` | Forgot-password |

---

## 5. School Admin: the Staff Onboarding screen

**Screen:** `app/school-admin/components/StaffOnboarding.tsx`

### Intake paths — CSV/paste-CSV removed this session

**The `mode` (manual/CSV) toggle is gone entirely.** The manual grid now always renders — there is no branch that swaps it for a textarea. Only **two** ways to get rows into the grid remain:

- **Manual grid** (the only "mode" now): a spreadsheet-like table (`data-testid="staff-row-*"` per field, per row), columns: Name, Email, Subject, Phone, Department, Qualification, Joining Date, Staff Type, Teaches Grades.
- **Import Excel File**: the toolbar button is now labeled **"Import Excel File"** (was "Import File"), and the underlying `<input type="file">` has `accept=".xlsx"` — confirmed in the current source (`data-testid="staff-import-file-input"`, `accept=".xlsx"`). There is no more extension-branching logic: `handleFileImport()` calls `parseExcelFile()` unconditionally on whatever file is selected, and `parseExcelFile()` always POSTs to `POST /api/teachers/parse-import` via `FormData`, regardless of the file's actual extension. The old CSV-paste textarea, the client-side `FileReader.readAsText()` fallback path, and the "looks like a student CSV, rejected" cross-CSV guard described in a prior version of this document **no longer exist in this component** — there is no code path left that reads a file as plain text or parses a pasted CSV blob.
  - **Correction to a claim made about this change**: `POST /api/teachers/parse-import` (`app/api/teachers/parse-import/route.ts`) is unchanged and still does genuine server-side `.xlsx` parsing via ExcelJS (`wb.xlsx.load(buf)`, reading real worksheet cells) — it was never a plain-text CSV reader, so there was no "old server route" behavior to reconcile with the removal of CSV/paste-CSV; the route simply lost its `.csv`/`.txt` alternative path on the client side that used to bypass it entirely. If a non-`.xlsx` file is somehow still selected (the file picker's `accept` is an OS-level hint, not a hard block), `ExcelJS.Workbook.xlsx.load()` will throw and the route returns its existing generic 500 `{ error: 'Failed to parse the uploaded file' }` — there's no separate "wrong file type" message.
- **Excel Template button is now always visible.** `downloadExcelTemplate()` and the "Excel Template" button (`data-testid="staff-download-excel-template"`) are no longer gated behind `subscribedSubjectNames.length > 0` — the gate was removed from the JSX; the button renders unconditionally in the header toolbar next to "Import Excel File". The template itself still adapts its Subject dropdown source based on whether the school has subscribed subjects (see below), so the button being always-visible doesn't imply the template's content is unconditional — only the button's *visibility* changed.

### The Excel template — three in-cell dropdowns

`GET /api/teachers/template?school_id=...` (`app/api/teachers/template/route.ts`) generates a real `.xlsx` via ExcelJS with **three** genuine Excel data-validation dropdowns, up from one:

| Column | Field | Dropdown source | `allowBlank` | `showErrorMessage` |
|---|---|---|---|---|
| C | Subject | `_subjects` hidden sheet (`state: 'veryHidden'`) — the school's subscribed subjects if any exist, else the full `master_subjects` catalog | `true` | `true` |
| H | Staff Type | inline list formula `'"teaching,non_teaching"'` — no reference sheet needed, only two fixed values | `false` | `true` |
| I | Teaches Grades | `_grades` hidden sheet (`state: 'veryHidden'`), populated `A1:A10` with the strings `'1'` through `'10'` (`Array.from({length:10}, (_,i) => String(i+1))`) | `true` | **`false`** |

- **Staff Type (column H)** is new this session — `allowBlank: false` (every row must pick one), backed by an inline comma-list formula rather than a reference sheet, since there are only two fixed values.
- **Teaches Grades (column I)** is also new this session — backed by the new `_grades` veryHidden worksheet. `showErrorMessage` is deliberately `false` here (the only one of the three dropdowns with this set false): Excel's single-value list validation would otherwise reject legitimate free-typed multi-grade input like `8,9,10`, since a list-type validation only truly constrains to one value from the list per cell — the dropdown exists to make picking *one* grade easy and typo-proof, while a comma-separated combination still has to be typed by hand and must not be blocked.
- **The note row's text was rewritten** to document all three conventions in one sentence: *"★ Yellow columns are MANDATORY. {Subject note}. Non-teaching staff can leave Subject blank. Staff Type: pick teaching or non_teaching from the dropdown. Teaches Grades: for one grade, use the dropdown — for several, type them comma-separated with no spaces, e.g. 8,9,10 (leave blank to teach all grades)."*
- The two-example-row content changed to match: row 1 (`Priya Sharma`) now has `staff_type: 'teaching'` and `teaches_grades: '8,9,10'`; row 2 (`Suresh Patel`) has `staff_type: 'non_teaching'` and blank grades.

### Grid columns and validation (client-side, `rowErrors()`)

- **Required**: Name, Email (**"Email required — login credentials will be sent here"**), Phone.
- **Name is now also validated as a real name**, not just non-empty — see [§5a](#5a-name-validation-new-this-session) below.
- **Format-checked**: Email (`EMAIL_RE`), Phone (`PHONE_RE` — 7–15 digits, optional leading `+`).
- **Subject required only for teaching staff** (`staff_type === 'teaching'`) — non-teaching rows can leave it blank.
- Note the UI's own required-field list is **stricter than the server**: the client marks Email required, but the server (`POST /api/teachers/bulk`) only actually requires `name` and `phone` — email is genuinely optional server-side. A row submitted with no email via a route other than this UI (or via a UI bug/future change) is fully accepted by the API; the client-side requirement is a UX guardrail steering admins toward always giving new staff a working login, not a server-enforced rule.
- **Subject dropdown**: sourced the same way as `TeachersManagement.tsx`'s edit form — `GET /api/school/subjects?school_id=` first (the school's own subscribed-subject catalog from the Syllabus Customizer), falling back to `GET /api/platform/subjects` (the full platform master catalog) if the school has none. An "Other (type manually)…" option switches that row into free-text mode, tracked per-row in a `subjectInputMode` state object that's re-indexed on row deletion so a later row's manual/dropdown choice doesn't silently reattach to the wrong row after a delete.
- **Teaches Grades**: an inline multi-select grade picker (`InlineGrades`), shown only for teaching staff; leaving it blank is explicitly flagged with an amber "No grades = teaches all" warning once a name has been typed for that row.

### 5a. Name validation (new this session)

A shared module, `lib/nameValidation.ts`, exports `isValidName(value)` and `NAME_INVALID_MESSAGE`:

```ts
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u
export function isValidName(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (v.length > 100) return false
  return NAME_RE.test(v)
}
export const NAME_INVALID_MESSAGE = 'Only letters, spaces, and \' . - are allowed — no numbers or symbols'
```

The regex requires the value to start with a letter-or-mark, then allow any run of letters, marks, whitespace, apostrophe, period, or hyphen — rejecting digits and any other symbol. `\p{M}` (Unicode "Mark" category — combining diacritics/vowel signs) is included alongside `\p{L}` (letters) specifically because Indic scripts (Devanagari, Telugu, Tamil, and others) spell most names using vowel signs/matras that Unicode classifies as marks, not letters in their own right — e.g. the Telugu name सुनीता is composed of स + ु (a combining mark) + न + ी (a combining mark) + त + ा (a combining mark). A regex using `\p{L}` alone, without `\p{M}`, would silently reject nearly every real name written in those scripts, since the mark codepoints wouldn't match `\p{L}` even though they're an inseparable part of how the name is spelled.

**This validator is shared verbatim across staff, student, and parent name fields, front-end and back-end** — one module, one rule, applied at every layer so a value that passes the client can never be rejected by the API with a different rule, and vice versa. For staff specifically, it's wired into three places (verified in the current source):

- **`StaffOnboarding.tsx`'s `rowErrors(row)`**: `if (!row.name.trim()) errs.push('Name required'); else if (!isValidName(row.name)) errs.push(\`Name: ${NAME_INVALID_MESSAGE}\`)` — an invalid (but non-empty) name produces its own distinct error message rather than being lumped in with "Name required."
- **`StaffOnboarding.tsx`'s `cellCls(row, field)`**: the Name cell renders with the red-bordered/red-background error style (`inputErrCls`) if `!row.name.trim() || !isValidName(row.name)` — a name that fails the pattern is visually flagged the same way an empty one is, once `showErrors` is true (i.e., after a submit attempt).
- **`app/api/teachers/bulk/route.ts`**: per-row, immediately after the existing `!t.name?.trim()` required check and before the phone check — `if (!isValidName(t.name)) { errors.push({ row: i + 1, message: \`${t.name.trim()}: ${NAME_INVALID_MESSAGE}\` }); continue }`. This runs before format validation of email/phone, so an invalid name short-circuits the row before any other check.
- **`app/api/teachers/[id]/route.ts` PUT handler**: `if (typeof name === 'string' && name.trim() && !isValidName(name)) return NextResponse.json({ error: \`Name: ${NAME_INVALID_MESSAGE}\` }, { status: 400 })` — only checked if a non-empty `name` is actually present in the request body (an edit that doesn't touch `name` at all is unaffected), and rejects the whole PUT with a 400 rather than silently dropping just the name field.

### The real submit

`handleSubmit()` re-validates every row client-side (`rowErrors()`), then posts the whole batch to `POST /api/teachers/bulk` in one call — there is no pre-submit duplicate-preview modal equivalent to the student flow's `check-duplicates` dry run; duplicate detection for staff happens only inside the real bulk-insert request itself.

On response: failed rows (present in `data.errors`) are kept in the grid (matched back by 1-indexed row number) so the admin can correct and resubmit without retyping everything; successful rows are cleared. The success banner shows `{inserted} staff member(s) onboarded` plus the first row's `employee_id` as a sample, and lists every per-row error inline. `onRefresh` (which also switches the visible tab back to the Staff Directory) is deliberately deferred to the banner's own "Dismiss" button rather than firing immediately — the same pattern as `StudentOnboarding.tsx`'s "Done" button, so the admin has a chance to actually read the result before the tab switches away.

**No credentials-shown-once modal exists for staff onboarding** — unlike the student flow's "Enrollment Complete — Credentials" modal with its Copy-All button and stat tiles, the staff bulk-insert response here only surfaces `inserted` count, the first employee ID, and any per-row errors. The generated temp password is never displayed anywhere in this screen; it is delivered exclusively via email/WhatsApp and is otherwise not recoverable through this UI.

### Was the Reset Credentials UI removed from the staff flow?

**Yes — removed in this session, matching the student side.** `TeachersManagement.tsx` previously contained a `CredentialsPanel` component (a dedicated "Credentials" main-tab, sibling to "Staff Directory"), with a search box and a per-teacher "Reset" button that called `POST /api/teachers/{id}/reset-credentials` and displayed the returned plaintext password inline. That whole tab, its toggle, and the component have been deleted — the Staff Directory now renders unconditionally with no Directory/Credentials switcher at all. The backing API route (`POST /api/teachers/[id]/reset-credentials`) still exists and still works if called directly, but there is no UI anywhere that calls it anymore. The only ways left to get a teacher a working password are: fresh onboarding, reactivation (§9), or the teacher's own self-service forgot-password flow.

---

## 6. School Admin: the Staff/Teachers directory

**Screen:** `app/school-admin/components/TeachersManagement.tsx`

### Layout

No main-tab switcher anymore — the roster view described below renders directly.

### Staff Directory

- **Type tabs**: Teaching Staff / Non-Teaching Staff, each with a live count badge.
- **Status filter**: Active / Inactive / Removed / All, with count badges for Inactive and Removed.
- **Department filter** (teaching staff only), derived from the currently-filtered set.
- **Search** by name or employee ID.
- Teaching staff are grouped into department sections (`grouped` — keyed by `department || 'General'`); non-teaching staff render as one flat list.
- Each `TeacherCard` row shows: avatar, name (struck through if removed), a "CT: Gr.X-Y" badge if this teacher is a class teacher, a "Gr: ..." badge for `teaches_grades`, Inactive/Removed status pills, employee ID, subject, and a Teaching/Non-Teaching type pill. An inactive row shows an inline **Reactivate** button directly on the card (`data-testid="staff-reactivate-{id}"`) that PUTs `{ status: 'active' }` — the same reactivation code path as the detail modal's toggle.

### Detail modal — Profile / 360° View sub-tabs

- **Profile (view mode)**: Subject, Department, Staff Type, Qualification, Date of Joining, Email, Phone, Teaches Grades — each field only rendered if non-empty.
- **Profile (edit mode)**: Name, Email, Phone, Department, Qualification as plain inputs; Staff Type as a select; Teaches Grades via the same `GradesDropdown` component used at onboarding.
  - **Subject dropdown editing** (added in an earlier session, confirmed unchanged this session): sourced from `GET /api/school/subjects?school_id=` (falling back to `GET /api/platform/subjects`), same source/fallback pattern as `StaffOnboarding.tsx`'s Subject field. An "Other (type manually)…" escape hatch matches onboarding's. The code comment is explicit about scope: *"This is teachers.subject only — the per-class assignments made in Class Management (class_subjects) are a separate, free-text 'other subjects taught' record and are never affected by this dropdown."*
  - Client-side `validateSave()`: name required, phone format-checked (`PHONE_RE`), email format-checked (`EMAIL_RE`) if present — matches the onboarding grid's own regexes.
- **360° View**: four stat tiles (Periods/Week, Tasks Assigned, Total Leaves, Pending Leaves, pulled from `/api/tasks`, `/api/leave-requests`, `/api/timetable`) plus a read-only recap of Subject/Department/Teaches Grades/Class Teacher assignment.
- **Weekly Timetable toggle**: fetches `/api/timetable?teacher_id=` and today's `/api/substitutes?...substitute_teacher_id=` in parallel, rendering a period-by-day grid with substitute-duty highlighting.

### Actions and the routes each calls

| Action | Route | Notes |
|---|---|---|
| **Edit Details** → Save Changes | `PUT /api/teachers/{id}` | Routine contact-info edit path (see [§3](#3-every-api-route-in-detail)) |
| **Deactivate** / **Reactivate** (toggle) | `PUT /api/teachers/{id}` with `{ status: 'active' \| 'inactive' }` | `handleToggleStatus()` — drives both the `becomingInactive` unlink path and the `becomingActive` reactivation path depending on direction |
| **Remove from School** | `GET /api/teachers/{id}?consequences=true` (preview) then `DELETE /api/teachers/{id}` (confirm) | Shows a consequences dialog (class-teacher-of / subjects-teaching / timetable-slot counts) before the actual delete; a post-removal toast summarizes what was unlinked |
| **Restore Teacher** (on a `removed` record) | `PUT /api/teachers/{id}` with `{ status: 'active' }` | Same reactivation code path as Reactivate — a removed teacher restored this way also gets a fresh password + reactivation notification, identical treatment to an inactive teacher being reactivated |

---

## 7. Credentials — generation, delivery, and recovery

- **Temp password length**: `generateTempPassword(10)` — **10 characters** for staff, at every issuance point (bulk onboarding, PUT reactivation, and the dedicated reset-credentials route all call it with `10`). This differs from the student feature, where students get 8-character temp passwords and parents get 10 — staff match the parent/10-char length, not the student/8-char one.
- **The mandatory-phone rule**: every onboarding row requires a phone (`!t.phone?.trim()` is a hard row-level error server-side), unlike students and parents where phone is always optional. Phone's role for staff is twofold: it's the WhatsApp delivery channel, and it participates in a school-scoped uniqueness index (`idx_teachers_school_phone_unique`) intended to make it a safe per-school lookup key — though today it is **not** actually used as a login credential anywhere; only email is.
- **Why email is required for a working login, with no fallback identifier**: `POST /api/teacher/auth/login` looks up exclusively by `LOWER(email)`. There is no server-generated fallback identifier analogous to the student `roll_number` (a system-assigned `wlyl-stu-*` login ID that every student gets regardless of whether they have an email). A teacher onboarded with a phone but no email gets a real row — employee ID, subject, class-assignment eligibility, everything — but `password_hash` stays NULL forever until an admin manually adds an email (there is no route in this codebase that will generate a password for an email-less teacher; `reset-credentials` explicitly refuses with `"This teacher has no email on file — add one before resetting their password"`). This is a genuine, permanent limitation for that account, not a temporary state that resolves itself.
- **Full onboarding delivery**: email (`sendTeacherWelcomeEmail`, gating condition for whether a password exists at all) plus a bonus `staff_credentials` WhatsApp message if a phone is on file (always true, since phone is mandatory) — see [§3](#3-every-api-route-in-detail).
- **Removal notification**: `sendStaffRemovedEmail` (if email present) + `staff_removed` WhatsApp (if phone present), fired after the soft-delete commits.
- **Reactivation's fresh-password issuance**: a brand-new 10-char temp password every time, regardless of whether the previous one was ever used or changed — `sendStaffReactivatedEmail` + `staff_reactivated` WhatsApp, each gated independently on email/phone presence.
- **The routine-edit's notify-without-reset behavior**: an email or phone correction (not paired with a status change in the same request) leaves `password_hash` completely untouched and instead notifies both the old and new contact value via `sendStaffContactChangedEmail` / a `contact_info_changed` WhatsApp message.
- **Forgot-password's dual channel**: email is the functional recovery mechanism (the reset link only ever goes to an email address, since the lookup itself is by email); WhatsApp is purely a convenience *delivery* channel for that same link when a phone is also on file — it does not offer any way to recover an account that has no email, since the forgot-password lookup itself requires an email to find the account in the first place.
- **Ongoing recovery is self-service-only**, matching the student feature's design intent: the manual Credentials-tab Reset button was removed from `TeachersManagement.tsx` this session. The only UI-reachable recovery path left is self-service forgot-password (`POST /api/teacher/auth/forgot-password`) or reactivation (§9), both of which deliver via email + WhatsApp. `POST /api/teachers/[id]/reset-credentials` still exists as an API route but has no caller anywhere in the UI.

---

## 8. Class assignment relationship — how staff onboarding connects to Class Management

`teachers.subject` is just the onboarded "primary" subject — a single `VARCHAR(100)` column, set at onboarding time and editable afterward only through the Staff Directory's dropdown-or-free-text Subject field. It has no direct bearing on which classes or subjects a teacher actually teaches day to day.

The real source of truth for "who teaches what, in which class" is the `class_subjects` table (`class_id`, `subject_name`, `teacher_id`), populated and edited exclusively through **Class Management** — a separate screen from both Staff Onboarding and the Staff Directory. When a class/subject row is created there without an explicit `teacher_id`, `matchTeacher()` (`lib/matchTeacher.ts`) runs a three-level fallback match against the school's teacher list purely by comparing `subject_name` strings: (1) exact case-insensitive match against a teacher's `teachers.subject`, (2) partial containment either direction (e.g. "Maths" matches a teacher whose `subject` is "Mathematics"), (3) shared significant words split on `[\s/,&]+` (e.g. "Social Studies" matches "Social Science" via the shared word "social"). This is the only place `teachers.subject` feeds back into actual class-level teaching assignments — and even then, only as an automatic best-effort fallback when Class Management is given no explicit teacher_id; an explicit assignment there always wins outright.

`class_subjects`'s per-class subject names are otherwise entirely free text, entered directly in Class Management, and are **never synced back** to `teachers.subject`. TeachersManagement's onboarding-level Subject dropdown edit only ever writes to `teachers.subject` — it has no code path that touches `class_subjects` at all. This split is a deliberate product decision, restated verbatim in a code comment in `TeachersManagement.tsx`: the onboarding-level "primary subject" is dropdown-editable and drawn from a controlled catalog (the school's subscribed subjects, or the platform master list as fallback) specifically to avoid typo drift, while Class Management's per-class subject assignments remain free-text and independent, so a teacher legitimately covering an unusual or one-off subject in one class doesn't force their whole onboarding-level identity to match it.

### 8a. Auto-assign on onboard/edit — the reverse direction (new this session)

[§8](#8-class-assignment-relationship--how-staff-onboarding-connects-to-class-management) above describes `matchTeacher()` — subject→teacher matching, run when Class Management creates a `class_subjects` row with no explicit teacher. This session added the mirror-image direction, teacher→subjects, so a `class_subjects` row left unfilled at creation time (because no teacher existed for that subject yet) gets picked up automatically the moment a matching teacher is later onboarded or edited, rather than sitting unfilled until an admin notices.

**`findAutoAssignableSubjects()`** (`lib/matchTeacher.ts`), alongside a private `subjectMatchesTeacher()` helper and a private `gradeInRange()` helper:

```ts
function subjectMatchesTeacher(subjectName: string, teacherSubject: string): boolean {
  const sn = subjectName.trim().toLowerCase()
  const ts = teacherSubject.trim().toLowerCase()
  if (sn === ts) return true
  if (ts.includes(sn) || sn.includes(ts)) return true
  const snWords = sn.split(/[\s/,&]+/).filter(w => w.length > 2)
  const tWords = ts.split(/[\s/,&]+/)
  return snWords.some(sw => tWords.some(tw => tw.includes(sw) || sw.includes(tw)))
}

function gradeInRange(teachesGrades: string | null, grade: string): boolean {
  if (!teachesGrades || !teachesGrades.trim()) return true
  return teachesGrades.split(',').map(g => g.trim().toUpperCase()).includes(grade.trim().toUpperCase())
}

export function findAutoAssignableSubjects(
  teacher: { subject: string | null; teaches_grades: string | null },
  unfilledSubjects: ClassSubjectRow[]
): ClassSubjectRow[] {
  if (!teacher.subject?.trim()) return []
  return unfilledSubjects.filter(s =>
    gradeInRange(teacher.teaches_grades, s.grade) &&
    subjectMatchesTeacher(s.subject_name, teacher.subject as string)
  )
}
```

`subjectMatchesTeacher()` runs the exact same 3-level fallback logic as `matchTeacher()`'s per-candidate check (exact case-insensitive match → partial containment either direction → shared significant word split on `[\s/,&]+`, words `> 2` chars only) — just phrased as "does this one subject match this one teacher" instead of "find the best teacher for this subject among many." The additional filter `matchTeacher()` doesn't have: **grade eligibility** — a match is only returned if `gradeInRange(teacher.teaches_grades, s.grade)` is true, so a teacher restricted to grades 6–8 will never be auto-assigned to a matching Grade 9 subject, even if the subject-name match is exact. An unrestricted teacher (`teaches_grades` empty/null) matches every grade.

**Wired into `POST /api/teachers/bulk`** (staff onboarding): after each successful teaching-staff insert where `teacher.subject` is set, the route queries every `class_subjects` row at the school with `teacher_id IS NULL` (joined to `classes` for `grade`, filtered to `deleted_at IS NULL`), runs them through `findAutoAssignableSubjects()`, and for each match `UPDATE`s `class_subjects.teacher_id`. It then also conditionally fills the matching `class_timetable` slot for that subject — but only if doing so wouldn't double-book the teacher at the same day/period in a different class already (`NOT EXISTS` subquery checking `other.teacher_id = $1` at the same `day_of_week`/`period_number`, excluding break rows) — the same conflict-safe propagation `POST /api/classes/[id]/subjects` already uses when a subject is manually assigned a teacher. Relevant response caches (`subjects:class:{id}`, `timetable:class:{id}`, and `health:{school_id}` if anything matched) are invalidated per affected class.

**Wired into `PUT /api/teachers/[id]`** (staff edit): the same scan-and-assign logic runs again, but only if the PUT request actually changed `subject` and/or `teaches_grades` relative to the row's prior values (`subjectChanged`/`teachesGradesChanged`, computed by comparing the trimmed new value against the existing one) — an edit that leaves both fields untouched never re-triggers the scan. It's further gated on the teacher's post-update `status === 'active'` and `staff_type === 'teaching'` and a non-empty `subject` — a deactivated, non-teaching, or subject-less teacher is never scanned.

**An explicit assignment made directly in Class Management always wins outright** — auto-assign only ever touches rows where `teacher_id IS NULL`; there is no code path anywhere that overwrites a manually-set `teacher_id` with an auto-match.

This was **live-verified this session via curl**: onboarding a "Telugu Teacher" with `teaches_grades: "6,7,8"` against seeded unassigned Telugu `class_subjects` rows in grades 6, 7, 8, and 9 confirmed grades 6–8 auto-assigned correctly and grade 9 stayed unassigned (correctly excluded by the `gradeInRange` check). Widening `teaches_grades` to include 9 via a follow-up `PUT` then retroactively picked up grade 9's previously-unfilled subject, confirming the `teachesGradesChanged` trigger on the PUT route works as designed.

---

## 9. Auth model — who can do what

Two different guard styles are used across staff-onboarding-adjacent routes — not one consistent helper, and the split does not map cleanly onto "create vs. read/update":

1. **`requireSchoolAdmin()`** — role check only (school_admin/principal/vice_principal). Callers must manually re-check tenant match afterward. Used by:
   - `POST /api/teachers/bulk` (with a manual `admin.schoolId === Number(school_id)` check)
   - `POST /api/teachers/[id]/reset-credentials` (with a manual `teacher.school_id !== admin.schoolId` check)
2. **`requireFeeAccess(school_id)`** — folds role + tenant match into one call, additionally admits `platform_admin` for any school. Used by:
   - `GET /api/teachers/[id]`
   - `PUT /api/teachers/[id]`
   - `DELETE /api/teachers/[id]` (including its `?consequences=true` preview mode)
   Same generically-named-helper reuse pattern already documented in the student-onboarding and syllabus feature reference docs — none of these three routes are fee-related; the helper is reused purely for its bundled tenant-check convenience.
3. **`getAnySession()`** — admits any logged-in role. Used by `GET /api/teachers` (the directory listing), with an additional manual check that a non-platform-admin session's `schoolId` matches the requested `school_id`, and — separately — that the *effective* query scope is derived from the session itself, not from the presence of the `school_id` param (closing the same class of "omitted param falls through to an unscoped, all-schools query" bug documented for the student feature).
4. **No guard at all**: `POST /api/teachers/[id]/change-password` — substitutes "knowing the current password" (bcrypt-verified) as its de facto authorization, with no separate check that the caller is that teacher's own logged-in session. `POST /api/teacher/auth/login` and `POST /api/teacher/auth/forgot-password` are of course unauthenticated by design (that's their purpose).

---

## 10. Teacher-side academic year selector (new this session)

This is genuinely new functionality — not a bug fix, not a variant of an existing pattern — added to the Teacher portal this session, currently wired **only** for the Syllabus module.

### Where it lives and how it's seeded

`app/teacher/page.tsx` holds four pieces of state: `academicYear` (an ambient display value shown in the top-bar badge), `schoolCurrentYear` (the school's own current year — never changes based on what the teacher chooses to view, used only to compute read-only status), `availableYears` (the full list of years for the dropdown), and `selectedAcademicYear` (what the teacher has independently chosen to *view*).

On teacher-identity load, one `useEffect` fires two fetches in parallel:
- `GET /api/academic-year/current?school_id=` → seeds `academicYear`, `schoolCurrentYear`, **and** `selectedAcademicYear` all to the school's current year label.
- `GET /api/academic-years?school_id=` → seeds `availableYears` with `{id, label, is_current}` for every year the school has.

**Both `schoolCurrentYear` and `selectedAcademicYear` reset to the school's current year on every fresh login** — this is session-only React state, never persisted anywhere (no localStorage, no cookie, no DB write of the teacher's last-viewed year). Logging out and back in always starts fresh at the current year, regardless of what a teacher was viewing in a previous session.

`isViewingPastYear` is computed inline: `!!selectedAcademicYear && !!schoolCurrentYear && selectedAcademicYear !== schoolCurrentYear`.

### The Profile-tab dropdown

`TeacherProfile.tsx` receives `availableYears`, `selectedAcademicYear`, `schoolCurrentYear`, and an `onSelectYear` callback (which is just `setSelectedAcademicYear` passed straight through from `page.tsx`). It renders a plain `<select>` of every year in `availableYears` — **view-only**, no add/create control anywhere in this dropdown; creating new academic years remains exclusively a school-admin capability elsewhere in the app. When the selected value differs from `schoolCurrentYear`, an inline "👁 View only — {year} is closed" notice renders beneath the dropdown.

### How it threads down

`selectedAcademicYear` and `isViewingPastYear` are passed from `page.tsx` into `TeacherSyllabus` as `academicYear`/`readOnly` props. `TeacherSyllabus.tsx` passes both straight through, unchanged, into `ClassView` (confirmed: `academicYear={academicYear} readOnly={readOnly}` at the point `TeacherSyllabus` renders `ClassView`... more precisely, into `SyllabusTracking`, described next).

**`SyllabusTracking` is a separate exported component defined *inside* `ClassView.tsx`** (`export function SyllabusTracking({ classId, schoolId, grade, teacher, isClassTeacher, allowedSubjects, academicYear, readOnly, ... })` at line 506), distinct from the file's default export `ClassView` itself (`export default function ClassView({ ..., academicYear, readOnly })` at line 1231). `ClassView` receives the same two props and forwards them into its own rendering of `SyllabusTracking` inside its Syllabus tab.

### What `readOnly` actually gates

`SyllabusTracking`'s `loadSyllabus()` builds its fetch URL with `academicYear ? &academic_year=${encodeURIComponent(academicYear)} : ''` appended, calling `GET /api/syllabus`. This query param **already existed** on that route before this session's change (confirmed in `app/api/syllabus/route.ts`: `const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)`, used both for the main topic-progress query and for auto-creating `school_subjects` rows) — this session's work is entirely the new UI plumbing that actually populates that param from a teacher-controlled selector, not a change to the API route itself.

When `readOnly` is true:
- The **mark-covered button** is `disabled={isMarking || readOnly}` with its title switching to `"Read-only — viewing a past academic year"` — **disabled, not hidden**; it remains visible in the UI, just inert.
- The **add-topic control** (`{isExpanded && !readOnly && (...)}`) and the **add-chapter control** (`{!readOnly && <div className="pt-1">...}`) are both **hidden entirely**, not merely disabled — they don't render at all in the DOM when `readOnly` is true.
- The **bootstrap-import/bootstrap-count UI block** (for a subject with zero chapters) is gated `{currentSubject && currentSubject.chapters.length === 0 && !readOnly && (...)}` — also fully hidden, not disabled, when viewing a read-only year.

### Explicit scope statement

**This mechanism is wired only for the Syllabus module.** Attendance, Tasks, and Exams are not year-scoped by `selectedAcademicYear`/`readOnly` at all as of this session — those modules' own components receive no such props from `page.tsx`, and their own data-fetching has no equivalent `academic_year` query param wiring tied to this selector. Extending the same pattern to those modules is explicitly future work, not started here.

---

## 11. End-to-end scenarios, step by step

### Scenario A: Normal bulk onboarding of 3 teachers with full contact info

1. Admin fills three rows in the manual grid, each with name, email, phone, and (for teaching staff) a subject picked from the dropdown.
2. Client-side `rowErrors()` passes for all three; `handleSubmit()` posts to `POST /api/teachers/bulk`.
3. Server re-validates format, checks the batched school-scoped phone dup query and the global email dup query — no hits.
4. For each row, in one transaction: `employee_id` generated and inserted (retrying up to 5 times only on an employee-ID collision), `tempPassword` generated (email present on all three), `password_hash` computed, row inserted.
5. After commit: each of the three gets `sendTeacherWelcomeEmail` plus a `staff_credentials` WhatsApp message (phone is mandatory, so all three qualify).
6. Response: `{ inserted: 3, teachers: [...], errors: [] }`. The success banner shows the count and the first employee ID; no credentials modal — the admin relies entirely on the delivered email/WhatsApp messages to actually see a password. There is no manual on-screen recovery path anymore if delivery fails — only forgot-password or reactivation.

### Scenario B: A teacher removed then reactivated

1. Admin clicks **Remove from School** on an active teacher who is a class teacher for Grade 8-A and teaches two subjects across other classes. The consequences preview (`GET .../[id]?consequences=true`) shows this before confirming.
2. Confirming triggers `DELETE /api/teachers/[id]`: `class_timetable`, `class_subjects`, and `classes.class_teacher_id` are all nulled for this teacher (along with every other unlink listed in [§3](#3-every-api-route-in-detail)); `status` becomes `'removed'`, `removed_at = NOW()`. Removal email/WhatsApp fire.
3. At this point Grade 8-A has no class teacher, and the two subjects this teacher taught show as unassigned in Class Management — exactly as the pre-removal consequences preview warned.
4. Later, the admin finds this teacher in the "Removed" status filter and clicks **Restore Teacher**. This PUTs `{ status: 'active' }`.
5. Server-side: `becomingActive` is true (existing status was `'removed'`). A fresh 10-char temp password is generated and hashed; `removed_at` is cleared to NULL. `sendStaffReactivatedEmail` + `staff_reactivated` WhatsApp fire with the new password.
6. **Their old class-teacher assignment and subject assignments are not restored** — reactivation only restores login access. The admin must go back into Class Management and re-assign Grade 8-A's class teacher and the two subjects explicitly; nothing in the reactivation flow does this automatically.
7. The teacher logs in with the brand-new password (their old one no longer works — it was overwritten, not merely deactivated).

### Scenario C: A school admin fixes a typo in a teacher's phone number

1. Admin opens the teacher's detail modal, clicks Edit Details, corrects the phone number, clicks Save Changes. `status` is not part of this request body (or is submitted unchanged) — so `becomingActive` is false.
2. Server: `phoneChanged` evaluates true (`!becomingActive && trimmedPhone && trimmedPhone !== existing.phone`). The same-school phone-duplicate check runs and finds nothing.
3. `tempPassword` is `null` (only generated `if (becomingActive)`) — `password_hash` in the `UPDATE`'s `COALESCE` stays exactly as it was. **The password does not change.**
4. Both the new phone number and the old one (if it existed and differs) receive a `contact_info_changed` WhatsApp message — the code explicitly loops `notifyPhone(teacher.phone)` then, conditionally, `notifyPhone(existing.phone)`.
5. The teacher can keep logging in with their existing password; the only thing that happened is two numbers (old and new) got a heads-up that this account's phone was changed.

### Scenario D: A teacher with no email at all is onboarded

1. Admin fills a row with name and phone only — leaves Email blank. The client-side grid actually flags this as an error ("Email required — login credentials will be sent here") and blocks submission through the normal UI flow; but if bypassed (a future UI change, a direct API call, or a CSV/Excel import that doesn't populate the client validation the same way), the server itself has no such requirement — only `name` and `phone` are mandatory server-side.
2. `POST /api/teachers/bulk` accepts the row: `email` is `null`, so `tempPassword` is also `null`, so `password_hash` stays `NULL`. The row inserts successfully with a real `employee_id`, subject, department, etc.
3. No email is sent (there's nowhere to send it). No WhatsApp `staff_credentials` message is sent either — the gating condition is `if (tempPassword && email)`, and both are falsy here, so **even the phone-delivered copy of credentials that the prompt might expect never actually fires**, because there is no password to deliver in the first place. (This is a subtlety worth flagging: an email-less teacher gets *no* credential delivery at all, on any channel, at onboarding time — not "a WhatsApp-only copy," because no credentials exist yet to send.)
4. This teacher can never log in — `/api/teacher/auth/login`'s lookup finds the row by email, but there is no email to look up by in the first place; even if there were, `password_hash IS NULL` would refuse with "Account not activated."
5. **With the manual Credentials-tab reset button now removed, activating this account takes a different two-step path than it used to.** Simply editing the teacher's record to add an email is not enough on its own — a routine PUT edit only sets `emailChanged`/notifies the new address, and never generates a password unless `becomingActive` is also true (see §5's PUT precedence rules). The working sequence is: (a) add the email via a normal edit, then (b) deactivate the teacher (`status: 'inactive'`) and immediately reactivate them (`status: 'active'`) — that second transition is what actually sets `becomingActive`, generates a fresh temp password, and delivers it via `sendStaffReactivatedEmail` + WhatsApp. This is less direct than the old one-click Reset button, and worth knowing about before assuming an email-less teacher's account is unrecoverable.

### Scenario E: A teacher's forgot-password when they only remember checking WhatsApp, not email

1. The teacher has both an email and a phone on file, and has genuinely forgotten their password. They open `/teacher/forgot-password` and submit their email address (required — the form has no other way to identify the account).
2. `POST /api/teacher/auth/forgot-password` finds the row by `LOWER(email)`, generates a reset token (1-hour expiry), inserts it into `password_reset_tokens` with `role: 'teacher'`.
3. `sendPasswordResetEmail` fires to their email — but if their email inbox is slow, unchecked, or the address is one they rarely look at, this could easily go unnoticed.
4. Because `teacher.phone` is present, a `password_reset` WhatsApp message with the same reset link also fires — today, per the scaffold, this is logged as a `queued` audit row and console line rather than actually delivered, but once WhatsApp goes live this is exactly the delivery path designed to solve this scenario: the teacher checks WhatsApp (which they actually monitor) rather than a rarely-checked inbox, clicks the link, and resets their password on the standard `/teacher/reset-password?token=...` screen.
5. Crucially, the reset link's *content* is identical either way — WhatsApp here is purely a redundant delivery channel for the same token-bearing URL, not an alternate authentication mechanism. A teacher with no email at all still has no way to trigger this flow in the first place, since the lookup itself requires an email.

### Scenario F: A teacher switches their Profile year selector to a closed prior year and tries to mark a topic covered

1. Teacher opens Profile, sees the year dropdown (seeded with `availableYears`, currently showing the school's current year, e.g. "2026-27"), and selects a prior year, e.g. "2025-26".
2. `onSelectYear` calls `setSelectedAcademicYear('2025-26')` in `page.tsx`. `isViewingPastYear` recomputes to `true` (`'2025-26' !== schoolCurrentYear` which is still `'2026-27'`). The top-bar badge switches to an amber "👁 2025-26" pill with a tooltip explaining it's closed and read-only.
3. The teacher navigates to Syllabus. `TeacherSyllabus` → `ClassView` → `SyllabusTracking` all receive `academicYear="2025-26"` and `readOnly={true}`.
4. `loadSyllabus()` refetches `GET /api/syllabus?...&academic_year=2025-26`, returning that year's topic-progress snapshot rather than the current year's.
5. The teacher finds a topic and clicks what looks like the "Mark Complete" button. **Nothing happens** — the button is rendered with `disabled={isMarking || readOnly}`, so `readOnly=true` alone is enough to make it inert regardless of `isMarking`'s value, and its title attribute reads "Read-only — viewing a past academic year" on hover, explaining why.
6. The teacher also notices there's no "+ Add Subtopic" button under any chapter and no "+ Add Chapter" button at the bottom of the list, even though those exist when viewing the current year — both are conditionally unrendered (`!readOnly`), not just disabled, so there's no inert button to even hover over for an explanation there; the read-only badge in the top bar is the only cue.
7. To make any actual change, the teacher must go back to Profile and switch the selector back to "2026-27" — nothing else in the portal (no auto-timeout, no separate "exit read-only" button) reverts `selectedAcademicYear` except that same dropdown or a fresh login.

---

## 12. Known gaps and quirks

- **`idx_teachers_email_unique` has been observed to fail to create**, logging `[migration] Skipped idx_teachers_email_unique — likely pre-existing duplicate active teacher emails. Resolve manually...` — this is stated in the migration code's own catch handler and was seen this session; not independently reconfirmed against a live database in this pass, but flagged here because if it is currently skipped, the *only* thing preventing a new duplicate active email from being created is the app-level `SELECT`-then-check logic in the bulk and PUT routes — a genuine TOCTOU race (two near-simultaneous requests both passing the `SELECT` check) could still slip a duplicate through until the underlying dirty data is manually resolved and the index successfully created.
- **A teacher with no email can never log in — permanently, with no fallback identifier.** Unlike students (who always get a system-generated `roll_number` login regardless of email/phone presence), there is no equivalent server-generated login credential for teachers. Phone is mandatory at onboarding but is never checked at login. This is a real, current, by-design limitation, not a bug — but it means an email-less teacher's account is inert until an admin manually adds an email and then separately triggers a credential reset (two distinct admin actions, not one).
- **The year-selector mechanism ([§10](#10-teacher-side-academic-year-selector-new-this-session)) is Syllabus-only.** Attendance, Tasks, and Exams have no equivalent read-only/year-scoping wiring yet — a teacher viewing a "closed" past year via the Profile dropdown can still freely mark attendance, create tasks, or enter exam marks with no read-only gating in those modules, because those components never receive `academicYear`/`readOnly` props at all. Whether that's an oversight or deliberately scoped to Syllabus first is not stated anywhere in the code; it is simply not implemented for those modules yet.
- **`reset-credentials` is now an orphaned API route** — the manual Credentials-tab Reset button that called it was removed this session, matching the student side's earlier removal. The route itself is untouched and still functions if called directly, but nothing in the UI reaches it anymore. `change-password` (self-service, requires the current password) is unrelated to this and remains live and used from `TeacherProfile.tsx`.
- **An email-less teacher's account recovery got a step harder, not easier, from this removal** — see §10 Scenario D. There's no longer a one-click way to hand them a password after the fact; it now requires a deactivate→reactivate round-trip.
- **An onboarding row with no email produces zero credential delivery on any channel**, not a "WhatsApp-only" fallback — because `tempPassword` itself is only generated when `email` is present, the WhatsApp send (gated on `tempPassword && email`, and further on `normPhone`) never fires for an email-less row either, even though phone is guaranteed present (it's mandatory). Anyone assuming a phone-only teacher at least gets their credentials over WhatsApp at onboarding time would be wrong — no credentials exist yet to send at all until a later, separate admin-triggered reset.
- **The reactivation-vs-routine-edit precedence rule is genuinely easy to miss when reading the PUT route quickly**: `emailChanged`/`phoneChanged` are computed as `!becomingActive && ...`, so a single request that both reactivates a teacher *and* changes their email/phone silently skips the routine-edit notification entirely (no `sendStaffContactChangedEmail`, no `contact_info_changed` WhatsApp) even though the new contact value is still saved. Only the reactivation email/WhatsApp fires. This is very likely intentional (the reactivation message already communicates "your login details are new"), but it's not documented anywhere in the code beyond the boolean expression itself, and a future maintainer adding a new field-changed notification elsewhere in this route should be aware this precedence pattern exists.
- **No pre-submit duplicate-preview endpoint exists for staff**, unlike the student feature's `check-duplicates` dry-run route and modal. A staff duplicate is only discovered at the moment of the real bulk-insert submission, surfaced as a per-row `errors[]` entry rather than a separate "N would be skipped" preview screen.
- **The Excel import path for staff genuinely works** (via `POST /api/teachers/parse-import`, real server-side ExcelJS parsing), unlike the student feature's `.xlsx` import which silently mis-parses because it's read client-side as plain text regardless of extension. This divergence is **still accurate after this session's changes** — if anything it's now simpler to reason about, since staff onboarding no longer has an extension-branching decision at all: `.xlsx` is the *only* file type the picker accepts (`accept=".xlsx"`) and the *only* path `handleFileImport()` calls (unconditionally, straight to `parseExcelFile()` → `POST /api/teachers/parse-import`). There is no more CSV/`.txt` client-side-parsed fallback to branch away from. Worth knowing about if debugging an import issue: staff `.xlsx` uploads are parsed server-side and should reflect real cell values; a staff CSV/paste import bug report should be treated with suspicion, since that intake path no longer exists in the UI at all.
- **CSV paste and CSV/`.txt` file import are gone from staff onboarding** — a genuine, deliberate feature reduction this session, not a regression: the only two ways to onboard staff now are the manual grid and a `.xlsx` upload. Anyone maintaining muscle memory for pasting a CSV blob into this screen, or automation that used to construct a `.csv`/`.txt` file for the old import button, needs to switch to either typing rows manually or generating a real `.xlsx` (the downloadable Excel Template, or any spreadsheet tool's own `.xlsx` export).
- **The Excel Template button no longer depends on the school having subscribed subjects.** Previously hidden until `subscribedSubjectNames.length > 0`, it's now always present — a school with zero subscribed subjects still gets a template, just one whose Subject column dropdown is sourced from the full platform master catalog (`master_subjects`) instead of a school-specific list. This mirrors the on-screen Subject dropdown's own existing fallback behavior, just extended to gate the template button's visibility too.

---

## 13. Quick-reference glossary

| Term | Meaning |
|---|---|
| **`employee_id`** | Server-generated staff ID, format `wlyl-tea-{school-slug}-{5-digit-random}` — unique per school (not globally) via `idx_teachers_school_employee_id_unique`, with a 5-attempt collision-retry loop on insert |
| **`teachers.subject`** vs **`class_subjects`** | `teachers.subject` is the single onboarding-level "primary subject," dropdown-editable from a controlled catalog. `class_subjects` is the real per-class teaching-assignment table, set via Class Management, free-text, and never synced from/to `teachers.subject` |
| **`matchTeacher()`** | `lib/matchTeacher.ts` — a 3-level fallback subject-name matcher (exact → partial containment → shared significant word) used only when Class Management creates a class/subject row with no explicit `teacher_id`; an explicit assignment always overrides it |
| **`findAutoAssignableSubjects()`** | `lib/matchTeacher.ts` — the reverse direction of `matchTeacher()`: given one newly-onboarded/edited teacher, finds every unfilled `class_subjects` row at their school whose subject name fuzzy-matches (same 3-level rule) and whose grade falls within the teacher's `teaches_grades`. Wired into both `POST /api/teachers/bulk` and `PUT /api/teachers/[id]` — see [§8a](#8a-auto-assign-on-onboardedit--the-reverse-direction-new-this-session) |
| **`isValidName()` / `NAME_INVALID_MESSAGE`** | `lib/nameValidation.ts` — the shared name-format validator (letters + Unicode combining marks + spaces/apostrophe/period/hyphen, 1–100 chars) used identically across staff, student, and parent name fields, client and server. `\p{M}` is included alongside `\p{L}` so Indic-script names spelled with vowel-sign marks (Devanagari, Telugu, Tamil, ...) aren't rejected — see [§5a](#5a-name-validation-new-this-session) |
| **Reactivation** | `status` transitioning to `'active'` from either `'inactive'` or `'removed'` (`becomingActive`) — issues a brand-new 10-char temp password, sends `staff_reactivated` notifications, clears `removed_at`, but does **not** restore any previously-unlinked class/subject assignments |
| **The lighter inactive↔active pause** | `status` toggling to `'inactive'` (`becomingInactive`) — unlinks class/subject/timetable assignments the same as full removal, but issues no new password and sends no notification by itself; reversible via the same Reactivate action, which also restores login |
| **`becomingActive` / `becomingInactive`** | The two booleans computed at the top of the PUT handler, comparing the requested `status` against the row's existing `status` before any update runs — they gate which of the three PUT behaviors (routine edit / reactivation / becoming-inactive) actually executes |
| **Routine contact-info edit** | A PUT request that changes email and/or phone without changing `status` — password unchanged, both the old and new contact value are notified via `sendStaffContactChangedEmail`/`contact_info_changed` WhatsApp |
| **Teacher year selector** | The Profile-tab dropdown (`TeacherProfile.tsx`) letting a teacher independently choose which academic year to *view*, separate from the school admin's actual active year; resets to the school's current year every fresh login, session-only, currently wired only into the Syllabus module |
| **`isViewingPastYear`** | `selectedAcademicYear !== schoolCurrentYear` — drives the `readOnly` prop threaded into `TeacherSyllabus` → `ClassView` → `SyllabusTracking` |
| **`SyllabusTracking`** | A component exported separately from, but defined inside, `ClassView.tsx` — not `ClassView` itself. Receives `academicYear`/`readOnly` and is the component that actually disables the mark-covered button and hides the add-topic/add-chapter/bootstrap-import UI blocks |
| **WhatsApp scaffold** | `lib/whatsapp.ts` — every send logs a `whatsapp_messages` audit row with `status: 'queued'` and never reaches Meta's API; shared verbatim with the student-onboarding feature; a real integration is a self-contained follow-up change inside that one file |
| **Soft delete / removal** | `DELETE /api/teachers/[id]` — flips `status` to `'removed'`, sets `removed_at`, unlinks (never deletes) every class/attendance/exam/syllabus/doubts reference to this teacher, and notifies the teacher if they have an email/phone |
| **Credentials tab (removed)** | A dedicated "Credentials" main-tab with a manual per-teacher Reset button, formerly in `TeachersManagement.tsx` — removed this session to match the student directory's earlier removal. `POST /api/teachers/[id]/reset-credentials`, the route it called, still exists but is no longer reachable from any UI |
