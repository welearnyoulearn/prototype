# Student Onboarding Feature — Complete Reference

> **Flowchart:** https://claude.ai/code/artifact/3d918f8d-f7cc-4e3e-a35a-52422db7e316

> Last verified against code: 2026-09-03
> Scope: every part of the codebase that touches student onboarding — database tables, API routes, and UI screens across School Admin, Teacher, Student, and Parent portals.

This document explains student onboarding **inch by inch**: what each database table stores, what every API route accepts and returns, what every screen looks like and does, and how the pieces connect into complete end-to-end workflows. Read it top to bottom once if you're new to this part of the codebase.

---

## Table of Contents

1. [The big picture in one paragraph](#1-the-big-picture-in-one-paragraph)
2. [Database schema, table by table](#2-database-schema-table-by-table)
3. [Every API route, in detail](#3-every-api-route-in-detail)
4. [School Admin: the onboarding screen](#4-school-admin-the-onboarding-screen)
5. [School Admin: the Students directory](#5-school-admin-the-students-directory)
6. [Credentials — generation, delivery, and recovery](#6-credentials--generation-delivery-and-recovery)
7. [Portal enable/disable/re-enable — the automatic credential lifecycle](#7-portal-enabledisablere-enable--the-automatic-credential-lifecycle)
8. [Downstream reflections — where onboarded data is read](#8-downstream-reflections--where-onboarded-data-is-read)
9. [Auth model — who can do what](#9-auth-model--who-can-do-what)
10. [End-to-end scenarios, step by step](#10-end-to-end-scenarios-step-by-step)
11. [Known quirks and gaps](#11-known-quirks-and-gaps)
12. [Quick-reference glossary](#12-quick-reference-glossary)

---

## 1. The big picture in one paragraph

A school admin adds students either one at a time or in bulk, through a spreadsheet-like grid, a pasted CSV blob, or a downloaded Excel template. Every submission — single or bulk — funnels through the same core logic: validate required fields, check for duplicates against both the rest of the same batch and the existing roster, auto-create any missing class rows, insert the student, and **find-or-create a linked parent account** — sharing one parent record across siblings rather than creating a duplicate every time. Both the student and (if newly created) the parent get a real login and a one-time-shown temp password, delivered by email and, via a scaffolded (not-yet-live) WhatsApp channel, always displayed on screen. Whether credentials get created at all depends on a two-layer feature flag (`student-portal`/`parent-portal`, per-school override over a plan-tier default); if a school onboards students while a portal is off, nothing is lost — turning the portal on later, whether by the school admin's own button or automatically the moment a platform admin flips the flag, generates and delivers credentials for every student still missing one. From there, the student ID threads through attendance, tasks, exams, fees, rewards, and the parent portal — everywhere downstream that needs to know who a student is.

---

## 2. Database schema, table by table

All of these live in `lib/db.ts`, inside a migrations array — new columns arrive via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` scattered across the file over time. This section merges that history into one picture per table.

### `students`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id` | INTEGER REFERENCES schools(id) ON DELETE CASCADE | Tenant key |
| `name` | VARCHAR(255) NOT NULL | Full name. Onboarding concatenates `last_name + ' ' + first_name` **client-side** into this one field — there is no separate first/last-name storage anywhere server-side |
| `email` | VARCHAR(255) | Student's own email, fully optional everywhere. Used for welcome-email delivery — **never** for login |
| `grade` | VARCHAR(20) | |
| `section` | VARCHAR(10) | |
| `roll_number` | VARCHAR(50) (widened from an original VARCHAR(20)) | **Internal system ID** — format `wlyl-stu-{school-slug}-{5-digit-random}`, generated server-side. **This is the student's login username.** No DB uniqueness constraint on this column at all — only a non-unique lookup index |
| `school_roll_number` | INTEGER | **The class roll number a school actually assigns** (e.g. "Roll 14") — what every admin-facing screen calls "Roll". Unique only within `(school_id, grade, section)`; reusable across different grades or sections, and exempt entirely if left NULL |
| `parent_name` | VARCHAR(255) | Required at onboarding |
| `parent_phone` | VARCHAR(50) | Required at onboarding — the field the onboarding UI calls out as needed "for credential delivery" |
| `parent_email` | VARCHAR(255) | Optional (the migration adding this column is duplicated verbatim once in the file — harmless no-op, just copy-paste debt) |
| `phone` | VARCHAR(50) | Student's own phone, fully optional. Now also a real delivery channel — used for WhatsApp credential/removal/reset messages, and for password recovery when there's no email |
| `status` | VARCHAR(20) DEFAULT 'active' | Observed values: `active`, `inactive` (soft-delete), `graduated` (set only via the grade-promotion route) |
| `password_hash` | VARCHAR(255) | bcrypt hash; NULL if the student-portal feature was off at onboarding time (or add-time). `NULL` is also exactly the condition the portal-backfill logic scans for |
| `password_changed` | BOOLEAN DEFAULT FALSE | Set TRUE only when the student actually changes their own password; onboarding and credential resets both explicitly reset it back to FALSE |
| `created_at` | TIMESTAMP DEFAULT NOW() | Also the tie-breaker for "which duplicate record to keep" in the cleanup tool |

**Indexes:**
- `idx_students_school_roll_unique` — `UNIQUE (school_id, grade, section, school_roll_number) WHERE school_roll_number IS NOT NULL`. This is the actual constraint enforcing "roll number unique within a class" — deliberately partial so a student with no roll number is never blocked by it, and deliberately allowed to fail to create (logged, not fatal) if a database already has dirty duplicate data rather than crashing `ensureDB()` on every cold start.
- `idx_students_roll_number_lower` — `ON students(LOWER(roll_number)) WHERE roll_number IS NOT NULL`, a plain non-unique index added purely to stop every student login from doing a full table scan.
- **No index on `phone` or `parent_phone`** at all — every duplicate-detection query filtering by these does a sequential scan (scoped by `school_id` first, which may or may not be used efficiently by the planner).

### `parents`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id` | INTEGER REFERENCES schools(id) ON DELETE CASCADE | Added via a later migration, not present in the original table |
| `name` | VARCHAR(255) | |
| `email` | VARCHAR(255) | |
| `phone` | VARCHAR(50) | |
| `password_hash` | VARCHAR(255) | |
| `password_changed` | BOOLEAN DEFAULT FALSE | |
| `created_at` | TIMESTAMP DEFAULT NOW() | |

**`parents_email_unique`** — `UNIQUE ON parents(email) WHERE email IS NOT NULL` (defined in `lib/db.ts` with no `school_id` in the index expression — still true as of this verification pass). **This index has no `school_id` in it — it is a platform-wide constraint, not per-school.** Two different schools can never both have a parent record sharing the same email address. This directly contradicts the actual lookup logic used when onboarding (`findOrCreateParent` in `lib/studentOnboarding.ts`), which **is** school-scoped (`WHERE school_id = $1 AND (...)`). See [§11](#11-known-quirks-and-gaps) — this is confirmed **still an open gap**, not fixed this session.

There's also a **destructive, school-agnostic parent de-duplication migration** that runs on every `ensureDB()` call: it deletes every parent row sharing an email except the oldest one, globally, with no soft-delete equivalent. The codebase's own comments explicitly say students are *never* auto-de-duplicated this way "because that would risk deleting a real student" — that same caution was not extended to parents.

### `student_parents` (the join table)

`id SERIAL PK, student_id → students(id) ON DELETE CASCADE, parent_id → parents(id) ON DELETE CASCADE, UNIQUE(student_id, parent_id)`.

This is the actual mechanism behind "one parent, many children." It's a genuine many-to-many table, though in practice every onboarding flow read here only ever links exactly one parent per student. This is also the table every removal/notification flow now reads from to find "who is this student's parent" — never the denormalized `students.parent_email`/`parent_phone` display columns.

### `whatsapp_messages` (new — the WhatsApp audit log)

Every call to `sendWhatsappMessage()` (see [§7.2](#72-the-whatsapp-scaffold-what-queued-but-not-sent-means)) inserts one row here: `school_id, recipient_phone, recipient_name, message_type, template_name, template_params, provider ('meta'), provider_message_id, status`. Today `status` is always `'queued'` and `provider_message_id` is always `NULL`, because sending isn't live yet — this table exists now specifically so the eventual live integration only has to change *what* gets written into these columns, not add the table or the call sites.

### `plan_features` / `school_feature_overrides` (tier defaults + per-school override)

Not new tables, but their `student-portal`/`parent-portal` rows changed this session — see [§7.1](#71-the-two-layer-feature-flag-tier-default--per-school-override) for the full resolution logic.

---

## 3. Every API route, in detail

### `POST /api/students/bulk` — the main onboarding endpoint

Used for **both** single-student and multi-student submissions — the onboarding screen never calls the single-add route below at all.

- **Auth:** `requireSchoolAdmin()` (school_admin/principal/vice_principal — teachers cannot bulk-onboard) plus a manual `admin.schoolId === school_id` check (403 if mismatched).
- **Body:** `{ school_id, students: [{ name, section, parent_name, parent_phone, school_roll_number (or legacy roll_no), grade?, email?, parent_email?, phone? }] }`.
- **Per-row server-side validation** (independent of, and stricter than, the client's): name/section/parent_name/parent_phone required; roll number required and must parse as a positive integer. A failing row goes into `errors[]` and is skipped — **the rest of the batch still proceeds.**
- **In-request duplicate detection**: a `Set` keyed by lowercased `grade|section|roll` catches two rows in the *same* paste colliding with each other, before either ever reaches the database.
- **Cross-database duplicate detection** — three batched queries run before any insert:
  1. Roll-number collision, scoped to `(school_id, grade, section, school_roll_number)` among **active** students only.
  2. Student-phone collision, scoped to `(school_id, phone)` among active students.
  3. Same-name + same-parent-phone collision, exact string match on `name|parent_phone`.
  Any match is pushed to `skipped[]` (not `errors[]`) with a human-readable reason naming the existing student.
- **Class auto-creation**: `INSERT INTO classes ... ON CONFLICT (school_id, grade, section) DO NOTHING` for every unique grade+section combination in the batch.
- **Student insert**: one multi-row `INSERT ... RETURNING *`. `roll_number` (the login ID) is generated per-row as `wlyl-stu-{school-slug}-{5-digit-random}` — not collision-checked against the DB, just practically unlikely to collide. `school_roll_number` is the parsed class-roll integer. `status` is hardcoded `'active'`.
- **Password generation**: an 8-character temp password per student, only if the student-portal feature is enabled for the school — bcrypt-hashed before storage, kept in plaintext only long enough to email/WhatsApp/display it.
- **The sibling/parent dedup mechanism** — the single most important piece of logic in this feature:
  - Before the row loop starts, one `SELECT` builds `parentByEmail`/`parentByPhone` maps from the school's *existing* `parents` rows.
  - A `processedParentIds` Map is created **once per request** and shared across every row in the loop — this is what prevents two siblings in the same upload from racing to create two separate parent rows.
  - `findOrCreateParent()` keys this cache by `email:{lowercased}` if an email was given, else `phone:{phone}`. The first sibling processed does the real `SELECT`/`INSERT` and caches the resulting `parentId`; every later sibling with the same key just reads the cache — no second database write happens.
  - `student_parents` is linked per-student via `INSERT ... ON CONFLICT DO NOTHING`.
  - Even when the parent-portal feature is off, existing parent *linkage* still happens — only *new-parent-row creation* is suppressed. A sibling whose parent already has an account from before the flag was disabled still gets correctly linked.
- **Fixed this session — the parent-welcome double-send bug**: previously, when two siblings shared one parent, the row loop could fire `sendParentWelcomeEmail` twice with two *different* freshly-generated random passwords, but `findOrCreateParent`'s cache means only the **first** sibling's password is the one actually hashed and persisted to the `parents` row — the second email handed out a password that was never saved and would never work. The fix is a request-scoped `parentWelcomeSent` `Set<string>`, keyed the same way as the parent cache (`email:{lower}` or `phone:{phone}`): the welcome send (email **and** WhatsApp) only fires the first time a given parent key is seen in the send loop, mirroring the dedup `findOrCreateParent` already does for the DB write itself. Read the loop starting at the `parentWelcomeSent` declaration in `app/api/students/bulk/route.ts` — the comment there spells out the exact scenario. `needsNewParent[i]` alone is not sufficient to dedupe, since it's computed independently per row against *pre-batch* parents — it does not know about siblings created earlier in the same batch; that's specifically what `parentWelcomeSent` (and `findOrCreateParent`'s own cache) exist to cover.
- **Transaction**: the whole thing — classes, students, parent find/create, student_parents links — runs in a single `BEGIN...COMMIT`/`ROLLBACK` on one connected client. Emails and WhatsApp sends are fired **after** commit, fire-and-forget (never awaited) — a slow or failing delivery provider can never roll back or delay the response.
- **The credentials response is de-duplicated too**: a second `Set`, keyed the same way as the parent cache, ensures even if two siblings both "need a new parent," only **one** parent-credential row ever appears in the response, the on-screen modal, and the Copy-All text — never the same password shown twice.
- **Login value**: every student credential row's `login` field is the internal `roll_number` (the `wlyl-stu-*` string) — **not** `school_roll_number`. Student login never checks email; email/WhatsApp are purely where the credential gets delivered.
- **WhatsApp sends (new this session)** — alongside every existing email send, `sendWhatsappMessage()` is called wherever a phone number is on file:
  - Student's own `student_credentials` message, if `student.phone` is set (independent of whether the student also has an email).
  - Parent's own `parent_credentials` message, if the parent's resolved phone is set — only on first creation of that parent, same dedup as the email.
  - A copy of the **child's own** student-portal credentials sent to the resolved parent contact (email via `sendChildCredentialsToParentEmail`, WhatsApp via a `student_credentials`-templated message) — fires whenever a student password was generated and a parent contact resolved, regardless of whether that parent is new or pre-existing.
  All WhatsApp sends today only log an audit row (`status: 'queued'`) and a console line — see [§7.2](#72-the-whatsapp-scaffold-what-queued-but-not-sent-means).
- **Response**: `{ inserted, skipped: [{row,name,reason}], students: [...], errors: [{row,message}], credentials: { students: [...], parents: [...] }, studentPortalEnabled, parentPortalEnabled }` — always HTTP `201`, even when `inserted` is `0` and everything was a duplicate or an error. The client treats `inserted === 0` as failure and shows an error banner, but the status code itself never signals that.

### `GET /api/students` and `POST /api/students`

- **GET**: auth via `getAnySession()` — admits any logged-in role (teacher/student/parent/school-admin). Tenant scope is derived from the **session**, never from the query param, except for `platform_admin` — a deliberate fix against a real earlier bug where omitting `school_id` from the query produced an unscoped, all-schools result for a non-admin session. Supports `?grades_only=1`, `?grade=`/`?section=` filters, and **opt-in** pagination (`?limit=`/`?offset=`, capped at 500) — no silent default limit, because several screens need the full unbounded roster to compute correct totals. The column list explicitly excludes `password_hash`.
- **POST (single-student create)**: auth `requireSchoolAdmin()` + tenant match. Required: `school_id, name, section, parent_name, parent_phone, school_roll_number`. Duplicate checks (phone/email/roll) return friendly 409s before insert. `roll_number` is auto-generated via `generateStudentId()` when not supplied by the caller (matching the bulk route's behavior) — a caller may still pass one explicitly. Parent provisioning here is wrapped in its own try/catch, returning a `parent_warning` string in the response rather than failing the whole request if parent setup errors out after the student record already exists. **New this session**: on successful creation, alongside the existing email sends, `sendWhatsappMessage()` fires a `student_credentials` message to the student's own phone (if present), a `parent_credentials` message to a newly-created parent's resolved phone (first-creation only, same as email), and a copy of the child's own credentials to the resolved parent contact's phone — the same three-way delivery pattern as the bulk route, just for a single student.

### `GET /api/students/[id]`, `PUT`, `DELETE`

**Fixed this session — all three methods now require auth and enforce tenant isolation.** Each handler:
1. Calls `requireSchoolAdmin()` — returns 401 if there's no valid school-admin/principal/vice-principal session.
2. Looks up the student's `school_id` (or the full row, for GET) and compares it against `admin.schoolId` — returns 403 `Forbidden` on any mismatch, before any data is returned or any mutation happens.

Remaining behavior, otherwise unchanged from before:
- **GET**: still does `SELECT * FROM students WHERE id = $1` — this means a successful (same-school) response still includes `password_hash` in the JSON payload. The route is no longer reachable cross-tenant or unauthenticated, but the raw hash is still sent to an authorized same-school admin's browser; the collection-level `GET /api/students` deliberately excludes this column (see `STUDENT_COLUMNS` in `app/api/students/route.ts`) while this single-record route does not.
- **PUT**: edits any field via `COALESCE`-style partial update (name/email/grade/section/phone/parent_name/parent_phone/parent_email/status), still with zero format validation (no email regex, no phone regex) despite the admin UI enforcing both client-side.
- **DELETE (fixed and expanded this session)**: soft-deletes (`status='inactive'`) the student, then sends removal notifications:
  - `sendStudentRemovedEmail` to the student's own email, if present.
  - A `student_removed` WhatsApp message to the student's own phone, if present.
  - For **every** parent linked via `student_parents` (a real `JOIN` — `SELECT p.email, p.phone, p.name FROM student_parents sp JOIN parents p ON p.id = sp.parent_id WHERE sp.student_id = $1`, deliberately **not** the denormalized `students.parent_email` column): `sendParentStudentRemovedEmail` if that parent has an email, and a `student_removed` WhatsApp message if that parent has a phone.
  All four notification calls are fire-and-forget (`.catch(console.error)`), fired after the soft-delete `UPDATE` succeeds, and never block or fail the response. Every other linked row (attendance, task submissions, exam marks, points, fee ledger, `student_parents` itself) is left completely untouched by DELETE — it simply stops appearing anywhere filtering to `status='active'`.

### `POST /api/students/[id]/reset-credentials`

Auth: `requireSchoolAdmin()` + explicit school-ownership check. Refuses to reset an inactive student's password ("restore them first"). Generates a fresh 8-char temp password, updates the hash, resets `password_changed = FALSE`, emails it if the student has an email, and **always returns the plaintext password in the response regardless** — so the admin UI can show it once even with no email on file. (Note: as of this session there is no longer any admin-UI surface that calls this route directly for a routine reset — see [§5](#5-school-admin-the-students-directory) and [§6](#6-credentials--generation-delivery-and-recovery); the route itself is untouched and still callable.)

### `POST /api/students/check-duplicates` — the pre-submit preview

A non-mutating dry-run of the same three-way duplicate check the bulk route does, but tried **in priority order per row** (roll number → name+parent_phone → phone, first match wins) with full detail on the match. Powers the "Students Already Exist" modal shown before the real submit.

**Its collision rules don't perfectly match the real bulk-insert's rules** — the preview includes a `name+phone` (student's own phone) match that the actual insert route doesn't separately check. A duplicate the preview flags under "Same name + phone" is not guaranteed to actually be caught as a skip during the real insert.

### `GET /api/students/duplicates` and `POST /api/students/duplicates/cleanup`

An **ongoing data-hygiene tool**, not part of onboarding itself, but the place sloppy re-uploads get cleaned up afterward.

- **GET**: one query using `ROW_NUMBER() OVER (PARTITION BY ...)` across three grouping keys (roll+grade+section, name+parent_phone, name+phone), keeping the oldest row per group as "keep" and flagging the rest as duplicates.
- **POST cleanup**: before the actual hard delete, reassigns fee-ledger, payment, waiver, and attendance ownership from the duplicate to the kept record, and merges `student_parents` links — then genuinely `DELETE FROM students`. This is the **only** place in the entire feature that hard-deletes a student row. Every reassignment step is individually wrapped in a silent `.catch(() => {})` — a failure partway through doesn't stop the hard delete from proceeding, which could leave some history orphaned or, since most other FKs are `ON DELETE CASCADE`, silently destroyed (task submissions, exam marks, rewards/points/badges are **not** reassigned — only fees and attendance are — so a "duplicate" cleanup permanently deletes the removed student's task/exam/rewards history).

### `GET /api/students/template`

Generates a real `.xlsx` (via ExcelJS) with the columns `Roll No, Last Name, First Name, Student Email, Grade, Section, Parent Name, Parent Phone, Parent Email, Student Phone`, mandatory columns highlighted amber, two example rows. This column order and count matches the CSV-paste format exactly — but see [§11](#11-known-quirks-and-gaps) for why re-uploading the filled-in Excel file as-is doesn't actually work.

### `GET/POST /api/students/promote`

Auth: `requireFeeAccess` (a fee-specific-named helper reused here — not actually fee-related). GET previews the current grade/section distribution; POST bulk-moves matching active students to a new grade/section, optionally marking a graduating grade's students `status='graduated'`. **No roll-number collision check** before the bulk update — if the destination class already has students at the same roll numbers, the whole transaction rolls back with a generic 500 rather than a clear, per-student error.

### `POST /api/school-admin/students/backfill-portal` (manual) and the automatic trigger

Covered in full in [§7](#7-portal-enabledisablere-enable--the-automatic-credential-lifecycle) — both this manual route and the new automatic trigger share one implementation, `backfillPortalCredentials()` in `lib/studentOnboarding.ts`.

### `POST /api/student/auth/forgot-password` — fixed this session

Previously bailed out silently unless the student had an email on file. Now: the lookup query also selects `phone`, and the route only bails (returns the same generic `{ success: true }` it always returns, to avoid leaking whether an account exists) if **neither** `email` nor `phone` is present. If an email exists, `sendPasswordResetEmail` is sent as before. If a phone exists (independently — a student can have one contact method without the other), a `password_reset` WhatsApp message is sent with the same reset link/token. Genuine bug fix: before this, a student onboarded with only a phone number (no email) could **never** recover their account through self-service — this route would find their row and then quietly do nothing, always returning success with no actual delivery.

### Other `[id]` sub-routes

`GET /api/students/[id]/exams`, `GET /api/students/[id]/submissions`, `GET /api/students/[id]/rewards` — none of these have any auth guard at all (unchanged; not touched this session, and not the same route the fix above applied to). `POST /api/students/[id]/change-password` requires knowing the student's *current* password (bcrypt-verified), which functions as its own ad hoc authorization, but there's no check that the caller invoking it is actually that student's own logged-in session.

---

## 4. School Admin: the onboarding screen

**Screen:** `app/school-admin/components/StudentOnboarding.tsx`

### Modes

- **Manual grid** (default): a spreadsheet-like table (`data-testid="onboarding-table"`), one row per student.
- **CSV paste**: a textarea accepting a pasted 10-column blob: `roll_no,last_name,first_name,email,grade,section,parent_name,parent_phone,parent_email,phone`. If a header row is detected, it's skipped; if the pasted content looks like a **staff** CSV instead (department/qualification/staff_type/subject/employee_id/teaches_grades markers), it's rejected with a warning rather than silently mis-imported as students.
- **Import CSV file button**: accepts `.csv`, `.txt`, or `.xlsx` — but reads every file type via `FileReader.readAsText()`. This means a real binary `.xlsx` file does **not** parse correctly; only genuine `.csv`/`.txt` text works (see [§11](#11-known-quirks-and-gaps)).

### Grid columns and validation (client-side)

Roll No, Last Name, First Name, Email, Grade, Section, Parent Name, Parent Phone, Parent Email, Phone.

- **Required**: Roll No (positive integer), Last Name, First Name, Grade, Parent Name, Parent Phone.
- **Format-checked if present**: Student Email, Parent Email (basic regex). **Neither Student Phone nor Parent Phone has any format check at all in this grid** — despite the edit form in the directory screen enforcing one.
- **In-batch duplicate check**: keyed by `grade|section|roll`, blocks submission if two pasted rows collide.
- **Live per-row duplicate warning**: cross-checked against the school's existing active roll numbers (fetched once on load) *and* every other row already typed in the current batch — shown as inline red text under the Roll No cell, and disables the Enroll button entirely until resolved.

### Pre-submit duplicate preview

Before the real submit, the form calls the non-mutating `check-duplicates` endpoint. If any matches come back, a modal shows three stat tiles (New / Already Exist / Total Detected) and a per-row breakdown with a human-readable reason, letting the admin Cancel or proceed with "Upload Only New (N)". **If this preview call itself fails** (network error, 500), the failure is silently swallowed and the form falls through to submitting anyway — a broken duplicate-check endpoint never blocks onboarding, it just skips showing the warning.

### The real submit → "Enrollment Complete — Credentials" modal

- **Amber warning**: "Save these now — passwords are shown once and cannot be recovered."
- **Copy All** button: builds one plain-text block covering every student and every newly-created parent, writes it to the clipboard, and flashes "✓ Copied!" for two seconds.
- **Student credentials table**: Student / Grade-Roll / Login (the roll number) / Temp Password. If the student portal is disabled for the school, this whole section is replaced by a plain notice that students were added without logins.
- **Parent credentials table**: only rendered if the parent portal is enabled *and* at least one new parent account was actually created this run — labeled explicitly "(new accounts only)" so a sibling reusing an existing parent doesn't show a second, misleading row.
- **Done / ×**: both close the modal and trigger a parent-supplied refresh callback. Neither clears the underlying result state, so a "View Credentials" button in the toolbar can bring the same batch's credentials back up later in the same browser session (lost on refresh, since it's just React state).

### "Activate Portal Access" — the retroactive-credentials flow

If a school onboarded students while a portal (student or parent) was disabled, and later turns it on, a teal "Activate Portal Access (N)" button appears (N = count of students missing a password). Confirming it generates fresh credentials for every such student (and any linked parents still missing one), reusing the exact same credentials modal to display the results. This is explicitly one-way ("This cannot be undone") — it only ever adds credentials, never removes them. **As of this session this is no longer the only way this backfill happens** — the same underlying logic also fires automatically the moment a platform admin turns the portal feature on for the school; see [§7](#7-portal-enabledisablere-enable--the-automatic-credential-lifecycle) for the full picture, including why this manual button is still kept around even though it's no longer strictly necessary (a school admin can retry a partial backfill without waiting on platform admin).

---

## 5. School Admin: the Students directory

**Screen:** `app/school-admin/components/StudentsManagement.tsx`

Two-pane layout: a roster list on the left (grouped by "Grade N – Section X"), a detail panel on the right that opens on row click.

**Status tabs:** Active / Removed (with a badge count) / All / **Duplicates**.

**Removed this session — the Credentials tab and the profile-panel Reset Password button are both gone.** The old version of this document described a flat, searchable "Credentials" tab with an inline Reset button per student, and a "Reset Password" action in the profile detail panel. Both were verified removed: `StudentsManagement.tsx` no longer contains a `CredentialsPanel` component, a `handleResetPassword` function, a "Credentials" tab entry, or any reset-password UI at all. There is now **no manual credential-reset surface anywhere in the Students directory** — the rationale is that delivery is now considered reliable via the combination of email and WhatsApp (see [§6](#6-credentials--generation-delivery-and-recovery)), and self-service forgot-password (now fixed to also work for phone-only students, see [§3](#3-every-api-route-in-detail)) is the intended recovery path. The underlying `POST /api/students/[id]/reset-credentials` endpoint itself is untouched and still works — it's simply not wired to any button in this screen anymore.

- **Duplicates tab**: "Scan for Duplicates" runs the cleanup-tool's GET route and renders each group with a green "KEEP" row (the oldest record) and red "DELETE" rows for the rest, tagged with the match reason. Checkboxes allow selecting individual groups or all of them; deleting routes through a confirmation modal that explicitly warns "Fee records will be reassigned to the kept record" before calling the hard-delete cleanup route.
- **Profile tab** (in the detail panel): view/edit toggle over name, email, grade, section, phone, parent name/phone/email. Client-side validation here is **stricter than the onboarding grid** — both student and parent phone are format-checked with a regex; the onboarding grid checks neither.
- **Actions**: Edit Details, Remove Student (soft-delete, confirm dialog explicitly says "marked inactive and can be restored later"), Restore Student (only shown for inactive students). No Reset Password action remains (see above).
- **Performance/360° tab**: attendance %, task submission rate, average score %, engagement, class rank, points, streak, badges, plus a read-only parent-info block.

---

## 6. Credentials — generation, delivery, and recovery

- **Temp passwords** come from `generateTempPassword()` in `lib/auth.ts` — a random string drawn from an alphabet that deliberately excludes visually ambiguous characters (`I`, `O`, `l`, `0`, `1`). Students get 8 characters, parents get 10 — an arbitrary length difference, not a security-driven one.
- **Delivery is now two-channel**: email (via `lib/email.ts`, Resend) and WhatsApp (via `lib/whatsapp.ts` — currently a scaffold, see [§7.2](#72-the-whatsapp-scaffold-what-queued-but-not-sent-means)). Each channel is attempted independently based on whichever contact method is on file — a student/parent with only a phone still gets a delivery attempt (WhatsApp), just not an email.
- **Student welcome email** is sent only if the student has an email on file, the student-portal feature is enabled, and a temp password was actually generated. It shows the roll number (the login ID) and the temp password, with a login link. A parallel WhatsApp `student_credentials` message is sent if the student has a phone on file, independent of whether the email fired.
- **Parent welcome email** is sent only the **first time** a parent account is created — never on a subsequent sibling reusing that same parent record — and only if the parent has an email on file. A parallel WhatsApp `parent_credentials` message is sent on that same first-creation event if the parent has a phone. A parent identified only by phone number now still gets a real delivery attempt (WhatsApp) even with no email on file — previously their credentials only ever appeared on screen.
- **The parent also always receives a copy of their child's own student-portal credentials** (not just the parent's own account credentials) — via `sendChildCredentialsToParentEmail` and/or a `student_credentials`-templated WhatsApp message to the parent's resolved contact — whenever a student password was generated and a parent contact could be resolved, regardless of whether that parent account is brand new or pre-existing.
- **No email or phone on file for a student**: they still get a full, working account — the admin just has to hand them the password manually; the onboarding modal says so explicitly when the section is empty of contact info for a given row.
- **Sibling dedup prevents a duplicate parent welcome send** (email and WhatsApp both): because "was this parent just created" is only true for the very first sibling processed in a batch, and the `parentWelcomeSent` dedup set (see [§3](#3-every-api-route-in-detail)) ensures the welcome send loop itself doesn't refire for a parent already sent to earlier in the same batch, the welcome message never fires twice for the same parent even though the row loop iterates over every student.
- **Ongoing recovery is now self-service-first**: the directory's manual Reset button is gone (see [§5](#5-school-admin-the-students-directory)); the intended path for a lost password is the student/parent forgot-password flow. `POST /api/students/[id]/reset-credentials` still exists and still works as an admin-triggered fallback (e.g. via a direct API call or a future UI surface), returning the plaintext password once for on-screen display, whether or not an email could also be sent — but nothing in the current Students directory calls it.
- **No equivalent "reset parent password" endpoint exists in this feature** — parents rely on the standard self-service forgot-password/reset-password flow instead.
- **Removal now also notifies** — see [§3](#3-every-api-route-in-detail)'s DELETE section: the student (email + WhatsApp) and every linked parent found via `student_parents` (email + WhatsApp each) get a `student_removed` notification when a student is soft-deleted.

---

## 7. Portal enable/disable/re-enable — the automatic credential lifecycle

This is the single biggest behavioral change verified this session: **"Activate Portal Access" is no longer the only way credentials get backfilled.** The same underlying logic now also fires automatically whenever a platform admin changes the `student-portal`/`parent-portal` flag for a school.

### 7.1 The two-layer feature flag (tier default + per-school override)

`schoolHasFeature(schoolId, featureKey)` in `lib/auth.ts` resolves the effective flag value in two steps:
1. **Per-school override** — `SELECT enabled FROM school_feature_overrides WHERE school_id = $1 AND feature_key = $2`. If a row exists, its value wins outright, regardless of tier.
2. **Tier default** — if no override row exists, fall back to `plan_features` for the school's subscription tier: `SELECT bool_or(enabled) FROM plan_features WHERE tier = ANY(tiers) AND feature_key = $2`. If the school has no subscription row at all, the feature is `false`.

**Tier defaults changed this session.** Previously `student-portal`/`parent-portal` defaulted to enabled at every tier. Now, seeded in `lib/db.ts`:
```
('student-portal', 'basic', false), ('student-portal', 'standard', true), ('student-portal', 'premium', true),
('parent-portal',  'basic', false), ('parent-portal',  'standard', true), ('parent-portal',  'premium', true)
```
Basic-tier schools now default to **no** student/parent portal access unless a platform admin explicitly overrides it on; Standard/Premium still default to on.

**These two keys were also removed from the platform-admin global features-matrix.** `app/api/platform/features/route.ts` defines `GLOBAL_MATRIX_EXCLUDED = new Set(['student-portal', 'parent-portal'])`, and filters them out of `MATRIX_FEATURES` (the list shown/editable in the global tier-matrix UI) and explicitly skips them (`if (GLOBAL_MATRIX_EXCLUDED.has(feature_key)) continue`) in the matrix-save handler. The only place these two flags can now be changed is the **per-school** toggle at `/platform-admin/schools/[id]`, which writes to `school_feature_overrides` via `app/api/platform/schools/[id]/feature-overrides/route.ts`.

### 7.2 The WhatsApp scaffold — what "queued but not sent" means

`lib/whatsapp.ts` exports `sendWhatsappMessage()` and a typed `WHATSAPP_TEMPLATES` map (template name → required params + a sample body), covering: `student_credentials`, `parent_credentials`, `staff_credentials`, `staff_reactivated`, `student_removed`, `staff_removed`, `contact_info_changed`, `password_reset`.

This is a **scaffold, not a live integration** — every call:
1. Looks up the template (logs and no-ops if the template name is unknown).
2. Logs `[whatsapp] (scaffold — not sent) template=... to=... school=...` to the console.
3. Inserts one audit row into `whatsapp_messages` with `status: 'queued'` and `provider_message_id: null`.
4. Returns normally — it never actually calls Meta's API.

The file's own header comment lays out the exact steps to go live later:
1. Add `WHATSAPP_ACCESS_TOKEN` handling — decrypt `school_whatsapp_config.access_token_encrypted` per school (same pattern `lib/encryption.ts` already uses for Cashfree secrets), since each school has its own Meta WABA + `phone_number_id`, rather than one shared env var.
2. Replace the TODO block inside `sendWhatsappMessage()` with a real `fetch()` to `https://graph.facebook.com/v20.0/{phone_number_id}/messages`.
3. Update the inserted `whatsapp_messages` row's `status`/`provider_message_id` from the real API response instead of hardcoding `'queued'`.
4. Wire the delivery-status webhook (Meta calling back with delivered/read events) to `UPDATE whatsapp_messages SET status=..., delivered_at=...` — explicitly out of scope for this scaffold.

The important consequence for every call site described elsewhere in this document (bulk onboarding, single-add, removal, forgot-password, backfill): **no call site needs to change when WhatsApp goes live** — the function signature and audit-logging behavior stay the same; only the internals of `sendWhatsappMessage()` change.

### 7.3 `backfillPortalCredentials()` — the shared core

`lib/studentOnboarding.ts` exports `backfillPortalCredentials({ schoolId, wantStudent, wantParent })`. This is the extracted, shared logic behind both trigger points described below. What it does:
1. Selects every row from `students` where `school_id = $1 AND status = 'active' AND password_hash IS NULL` — i.e., every active student who has never had a portal credential generated.
2. If there are none, returns immediately (`backfilled: 0`) — cheap to call speculatively.
3. Otherwise, opens one transaction and, per targeted student:
   - If `wantStudent`: generates an 8-char temp password, hashes it, `UPDATE`s the student row, and queues an email (if the student has an email) and a `student_credentials` WhatsApp message (if the student has a phone).
   - Resolves (never creates, unless `wantParent` is also true) the student's linked/linkable parent via the same `findOrCreateParent()` used by onboarding, reusing a request-scoped cache so siblings in the same backfill run collapse to one parent exactly like a normal bulk-onboard does. If `wantParent` and this is a newly-created parent, queues a parent welcome email/WhatsApp with a fresh 10-char password.
   - Regardless of whether the parent is new, if a student password was generated **and** a parent contact resolved, queues a copy of the child's own credentials to that parent (email + WhatsApp) — matching the same "parent always gets a copy of the child's login" behavior as ordinary onboarding.
4. Commits the transaction, then fires every queued send (fire-and-forget).
5. Returns `{ backfilled, studentCredentials[], parentCredentials[] }`.

Crucially: **it only ever touches students with `password_hash IS NULL`.** A student who already has a credential (from a previous backfill run, or from being onboarded while the portal was already on) is never re-touched — safe to call repeatedly, and safe to call from both trigger points below without ever double-crediting anyone or generating two different passwords for the same person.

### 7.4 Trigger 1 — the manual button (unchanged mechanism, now a thin wrapper)

`POST /api/school-admin/students/backfill-portal` (school-admin-facing, `requireFeeAccess` guarded) still exists and still powers the "Activate Portal Access" button described in [§4](#4-school-admin-the-onboarding-screen). It now just validates the request (`target: 'student'|'parent'|'both'`, and refuses if the relevant portal flag isn't actually enabled) and calls `backfillPortalCredentials()` directly, logging a `platform_audit_log` row afterward. A school admin can still use this to retry a partial backfill without waiting on a platform admin to touch anything.

### 7.5 Trigger 2 — automatic, from the platform-admin feature-override route

`app/api/platform/schools/[id]/feature-overrides/route.ts` defines `maybeAutoBackfill(schoolId, featureKey, isNowEnabled)`: if the feature just became enabled **and** the key is `student-portal` or `parent-portal`, it fires `backfillPortalCredentials()` for that school with `wantStudent`/`wantParent` set accordingly — fire-and-forget (`.catch(console.error)`), so the toggle response itself is never slowed down by a potentially large backfill.

This fires from **two** code paths:
- **`POST /api/platform/schools/[id]/feature-overrides`** — an explicit override write. After the `INSERT ... ON CONFLICT DO UPDATE` into `school_feature_overrides`, `maybeAutoBackfill(schoolId, feature_key, !!enabled)` is called with the just-written `enabled` value directly.
- **`DELETE /api/platform/schools/[id]/feature-overrides`** — removing an override falls back to the tier default, which for a Standard/Premium school is `true`. After the `DELETE`, the route explicitly re-resolves the **effective** state via `schoolHasFeature()` (not just "an override was removed") and calls `maybeAutoBackfill(schoolId, feature_key, effectiveEnabled)` — so removing an OFF override on a Standard-tier school (falling back to the tier's `true` default) correctly triggers a backfill too, even though no explicit "enable" action was taken.

**No manual click is required anymore.** The moment a platform admin's action results in the feature being effectively ON for a school, every student there still missing a login gets one automatically.

### 7.6 The full lifecycle, walked through

1. **School has portal OFF, students exist.** Students get onboarded normally (roll number, class, parent link all still happen) but with `password_hash = NULL` — no email/WhatsApp credential delivery happens for the portal-affected side, and the onboarding modal shows the "added without logins" notice.
2. **Portal gets turned ON** (school admin's own action isn't possible here — only a platform admin can change `student-portal`/`parent-portal`, via the per-school toggle). `maybeAutoBackfill` fires. Every student at that school with `password_hash IS NULL` gets a fresh password generated, hashed, saved, and delivered by whatever contact channels they have on file. This includes students added at any point in the past while the flag was off — there is no time window; it's a pure `password_hash IS NULL` scan.
3. **Portal gets turned OFF again.** Nothing is deleted and nothing about existing accounts changes. The only effect is at login time: `student/auth/login/route.ts` and `parent/auth/login/route.ts` both call `schoolHasFeature()` and refuse the login if the portal is currently disabled — even for an account that already has a valid password hash. The failure message is the same generic "Invalid email or password" text a wrong password would produce, giving no hint that the real cause is the feature flag.
4. **New students get added while the portal is OFF (again).** They join the backlog exactly like step 1 — `password_hash` stays `NULL`, no credential delivery, silently queued for whenever the portal comes back on.
5. **Portal gets re-enabled.** The catch-up backfill runs again and picks up **everyone** still missing a login — both the original backlog from step 1 (if somehow still uncredentialed) and the new arrivals from step 4 — in one pass, with no manual reconciliation needed.

---

## 8. Downstream reflections — where onboarded student data is read

| Consumer | How it's scoped |
|---|---|
| Class roster / attendance target list | By matching `(school_id, grade, section)` string values against the `classes` row — **not** a `class_id` foreign key on `students`. A student belongs to a class purely by grade/section text matching |
| Attendance marking and history | Direct `student_id` foreign key |
| Task assignment / submission | Direct `student_id` foreign key on submissions; task targeting itself is at the class level |
| Exam records and marks | Direct `student_id` foreign key; also cross-checks the student's grade/section against the exam's class to decide visibility |
| Doubts | Direct `student_id` foreign key |
| Fee ledger, payments, waivers | Direct `student_id` foreign key — the same tables the duplicate-cleanup tool explicitly reassigns rather than losing when merging duplicate students |
| Rewards, points, badges, streaks | Direct `student_id` foreign key; also computes a same-class leaderboard by matching grade/section |
| Parent portal — which children a parent sees | Only via `student_parents` — correctly scoped |
| Parent portal — reading one specific child's data | **Gap** — at least one route only checks the student is in the same school as the parent's session, without re-verifying `student_parents` actually links that specific parent to that specific student (see [§11](#11-known-quirks-and-gaps)) |
| Timetable | Class-level (grade/section match), same pattern as attendance — not a direct student foreign key |
| Notifications | Direct `student_id` foreign key |
| `whatsapp_messages` audit log | Scoped by `school_id`, one row per send attempt (queued or, once live, actually sent) — see [§7.2](#72-the-whatsapp-scaffold-what-queued-but-not-sent-means) |

---

## 9. Auth model — who can do what

Three different guard styles are used across student-onboarding-adjacent routes, not one consistent helper:

1. **`requireSchoolAdmin()`** — role check only (school_admin/principal/vice_principal). Used by bulk onboarding, single-add, duplicate-check/cleanup, credential resets, and (fixed this session) `GET/PUT/DELETE /api/students/[id]`, each of which now additionally does its own manual `admin.schoolId === row.school_id` tenant check. Callers must **manually** re-check tenant match afterward with this helper — this pattern is followed correctly everywhere it's used here, but it's an easy step to forget, unlike the next option, which bakes the tenant check in.
2. **`requireFeeAccess(school_id)`** — folds role + tenant match into one call, additionally admits platform admin for any school. Used by grade-promotion and the portal-backfill route — neither is actually fee-related; this is the same generically-named-helper reuse pattern documented in the syllabus feature's reference doc.
3. **`getAnySession()`** — admits any logged-in role. Used for the read-only student list and the parent child-summary route.
4. **`requirePlatformAdmin()`** — used by the feature-overrides routes ([§7](#7-portal-enabledisablere-enable--the-automatic-credential-lifecycle)), since only a platform admin can change tier overrides.
5. **No guard at all** — the exam/submissions/rewards sub-routes, and the change-password route (which substitutes "knowing the current password" as its de facto authorization). `GET/PUT/DELETE /api/students/[id]` is **no longer** in this category — see item 1.

---

## 10. End-to-end scenarios, step by step

### Scenario A: Admin onboards one new student with full parent details

1. Admin fills the grid, client validates required fields/format/in-batch duplicates.
2. `check-duplicates` finds nothing — the form proceeds straight to submit.
3. `POST /api/students/bulk` re-validates everything server-side, finds no DB-level collisions.
4. Inside one transaction: the class row is upserted if new, the student is inserted (`status='active'`, a fresh `roll_number` generated, password hashed if the student portal is on), no matching parent is found so a new `parents` row is created, and `student_parents` links them.
5. After commit: a student welcome email and WhatsApp message are sent (if they have an email/phone respectively), and a parent welcome email and WhatsApp message are sent (new account, has an email/phone), plus a copy of the child's own credentials to the parent.
6. The response includes one student credential row and one new-parent credential row; the admin sees both in the "Enrollment Complete" modal and can Copy All.

### Scenario B: Two siblings share one parent phone, in the same upload

1. Both rows pass individual validation.
2. A pre-insert lookup finds no existing `parents` row for that phone — this is the very first time this parent appears in the system.
3. During the per-row loop, sibling #1's processing creates the new `parents` row and caches its ID in the shared, request-scoped cache.
4. Sibling #2's processing hits that cache immediately — no second `parents` row is ever inserted — and links to the same parent via a second `student_parents` row.
5. Result: one `parents` row, two `student_parents` links, exactly **one** parent-credential entry in the response and modal, and exactly one parent welcome email and one WhatsApp message sent — never two, thanks to the `parentWelcomeSent` dedup set (see [§3](#3-every-api-route-in-detail)).

### Scenario C: A student is later removed

- The only delete path exposed in the UI (the directory's "Remove Student" button) is a **soft delete** — `status` flips to `inactive`, guarded by `requireSchoolAdmin()` + tenant check. Every linked row (attendance, task submissions, exam marks, points, fee ledger, `student_parents`) is left completely untouched; it simply stops appearing in any screen or query that filters to `status='active'`. The student (if they have an email/phone) and every parent linked via `student_parents` (if they have an email/phone) receive a removal notification — email and/or WhatsApp — fired fire-and-forget after the soft-delete succeeds.
- The only **hard** delete anywhere in this feature is the duplicate-cleanup tool, which first reassigns fee and attendance ownership to the surviving record, then genuinely deletes the row — at which point every other cascade-configured relationship (task submissions, exam marks, rewards, badges, doubts) is permanently destroyed along with it, since those are never reassigned first.
- A student can also become `status='graduated'` via the promotion route — treated like `inactive` in most "active"-filtered views, but not restorable through the same "Restore" button, which only flips `inactive` back to `active`.

### Scenario D: A parent logs in later

- Login looks up the `parents` row by case-insensitive email and verifies the password — and additionally requires the parent-portal feature still be enabled for that school at the moment of login, even if the account was created while it was on. If it's since been turned off, login fails with the same generic "Invalid email or password" message, giving no hint about the real cause.
- Once in, the parent's own dashboard correctly scopes "my children" through `student_parents`, filtered to active students only — a graduated or removed child simply disappears from view with no historical trace surfaced there.

### Scenario E (new): School had the portal OFF, has 50 students, platform admin turns it ON

1. All 50 students were onboarded (or added one at a time) while `student-portal` resolved to `false` for the school — either because the school is Basic tier (now defaulting to off) or because a platform admin had explicitly overridden it off. Every one of them has `password_hash IS NULL`.
2. A platform admin opens `/platform-admin/schools/[id]` and flips the student-portal toggle on. This calls `POST /api/platform/schools/[id]/feature-overrides` with `{ feature_key: 'student-portal', enabled: true }`.
3. The route writes the override row, then calls `maybeAutoBackfill(schoolId, 'student-portal', true)` — fire-and-forget, so the toggle's own response returns immediately without waiting on the backfill.
4. `backfillPortalCredentials({ schoolId, wantStudent: true, wantParent: false })` runs: it selects all 50 students (`status='active' AND password_hash IS NULL`), and inside one transaction generates and hashes a fresh 8-char password for each, resolves each student's parent contact (linking, not creating, since `wantParent` is false here), and queues a welcome email/WhatsApp for each student plus a copy of their credentials to their resolved parent contact if one exists.
5. Within moments, all 50 students (and, where a parent contact was resolvable, their parents too) have live logins with credentials already delivered — with no school admin ever needing to click anything, and no student needing to be re-added or re-touched.

### Scenario F (new): A student with only a phone number uses forgot-password

1. The student was onboarded with a `phone` but no `email` (fully legal — email is optional everywhere in this feature).
2. They visit the student forgot-password screen and submit their roll number (or would submit email, but they have none).
3. `POST /api/student/auth/forgot-password` looks the student up, now selecting `phone` alongside `email`. Since `student.phone` is present (even though `student.email` is `null`), the route does **not** bail — it generates a reset token, inserts it into `password_reset_tokens`, and since there's no email to send to, sends only a `password_reset` WhatsApp message containing the reset link.
4. The student receives the reset link over WhatsApp (once live — today this is logged as a `queued` audit row per the scaffold in [§7.2](#72-the-whatsapp-scaffold-what-queued-but-not-sent-means)), opens it, and sets a new password via the normal reset-password screen — a path that was completely unavailable to this student before this session's fix (previously the route silently did nothing for an email-less student).

---

## 11. Known quirks and gaps

- **`parents_email_unique` is still a platform-wide constraint, while the actual onboarding lookup logic is school-scoped.** Verified still true this session (`lib/db.ts`, the index has no `school_id` in its definition; `findOrCreateParent` in `lib/studentOnboarding.ts` filters `WHERE school_id = $1`). If School A already has a parent with a given email, and School B's onboarding — which correctly finds no match within its own school — tries to create a *new* parent row with that same email, the insert hits the global unique-index violation and the whole transaction fails with an opaque 500. This is a real, reachable bug, not a style inconsistency, and remains **open**.
- **A destructive, school-agnostic parent de-duplication runs on every database migration pass**, silently deleting older parent rows sharing an email with no soft-delete equivalent — a materially riskier policy than the one applied to students, which the codebase's own comments say is deliberately never auto-de-duplicated "because that would risk deleting a real student."
- **The internal login ID (`roll_number`) has no database uniqueness constraint and no collision-retry logic** — just a random 5-digit suffix. Practically low-risk at typical school sizes, but not actually guaranteed unique.
- **`GET /api/students/[id]` still leaks `password_hash`** to an authorized, same-school admin, since it does `SELECT *` while the collection-level `GET /api/students` explicitly excludes the column. No longer reachable by an unauthenticated or cross-tenant caller (that was fixed this session — see [§3](#3-every-api-route-in-detail)), but the column still shouldn't be in the payload at all.
- **The onboarding grid has no phone-number format validation** for either student or parent phone, while the directory's edit form validates both — a malformed phone number can be onboarded and only get caught if someone later opens Edit on that record.
- **The pre-submit duplicate preview and the real bulk-insert don't use identical collision rules** — the preview includes a same-name-plus-own-phone match that the actual insert route doesn't separately check, so a duplicate the preview warns about isn't guaranteed to actually be blocked at insert time.
- **A 409-based "Duplicate Roll Number" error handler in the onboarding UI appears to be dead code for this flow** — the bulk route the onboarding screen actually calls never returns a 409 for roll collisions; it reports them as `skipped` entries in a normal 201 response instead. That 409 shape only comes from the single-add route, which the onboarding screen never calls.
- **Uploading a real `.xlsx` file doesn't work as expected.** The "Import CSV" file picker accepts `.xlsx`, but reads every file as plain text — a genuine binary Excel file mis-parses. Only actual CSV/text content works, even if it's given an `.xlsx` extension. There is no server-side Excel-parsing route in this codebase for students (there is one for the downloadable template's *generation*, but not for reading one back in).
- **Grade promotion has no roll-number collision check** before its bulk update — if the destination grade/section already has students at the same roll numbers, the whole operation fails with a generic error rather than naming the specific conflict.
- **Duplicate-cleanup's reassignment steps are each individually failure-swallowed** before the hard delete proceeds regardless — a silent partial failure could leave financial or attendance history in an inconsistent state without ever surfacing an error to the admin who triggered the cleanup.
- **At least one parent-facing route doesn't re-verify parent-to-child linkage** — it checks the requested student is in the same school as the parent's session, but not that `student_parents` actually links that specific parent to that specific student, meaning a parent who knows or guesses another student's numeric ID within the same school could potentially read that other child's summary data.
- **Disabling the portal produces a generic, uninformative login failure.** A student/parent whose account is fully valid (correct password) but whose school currently has the portal flag off gets the exact same "Invalid email or password" message a wrong-password attempt would produce — no messaging anywhere hints that the real cause is an admin-side feature toggle, not their credentials.
- **WhatsApp delivery is not actually live yet** — every WhatsApp send across onboarding, removal, forgot-password, and backfill is currently a scaffold: it logs an audit row with `status: 'queued'` and never reaches Meta's API. This is by design for this session (see [§7.2](#72-the-whatsapp-scaffold-what-queued-but-not-sent-means)) and not a bug, but worth flagging clearly since every place in this document that says "sends a WhatsApp message" currently means "queues one."
- **No admin-UI surface remains for a routine, ad hoc credential reset** (see [§5](#5-school-admin-the-students-directory)) — the underlying endpoint (`POST /api/students/[id]/reset-credentials`) still works, but nothing in the Students directory calls it anymore. If self-service forgot-password or delivery (once WhatsApp goes live) ever fails for a given student, there is currently no in-app fallback button for an admin to use; they'd need to call the endpoint directly.

---

## 12. Quick-reference glossary

| Term | Meaning |
|---|---|
| **`roll_number`** | The internal system-generated login ID, format `wlyl-stu-{slug}-{random}` — never shown as "the roll number" to a school admin, but it's literally what the student logs in with |
| **`school_roll_number`** | The class roll number the school actually assigns (e.g. "Roll 14") — what every screen displays as "Roll" |
| **Sibling dedup** | The request-scoped cache that ensures two students in the same onboarding batch sharing a parent's email/phone get linked to one shared parent record, not two duplicates — and, as of this session, also ensures the parent welcome send (email/WhatsApp) only fires once per parent per batch (`parentWelcomeSent`) |
| **`student_parents`** | The join table implementing "one parent, many children." Also now the source of truth every removal/notification flow reads from, rather than the denormalized `students.parent_email`/`parent_phone` columns |
| **Duplicate preview** | The non-mutating `check-duplicates` call made before a real submit, showing which rows would be skipped |
| **Duplicate cleanup** | The separate, ongoing maintenance tool (`/duplicates`, `/duplicates/cleanup`) that finds and hard-deletes truly duplicate student records after the fact, reassigning their fee/attendance history first |
| **Portal backfill / "Activate Portal Access"** | Retroactively generating credentials for students who were onboarded while a portal was disabled — now powered by the shared `backfillPortalCredentials()` and triggered either manually (school admin) or automatically (platform admin flips the flag) |
| **`backfillPortalCredentials()`** | The shared function (`lib/studentOnboarding.ts`) that scans for `status='active' AND password_hash IS NULL` students at a school and generates + delivers credentials for them — the single implementation behind both the manual backfill route and the automatic feature-override trigger |
| **Tier default** | The fallback `student-portal`/`parent-portal` value for a school with no explicit override, sourced from `plan_features` by subscription tier — Basic now defaults OFF, Standard/Premium default ON |
| **Per-school override** | A `school_feature_overrides` row that takes precedence over the tier default for one specific school — the only way `student-portal`/`parent-portal` can be changed, since they were removed from the platform-admin global features matrix |
| **WhatsApp scaffold** | The current state of `lib/whatsapp.ts` — every send logs a `whatsapp_messages` audit row with `status: 'queued'` and never reaches Meta's API; a real integration is a self-contained follow-up change inside that one file |
| **Soft delete** | "Remove Student" — flips `status` to `inactive`, preserves every linked record untouched, and now fires removal notifications to the student and every linked parent |
| **Hard delete** | Only happens via duplicate cleanup — actually removes the row, cascading real destruction to any history not explicitly reassigned first |
