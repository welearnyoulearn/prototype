# Class Management Feature — Complete Reference

> **Flowchart:** https://claude.ai/code/artifact/ec5d608f-779f-4800-a97b-f593e3b41d63

> Last verified against code: 2026-09-03
> Scope: every part of the codebase that touches Class Management — database tables, API routes, and the UI screen in School Admin, plus its downstream connections into Staff Onboarding and Student Onboarding.

This document explains Class Management **inch by inch**: what `classes`/`class_subjects`/`class_timetable` store, what every API route accepts and returns, what the screen looks like and does, and how the pieces connect into complete end-to-end workflows. Read it top to bottom once if you're new to this part of the codebase.

---

## Table of Contents

1. [The big picture in one paragraph](#1-the-big-picture-in-one-paragraph)
2. [Database schema](#2-database-schema)
3. [Every API route, in detail](#3-every-api-route-in-detail)
4. [School Admin: the Class Management screen](#4-school-admin-the-class-management-screen)
5. [The 3-option class-deletion flow](#5-the-3-option-class-deletion-flow)
6. [Teacher auto-assign — the Class Management side](#6-teacher-auto-assign--the-class-management-side)
7. [The Subjects tab — Syllabus-Customizer-only, this session](#7-the-subjects-tab--syllabus-customizer-only-this-session)
8. [Add-Student → redirects to Student Onboarding](#8-add-student--redirects-to-student-onboarding)
9. [Layout, scroll, and small UI fixes this session](#9-layout-scroll-and-small-ui-fixes-this-session)
10. [End-to-end scenarios, step by step](#10-end-to-end-scenarios-step-by-step)
11. [Known gaps and quirks](#11-known-gaps-and-quirks)
12. [Quick-reference glossary](#12-quick-reference-glossary)

---

## 1. The big picture in one paragraph

Class Management (`app/school-admin/components/ClassManagement.tsx`) is the hub that ties a school's `classes` rows (one per grade+section) to two other tables — `class_subjects` (which subjects are taught in that class, and by whom) and `class_timetable` (a generated day/period grid, gated behind a separate `timetable` feature flag) — and, critically, is not an island: it's the screen where the two other onboarding features actually converge. A class is created here (grade + section, uniquely constrained per school), and creation auto-populates its subjects from whatever the school has subscribed to via the Syllabus Customizer (falling back to a static per-curriculum guess-list only if nothing is subscribed yet), auto-matching a teacher to each subject by fuzzy-comparing the subject name against every active teaching staff member's onboarding-level `subject` field. From there, three things can each independently cause a `class_subjects.teacher_id` to fill in later: an admin assigning one explicitly here (which always wins over anything automatic), a teacher being onboarded or edited elsewhere in a way that newly matches an unfilled subject (the reverse-direction auto-assign covered in [§6](#6-teacher-auto-assign--the-class-management-side)), or — no longer possible as of this session — an admin manually typing a free-text subject name into this screen (that capability was removed; see [§7](#7-the-subjects-tab--syllabus-customizer-only-this-session)). Students are never created here at all — `students.grade`/`students.section` are matched against `classes.grade`/`classes.section` by string equality, not a foreign key, and the toolbar's "Add Student" control is now a pure redirect into Student Onboarding rather than an inline form. Deleting a class is the most consequential action on this screen: it unlinks the class's own `class_subjects`/`class_timetable`/`substitute_assignments` rows (teacher references nulled, rows preserved) and soft-deletes the `classes` row itself, but first forces the admin to explicitly choose what happens to any still-active students in that grade/section, via a 3-option modal described in [§5](#5-the-3-option-class-deletion-flow).

---

## 2. Database schema

All three tables live in `lib/db.ts`'s fresh-bootstrap SQL block; none of the columns relevant to this feature were added or changed this session (this session's work was entirely UI/API-route logic on top of the existing schema).

### `classes`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id` | INTEGER REFERENCES schools(id) ON DELETE CASCADE | Tenant key |
| `grade` | VARCHAR(20) NOT NULL | |
| `section` | VARCHAR(10) NOT NULL | |
| `class_teacher_id` | INTEGER REFERENCES teachers(id) ON DELETE SET NULL | The class's homeroom teacher — a single teacher can be class teacher of more than one class (the UI warns about this but allows it, see [§4](#4-school-admin-the-class-management-screen)) |
| `created_at` | TIMESTAMP DEFAULT NOW() | |
| — | `UNIQUE(school_id, grade, section)` | The real uniqueness constraint — this is what `POST /api/classes` relies on for its `ON CONFLICT`-free duplicate rejection (a raw `23505` caught and turned into "This class already exists") |

**`deleted_at`** (referenced throughout the delete/list routes as `c.deleted_at IS NULL`/`IS NOT NULL`) is used for soft-deleting a class — not shown in the `CREATE TABLE` block excerpted above but present and relied on consistently across `GET /api/classes`, `POST /api/classes` (auto-assign queries filter `c.deleted_at IS NULL`), and `DELETE /api/classes/[id]`.

### `class_subjects`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `class_id` | INTEGER REFERENCES classes(id) ON DELETE CASCADE | |
| `subject_name` | VARCHAR(100) NOT NULL | Free text at the column level, but in practice always sourced from `school_subjects.subject_name` (the Syllabus Customizer's subscribed-subject catalog) as of this session — see [§7](#7-the-subjects-tab--syllabus-customizer-only-this-session) |
| `teacher_id` | INTEGER REFERENCES teachers(id) ON DELETE SET NULL | NULL means "no teacher assigned yet" — the condition every auto-assign query scans for |
| `created_at` | TIMESTAMP DEFAULT NOW() | |

No `periods_per_week` column appears in the base `CREATE TABLE` excerpt read this session, but the API routes (`POST /api/classes` at class-creation time, `POST /api/classes/[id]/subjects` when adding one manually) both insert a `periods_per_week` value (hardcoded `4` in both call sites), and `GET /api/classes/[id]` selects it back out — it exists as a column, just added via a later `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration not captured in the excerpt above.

### `class_timetable`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `class_id` | INTEGER REFERENCES classes(id) ON DELETE CASCADE | |
| `school_id` | INTEGER REFERENCES schools(id) ON DELETE CASCADE | Denormalized alongside `class_id` — used directly in the auto-assign conflict-check subquery (`other.school_id = ct.school_id`) so a cross-class double-booking check doesn't need an extra join back to `classes` |
| `day_of_week` | VARCHAR(10) NOT NULL | |
| `period_number` | INTEGER NOT NULL | |
| `time_from` / `time_to` | VARCHAR(10) | |
| `subject_name` | VARCHAR(100) | |
| `teacher_id` | INTEGER REFERENCES teachers(id) ON DELETE SET NULL | |
| `room` | VARCHAR(50) | |
| `is_break` | BOOLEAN DEFAULT FALSE | |
| `break_label` | VARCHAR(50) | |
| `created_at` | TIMESTAMP DEFAULT NOW() | |

A later migration (`class_timetable_modes`, unrelated to this session's work) adds a master/slave scheduling concept and a `class_timetable.is_locked` column via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — not covered further here since it's outside this session's scope, but worth knowing it exists if editing timetable-adjacent code near what's described in this document.

Only active-feature note: the **Timetable tab and everything timetable-related in this screen is gated behind `useFeature('timetable')`**, a wholly separate feature flag from the ones covered in [§7](#7-the-subjects-tab--syllabus-customizer-only-this-session) — a school without the Timetable feature never sees the tab, never calls `loadTimetable()`, and the summary-card grid on the Overview tab collapses from 3 columns to 2.

---

## 3. Every API route, in detail

### `GET /api/classes` — the class list

Auth: `getAnySession()`, then a manual check that `session.schoolId === parseInt(school_id)` (except presumably platform admin, matching the pattern documented elsewhere in this codebase's other onboarding docs — not independently re-verified in this pass beyond confirming the session/schoolId check itself). Two modes selected by `?removed=true`:
- **Default (`removed` absent/false)**: active classes only (`c.deleted_at IS NULL`), each row carrying a computed `student_count` (`COUNT(*) FROM students WHERE grade/section/school_id match AND status = 'active'`) and `class_teacher_name` (left-joined from `teachers`). Ordered by `gradeOrderSql('c.grade')` then `c.section`. Result is cached (`getCache`/`setCache`, 60-second TTL, keyed `classes:{school_id}`) — the removed-list query is never cached.
- **`removed=true`**: soft-deleted classes (`c.deleted_at IS NOT NULL`), `student_count` computed against `status = 'inactive'` instead of `'active'` (deliberately: a removed class's students, if the admin chose the "deactivate" delete mode, are the ones this count is meant to surface), ordered `deleted_at DESC` first, then grade/section.

### `POST /api/classes` — create a class, with auto-subject-and-teacher setup

Auth: `requireFeeAccess(school_id)`. Body: `{ school_id, grade, section, class_teacher_id? }`. Inside one transaction:
1. Inserts the `classes` row (`UNIQUE(school_id, grade, section)` is what turns a duplicate into the caught `23505` → 409 `"This class already exists"`).
2. Resolves the subject list for this grade — **prefers the school's Syllabus Customizer subscription** (`school_subjects` filtered by `school_id, grade, academic_year`, where `academic_year` comes from `resolveAcademicYear(school_id)`), and **only if that returns zero rows**, falls back to the static per-curriculum guess-list (`getSubjectsForGrade(curriculumType, grade)` from `lib/curricula.ts`, where `curriculumType` is read from `curriculum_assignments` and defaults to `'CBSE'` if the school has no assignment row at all). The code comment explains why the subscribed list is preferred: it guarantees `class_subjects.subject_name` is byte-identical to `school_subjects.subject_name`, the join key `/api/syllabus` and the teacher class-subjects gate both rely on — the static guess-list's names ("Mathematics") can silently diverge from a school's actually-subscribed spelling ("Maths").
3. For each resolved subject name, calls `matchTeacher(subj.name, pool4Match)` — `pool4Match` is the school's active teaching staff filtered first to those grade-eligible for this class (`teaches_grades` includes this grade, or is empty/unrestricted), falling back to the *full* staff list only if zero teachers are grade-eligible. Inserts a `class_subjects` row per subject (`ON CONFLICT (class_id, subject_name) DO NOTHING`, `periods_per_week` hardcoded `4`), tracking which subjects got no match in `unmatched_subjects` for the response.
4. Commits, invalidates `classes:{school_id}` cache, returns the new class row plus `subjects_assigned` (count) and `unmatched_subjects` (string array) — the client (`addClass()` in `ClassManagement.tsx`) turns this straight into the `setupMsg` progress text ("`N` subjects assigned · `M` need a teacher (`names`)").

**Timetable is never auto-generated here** — a separate, explicit step in the Timetable tab, gated on `timetableFeatureEnabled`.

### `GET/PUT /api/classes/[id]`

- **GET**: fetches the class row (left-joined to `teachers` for `class_teacher_name`) plus its full `class_subjects` list (left-joined to `teachers` for `teacher_name`, ordered by `subject_name`) in one response — `requireFeeAccess(class.school_id)` gates it, looked up from the row itself before the access check runs (so a 404 for a nonexistent id never leaks whether the school_id would have been forbidden).
- **PUT**: the only field it accepts is `class_teacher_id` — `UPDATE classes SET class_teacher_id = $1 WHERE id = $2`. This is the route `saveClassTeacher()` calls from the class-detail header's "Assign"/"Change" control. Invalidates `classes:{school_id}` on success.

### `DELETE /api/classes/[id]` — the 3-mode rewrite

Covered in full in [§5](#5-the-3-option-class-deletion-flow). Body: `{ mode: 'deactivate' | 'reassign' | 'manual', targetClassId? }`, defaulting to `mode: 'deactivate'` if the body is missing or fails to parse as JSON at all — "matching the route's original always-deactivate behavior for any older caller," per the route's own comment, meaning a caller that predates this session's 3-mode rewrite (or that sends no body) gets the exact same behavior it always did.

### `GET/POST/PATCH/DELETE /api/classes/[id]/subjects` (referenced, not read line-by-line this session)

`ClassManagement.tsx` calls this route for: `GET` (via `loadSubjects()`), `POST` (via `addSubject()`, body `{ subject_name, teacher_id: null, periods_per_week: 4 }` — see [§7](#7-the-subjects-tab--syllabus-customizer-only-this-session) for why `teacher_id` is always `null` in the request now), `PATCH` (via `assignTeacherInline()`, body `{ subject_id, teacher_id }`), and `DELETE` (via `removeSubject()`, `?subject_id=`). The `POST` handler is inferred (not independently re-read this session beyond the client call site) to run the same `matchTeacher()`-based auto-match `POST /api/classes` uses at creation time, since `addSubject()`'s success handler branches on `data.teacher_name` being present to decide whether to show "✓ added · Teacher: X" versus "added, but no teacher's subject matched" — this response shape only makes sense if the server itself attempts a match and reports back whichever teacher (if any) it found, given the request body no longer supplies a `teacher_id` at all.

### `POST /api/class-timetable/generate`, `PUT /api/class-timetable` (referenced, not read line-by-line this session)

Called by `generateTimetable(forceReplace)` and `saveSlotEdit(slotId)` respectively — outside this session's changes and this document's primary scope; covered here only because the Timetable tab is part of the same screen. `generateTimetable` reports back `conflicts_auto_resolved`/`conflicts_need_manual` counts, surfaced in the tab's `genMsg` banner.

---

## 4. School Admin: the Class Management screen

**Screen:** `app/school-admin/components/ClassManagement.tsx`

### Layout

A two-pane layout: a fixed-width (`w-56`) left sidebar listing every class grouped by grade (`byGrade`, sorted numerically where possible via `sortedGrades`), and a flexible right panel (`ClassDetail`) showing whichever class is `selectedId`. The outer container is `flex gap-0 h-[calc(100vh-140px)] min-h-[600px]` — see [§9](#9-layout-scroll-and-small-ui-fixes-this-session) for why the height became a fixed `calc()` this session instead of an unconstrained `h-full`.

The sidebar's `+` button toggles an inline "Create & Setup" form (grade + section inputs, validated client-side: grade must be numeric 1 through the platform's max numeric grade from `GRADE_SEQUENCE`, section must be a single letter A–Z, uppercased automatically). A `showRemoved` collapsible section below the active class list shows every soft-deleted class (`removedClasses`, fetched separately via `?removed=true`), each row struck-through with an opacity reduction and a "Removed" pill, plus its deactivated-student count.

### The class-detail panel (`ClassDetail`) — five tabs

`overview | subjects | timetable | students | syllabus`, filtered to drop `timetable` entirely when `!timetableFeatureEnabled`. Selecting a tab is local state (`tab`), reset to `'overview'` whenever the selected class itself changes (a `useEffect` keyed on `cls.id`).

- **Overview**: a class-teacher banner (violet if assigned, amber "Not assigned yet" if not), a 2- or 3-column summary-card grid (Students / Subjects / Timetable-ready — the third card only when `timetableFeatureEnabled`), a "Teachers & Subjects" list (only rendered if `subjects.length > 0`), an **Attendance — Last 7 Days** card (only rendered `if (hasAttendance)` — see [§9](#9-layout-scroll-and-small-ui-fixes-this-session)... actually covered fully in this section directly below), and a quick-actions row linking into the other tabs.
- **Subjects**: covered in full in [§7](#7-the-subjects-tab--syllabus-customizer-only-this-session).
- **Timetable**: only reachable if the school has the `timetable` feature. Empty state branches on whether subjects exist yet ("Add subjects first" vs. "Ready to generate!"); once generated, renders `TimetableGrid`, a day×period grid component with inline edit-in-place per cell (clicking a non-break slot opens a small inline subject/teacher editor), red-highlighted teacher-double-booking conflicts (`has_conflict`), and a violet dot marking any cell that was manually edited and is preserved across a "Regenerate."
- **Students**: a simple roster list for this exact grade+section (`GET /api/students?school_id=&grade=&section=`), with the "Add Student" toolbar button — see [§8](#8-add-student--redirects-to-student-onboarding).
- **Syllabus**: renders the shared `StudentSyllabus` component (from the student portal's own component tree, reused here — `import StudentSyllabus from '../../student/components/StudentSyllabus'`) scoped to this class's `classId`/`grade`, giving the school admin the same syllabus view a student in this class would see, without leaving Class Management.

### The Attendance Feature Gate

`const hasAttendance = useFeature('attendance')` at the top of `ClassDetail`. When `false`:
- `loadAttendanceSummary()` (which fires seven parallel `GET /api/attendance?...&summary=true` calls, one per of the last 7 days) is **never called at all** — it's invoked only from the `useEffect` that fires `if (hasAttendance) loadAttendanceSummary()` on class-selection change, and from the card's own manual "Refresh" button, which doesn't exist when the card itself doesn't render.
- The entire "Attendance — Last 7 Days" card is conditionally unrendered (`{hasAttendance && (...)}`) — not merely disabled or shown-empty. A school without the Attendance Tracking feature never sees any attendance-shaped UI anywhere in Class Management, and never issues any attendance-related network request from this screen.

This matches the same "hide entirely, don't fetch, don't disable" pattern used for the Timetable tab's own feature gate (`timetableFeatureEnabled`) elsewhere in the same component.

### Class teacher assignment and its conflict check

The header's class-teacher select (`editingClassTeacher` toggle) groups teachers into two `<optgroup>`s — grade-eligible first, then "Other grades" — using the same `canTeachGrade()` helper defined locally in this file (mirroring, not importing, the equivalent logic in `lib/matchTeacher.ts`'s `gradeInRange()`; see [§11](#11-known-gaps-and-quirks) for the duplication this represents). Saving checks client-side whether the selected teacher is already class teacher of a *different* class (`allClasses.find(c => c.id !== cls.id && c.class_teacher_id === tid)`); if so, a confirmation modal explains a teacher **can** legitimately be class teacher of more than one class but warns it "may cause scheduling conflicts," and only proceeds to the actual `PUT` on explicit "Assign Anyway" confirmation (`saveClassTeacher(true)`, bypassing the client-side conflict check on the retry).

---

## 5. The 3-option class-deletion flow

### The modal (`ClassManagement`'s top-level state, not `ClassDetail`'s)

`openDeleteModal(e, cls)` — triggered by the ✕ button next to any class in the sidebar list (`e.stopPropagation()` so it doesn't also select the class) — opens a modal seeded with `deleteMode: 'deactivate'` (the default, always) and a cleared `deleteTargetClassId`/`deleteError`. If the class has zero active students, the 3-option radio group doesn't render at all — the modal shows only a plain confirmation ("Its subject-teacher assignments... will be permanently removed") with no student-handling choice needed. If it has one or more active students, all three radios render:

1. **"Deactivate these students"** (`deleteMode: 'deactivate'`, the pre-selected default) — described in the UI as "They're marked inactive — no longer counted as enrolled, portal access is revoked."
2. **"Move them to another section"** (`deleteMode: 'reassign'`) — reveals a `<select>` of every *other* class in the *same grade* (`classes.filter(c => c.grade === deleteTarget.grade && c.id !== deleteTarget.id)`), each option labeled with its section letter and current student count. The confirm button is disabled until a target is chosen (`deletingClass || (deleteMode === 'reassign' && !deleteTargetClassId)`).
3. **"I'll handle it myself"** (`deleteMode: 'manual'`) — described as "Deactivate or move them from Students first — the class won't delete until none are active here."

### `confirmDeleteClass()` → `DELETE /api/classes/[id]`

Sends `{ mode, targetClassId: deleteMode === 'reassign' ? Number(deleteTargetClassId) : undefined }`. Server-side (`app/api/classes/[id]/route.ts`), after the `requireFeeAccess` tenant check and a fresh `SELECT COUNT(*) ... WHERE status = 'active'` re-count of the class's current active students (never trusting whatever count the client-side modal was rendered with — a real-time re-check):

- **`mode: 'manual'`**: if `activeStudentCount > 0`, returns **409** `{ error: 'Students still active in this class', activeStudentCount }` and does **nothing else** — no deletion of any kind proceeds. Client-side, `confirmDeleteClass()`'s error branch specifically checks `res.status === 409 && typeof data.activeStudentCount === 'number'` and re-shows the same modal with an inline error reading "`N` student(s) are still active in this class. Choose how to handle them, or deactivate/reassign them yourself and try again." — the modal is never force-closed on this path; the admin must either switch to a different mode or genuinely clear the class out-of-band (via the Students directory) and retry the same "manual" mode, which will then see `activeStudentCount === 0` and fall through to the cleanup/soft-delete below. If there are zero active students already (the common "I already moved them" case), this mode falls straight through with no special handling.
- **`mode: 'reassign'`**: validates `targetClassId` is present (400 if not), fetches the target class and checks, in order: it exists and isn't itself soft-deleted (404), it's in the **same school** (400 `"Target class must be in the same school"`), it's the **same grade** (400 `"Target class must be the same grade"`), and it's a **different section** (400 `"Target class must be a different section"` — moving a class into itself is rejected). Then, before touching any student row, it runs a **roll-number collision check**: for every active student in the source class with a non-null `school_roll_number`, it checks whether any active student in the target grade/section already holds that same `school_roll_number`; any collisions are collected and returned as a single 409 naming every colliding student by name and roll number (`"Roll number already taken in the target section for: {name} (#{roll}), ... . Resolve these first."`) — **no partial move happens** if any collision exists; the whole request fails before the `UPDATE` runs. If clear, a single bulk `UPDATE students SET grade = $target_grade, section = $target_section WHERE ... AND status = 'active'` moves every active student from source to target in one statement, and the target class's own `classes:{school_id}` cache entry is separately invalidated (in addition to the source school's own invalidation later in the same request — in this feature they're always the same school, so this is effectively one invalidation, not two meaningfully different ones).
- **`mode: 'deactivate'` (default)**: a single `UPDATE students SET status = 'inactive' WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'` — every active student in the class becomes inactive, no reassignment, no confirmation beyond the modal itself.

### The convergence point — identical for all three modes

Regardless of which branch ran, execution falls through to the same four statements:

```sql
UPDATE class_timetable SET teacher_id = NULL, is_manual = FALSE WHERE class_id = $1
UPDATE class_subjects SET teacher_id = NULL WHERE class_id = $1
UPDATE substitute_assignments SET original_teacher_id = NULL WHERE class_id = $1 AND original_teacher_id IS NOT NULL
UPDATE substitute_assignments SET substitute_teacher_id = NULL WHERE class_id = $1 AND substitute_teacher_id IS NOT NULL
UPDATE classes SET deleted_at = NOW() WHERE id = $1
```

**Fixed this session — the class row is soft-deleted (`deleted_at`), and its `class_subjects`/`class_timetable`/`substitute_assignments` rows are now unlinked (teacher references nulled) rather than hard-deleted.** Previously these three tables' rows for the class were genuinely, permanently `DELETE`d at this point — a real asymmetry against the staff-removal flow (`DELETE /api/teachers/[id]`, which exclusively nulls foreign keys, never deletes rows). By the time this convergence point runs, `activeStudentCount` is always already `0` for the class (enforced above: `manual` refuses to proceed otherwise, `reassign`/`deactivate` just cleared it), so the fix only changes what happens to the class's own subject/timetable/substitute rows, never student data. A restored ("Removed" → un-delete) class now comes back with its subject list, timetable, and substitute history intact instead of empty. Cache invalidation afterward covers `classes:{school_id}`, `timetable:school:{school_id}`, `health:{school_id}`, `timetable:class:{id}`, and `subjects:class:{id}`.

---

## 6. Teacher auto-assign — the Class Management side

The full mechanism — `matchTeacher()` (subject→teacher, used at class-creation time and, inferred, in `POST /api/classes/[id]/subjects`) and its new-this-session reverse counterpart `findAutoAssignableSubjects()` (teacher→subjects, wired into staff onboarding's bulk-insert and edit routes) — is documented in complete technical detail in `DOCS/STAFF-ONBOARDING-FEATURE-README.md`'s §8 and new §8a; this section describes the same mechanism strictly from the Class Management side, i.e., what an admin working in *this* screen actually experiences, without re-deriving the matching algorithm itself.

From Class Management's point of view, a `class_subjects` row can end up with a filled `teacher_id` via any of three independent triggers, and all three can fire for the exact same row over its lifetime without conflicting:

1. **At class creation** (`POST /api/classes`) — every subject resolved for the new class is immediately run through `matchTeacher()` against the school's grade-eligible teaching staff; a match fills `teacher_id` on insert, a non-match leaves it `NULL` and surfaces the subject's name in the creation response's `unmatched_subjects` list (shown in the "Create & Setup" progress banner).
2. **A teacher is onboarded or edited elsewhere** (Staff Onboarding or the Staff Directory, not this screen at all) — if that teacher's `subject` (and, for a PUT edit, only if `subject` or `teaches_grades` actually changed) matches one or more of *this school's* currently-unfilled `class_subjects` rows within the teacher's grade eligibility, `findAutoAssignableSubjects()` fills them automatically, server-side, with no action taken in Class Management itself. An admin working in this screen would simply notice, the next time they load or refresh the Subjects tab, that a previously-amber "No teacher" pill has turned into a green teacher-name pill — with no visible cause in this screen's own history, since the trigger happened entirely on the Staff side.
3. **An admin manually assigns a teacher directly in Class Management** — either via the Subjects tab's per-row "Assign Teacher" → inline `<select>` → `PATCH /api/classes/[id]/subjects`, or (for the special case of the whole class's homeroom teacher, a separate field entirely) the class-detail header's "Assign"/"Change" control → `PUT /api/classes/[id]`. **This always wins outright** — both auto-assign paths (creation-time `matchTeacher()` and the reverse `findAutoAssignableSubjects()`) only ever act on rows where `teacher_id IS NULL`; neither ever overwrites an explicit assignment made here.

A concrete illustration of trigger 2, tied back to the Staff README's own live-verified scenario: an admin in Class Management sees three unfilled Telugu subjects (Grades 6, 7, 9) with amber "No teacher" pills. Nothing in this screen changes. Elsewhere, a school admin onboards a new "Telugu Teacher" via Staff Onboarding with `teaches_grades: "6,7,8"`. The instant that onboarding request completes server-side, Grades 6 and 7's Telugu subjects here silently pick up the new teacher (Grade 9's does not, correctly excluded by the grade restriction) — an admin who happens to have this screen open and refreshes the Subjects tab would see the change appear with no corresponding action taken in Class Management itself.

---

## 7. The Subjects tab — Syllabus-Customizer-only, this session

### What was removed

Two capabilities that previously existed in the Subjects tab's "add a subject" area are **gone entirely** as of this session, confirmed absent from the current source:

- **The static-curriculum "Suggested Subjects" picker** — a set of buttons for named curricula (CBSE / AP SSC / SSC / All) that used to offer a canned subject list to click-add from, independent of whether the school had subscribed to anything via the Syllabus Customizer.
- **The free-text "Add Custom Subject" manual form** — a plain text input letting an admin type any subject name directly and add it to the class, with no catalog backing it at all.

### What replaced them

`availableSuggestions` is now computed strictly from `subscribedSubjects` (loaded via `loadSubscribedSubjects()`, which calls `GET /api/school/subjects?school_id=` and filters the response to rows matching this class's own `grade`) minus whatever subjects are already assigned to the class (`existingNames`, a lowercased `Set`). The Subjects tab's own code comment states the rationale directly: *"Subjects only ever come from the Syllabus Customizer subscription now — no static curriculum guess-list fallback and no free-typed custom subjects, so `class_subjects.subject_name` always matches `school_subjects.subject_name` exactly."*

Two render branches, keyed on whether `subscribedSubjects` (state, `null` until loaded, `string[] | null` afterward) has any entries for this grade:

- **Subscribed** (`subscribedSubjects` truthy and `availableSuggestions.length > 0`): renders the same violet click-to-add chip row as before — `{availableSuggestions.map(name => <button onClick={() => addSubject(name)}>+ {name}</button>)}` — captioned "Subscribed Syllabus Subjects — Grade `{grade}`" with a note that clicking auto-assigns a teacher.
- **Not subscribed** (`subscribedSubjects` is `null`, i.e. the grade has zero rows in `school_subjects`): a violet notice box reads **"No subjects subscribed for Grade `{grade}` yet"** with a subtext explaining subjects subscribed in the Syllabus Customizer will appear here automatically, plus a **"Go to Syllabus Customizer →"** button that calls `onNavigate?.('curriculum')` — a direct cross-navigation into the Curriculum Customizer screen's own top-level nav key.

### `addSubject(name)` — simplified signature

```ts
async function addSubject(name: string) {
  const subjectName = name.trim()
  if (!subjectName) return
  if (subjects.some(s => s.subject_name.toLowerCase() === subjectName.toLowerCase())) {
    setSubjectMsg({ text: `"${subjectName}" is already added`, ok: false })
    ...
  }
  ...
  const res = await fetch(`/api/classes/${cls.id}/subjects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject_name: subjectName, teacher_id: null, periods_per_week: 4 }),
  })
  ...
}
```

Previously this function accepted `ppw` (periods-per-week) and `teacherId` as parameters, presumably fed by the removed manual/custom-subject form's own input fields. Now it takes only `name` — a plain string, always coming from a chip's own subscribed-subject label, never free-typed — and the POST body hardcodes `teacher_id: null` and `periods_per_week: 4` unconditionally. Sending `teacher_id: null` explicitly (rather than omitting the field) is what triggers the server-side `matchTeacher()` auto-match described in [§6](#6-teacher-auto-assign--the-class-management-side) — the response's `data.teacher_name` (present or absent) is what `addSubject()`'s success handler branches on to decide between the "✓ added · Teacher: X" and "added, but no teacher's subject matched — assign one manually below" banner text.

---

## 8. Add-Student → redirects to Student Onboarding

### What was removed

The Students tab previously had an inline quick-add form for creating a single student directly from Class Management, without leaving the screen — described in the task brief as backed by `handleAddStudent`/`showAddStudent` state. **None of that state or its rendering exists in the current `ClassManagement.tsx`** — confirmed by reading the full file: there is no `showAddStudent`, `handleAddStudent`, or any inline form markup anywhere in the Students tab's JSX. The tab now renders only a roster list and two navigation triggers.

### What replaced it

Both call sites now do the same thing — call `onNavigate?.('students', 'onboard')` — a two-argument navigation call, not a same-screen state change:

```tsx
<button onClick={() => onNavigate?.('students', 'onboard')} data-testid="class-add-student">
  Add Student
</button>
```
in the toolbar, and, in the empty state (`students.length === 0`):
```tsx
<button onClick={() => onNavigate?.('students', 'onboard')} className="...underline text-xs">
  Add the first student →
</button>
```

### The `navigateTo(key, subTab)` extension in `page.tsx`

`ClassManagement` receives `onNavigate` as its `onNavigate` prop directly from `app/school-admin/page.tsx`'s own `navigateTo` callback (`<ClassManagement schoolId={...} onNavigate={navigateTo} />`). `navigateTo` gained an optional second parameter this session:

```ts
const navigateTo = useCallback((key: string, subTab?: string) => {
  setActiveNav(key)
  setVisited(prev => new Set([...prev, key]))
  setSidebarOpen(false)
  if (key === 'staff') setStaffSubTab((subTab as 'directory' | 'onboard') || 'directory')
  if (key === 'students') setStudentsSubTab((subTab as 'list' | 'onboard') || 'list')
  ...
}, [...])
```

Previously, navigating to the `students` top-level nav key always landed on the Student Management screen's default `'list'` sub-tab (`studentsSubTab`, a separate piece of `page.tsx` state governing the List/Onboard toggle inside that screen). The `subTab` parameter is optional specifically so every *other* existing caller of `navigateTo` — which pass only `key`, no second argument — is completely unaffected and keeps landing on each screen's original default sub-tab. The `'staff'` key's own equivalent (`staffSubTab`) already existed before this session (used by, among other things, `Overview`'s own onboarding shortcuts) — this session's actual code change was adding the parallel `'students'` branch and threading the new parameter through `navigateTo`'s signature so `ClassManagement`'s new redirect could reach it.

The net effect: clicking "Add Student" (or the empty-state link) in Class Management switches the whole app's active nav to Student Management **and** pre-selects its "Onboard Students" sub-tab in one click, landing the admin directly on `StudentOnboarding.tsx`'s grid — with no memory of which class prompted the navigation (grade/section are not passed through or pre-filled anywhere in this call chain; the admin must still pick the grade/section again in the onboarding grid itself).

---

## 9. Layout, scroll, and small UI fixes this session

### The height/scroll fix

The outer two-pane container's className changed from `flex gap-0 h-full min-h-[600px]` to `flex gap-0 h-[calc(100vh-140px)] min-h-[600px]`. Under the old `h-full`, the container had no bounded height of its own to inherit from in some layout contexts, which meant the sidebar's `overflow-y-auto` class list and the right panel's own `overflow-y-auto` region never actually had to scroll — their content simply pushed the whole page taller instead, "below the fold" in the sense that a long class list or a tall class-detail view extended past the visible viewport rather than scrolling within its own pane.

Fixing the height to `calc(100vh - 140px)` (a fixed viewport-relative height accounting for the app's own header chrome) gave both `overflow-y-auto` regions a real, bounded box to scroll inside — and, as a direct consequence, **activated a pre-existing but previously-inert scroll-to-top effect**:

```ts
useEffect(() => {
  if (selectedId) rightPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
}, [selectedId])
```

This `useEffect` already existed in the component before this session — calling `.scrollTo()` on the right panel's ref every time `selectedId` changes — but on an unbounded-height container, that same `.scrollTo({top: 0})` call was a no-op in practice: there was no meaningful scroll position to reset, since the panel's content never overflowed its own box in the first place (the whole page scrolled instead). With the container's height now bounded, this effect became functionally live: selecting a different class in the sidebar now visibly, smoothly scrolls the right-hand detail panel back to its top, even if the admin had scrolled deep into a long Subjects or Timetable tab on the previously-selected class.

### The class-removal ✕-button visibility fix

Scoped narrowly to exactly one button — the per-class remove control in the sidebar list. Before:
- `opacity-0 group-hover:opacity-100` — completely invisible until the mouse hovered the row, making it both hard to discover (a new admin might not know it exists at all) and hard to precisely target (a fully transparent element still occupies layout space, but nothing visually confirms where to click until hover reveals it).
- A bare `✕` text glyph as the button's only content, with no `title` or `aria-label`.

After:
```tsx
<button onClick={e => openDeleteModal(e, cls)} data-testid={`delete-class-${cls.id}`}
  title={`Remove Grade ${cls.grade} – ${cls.section}`}
  aria-label={`Remove Grade ${cls.grade} – ${cls.section}`}
  className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
</button>
```
Always visible (a neutral gray `w-6 h-6` icon button), hovers to a red text/background combination, uses a proper inline SVG X icon instead of a text glyph, and carries both a `title` tooltip and an `aria-label`, each naming the exact class ("Remove Grade 10 – A") rather than a generic "Remove" or "Delete." This change was deliberately scoped to just this one control — the file contains other low-visibility icon buttons elsewhere (for example, the Subjects tab's per-subject remove button, still a bare `✕` at `text-red-300 hover:text-red-500`) that were **not** touched, matching the instruction to fix only what was specifically asked rather than sweep the whole file for similar patterns.

---

## 10. End-to-end scenarios, step by step

### Scenario A: A brand-new class is created and gets a full head start

1. Admin clicks `+`, types Grade `9`, Section `C`, clicks "Create & Setup."
2. `POST /api/classes` creates the row, resolves Grade 9's subscribed subjects from `school_subjects` (say six subjects, all subscribed via Syllabus Customizer), and for each one runs `matchTeacher()` against Grade-9-eligible active teaching staff. Four match immediately (an exact or fuzzy subject-name hit); two don't (no onboarded teacher's `subject` field is a good match for them yet).
3. The response returns `subjects_assigned: 6, unmatched_subjects: ['Music', 'Physical Education']`. The "Create & Setup" banner shows `4 subjects assigned · 2 need a teacher (Music, Physical Education)` — a slight quirk worth noting: the message's own "N subjects assigned" number is actually the *unmatched* count subtracted from the raw `subjects_assigned` total in the client's own string-building, not a distinct server-reported "matched" count — the point being the admin sees at a glance which two subjects still need attention.
4. Admin opens the new class, Subjects tab, sees Music and Physical Education both showing amber "No teacher" pills; the other four show green teacher-name pills.
5. A week later, a PE teacher is onboarded via Staff Onboarding with `subject: 'Physical Education'`. `findAutoAssignableSubjects()` runs automatically as part of that onboarding request, finds Grade 9-C's unfilled `class_subjects` row for that exact name, and fills it — with no action taken in Class Management. The admin, next time they open this class's Subjects tab, sees Physical Education's pill has turned green with no visible cause in this screen's own history.

### Scenario B: A class is deleted with students moved to a sibling section

1. Grade 8-B has 12 active students and an admin decides to consolidate it into 8-A (which has room). They click the ✕ on 8-B.
2. Since `student_count > 0`, all three radio options render. The admin picks "Move them to another section," and the target `<select>` (populated with every other Grade 8 class — here, just 8-A) is chosen.
3. Confirming sends `DELETE /api/classes/{8B-id}` with `{ mode: 'reassign', targetClassId: {8A-id} }`.
4. Server validates: same school ✓, same grade (`8` === `8`) ✓, different section (`A` !== `B`) ✓. It then checks for `school_roll_number` collisions between 8-B's active students and 8-A's active students — say two of 8-B's students happen to share a roll number with two existing 8-A students. The whole request fails with a 409 naming those four students by name and roll number; **no student is moved**.
5. The admin resolves the collision manually first (editing roll numbers via the Students directory), then retries the exact same "reassign" delete. This time there's no collision — the bulk `UPDATE students SET grade='8', section='A' WHERE ... grade='8' AND section='B' AND status='active'` moves all 12 students in one statement.
6. Regardless of the retry, once the student-handling step succeeds, `class_timetable`/`class_subjects`/`substitute_assignments` for 8-B are unlinked (teacher references nulled, rows kept) and `classes.deleted_at` is set for 8-B's row. 8-B now appears only in the "Removed" collapsible section of the sidebar, showing its now-inactive-relative-to-this-class student count (which, since these students were *moved*, not deactivated, will actually show as `0` — the removed-list's `student_count` query counts `status = 'inactive'` students still matching 8-B's own grade/section, and a *moved* student's `grade`/`section` no longer matches 8-B's values at all, having been updated to 8-A's).

### Scenario C: An admin tries "manual" mode without actually clearing students first

1. Grade 6-A has 3 active students. The admin, believing them already reassigned elsewhere, picks "I'll handle it myself" and confirms.
2. `DELETE /api/classes/{6A-id}` with `{ mode: 'manual' }`. Server re-counts active students fresh (`3`, unchanged since the modal was rendered) and, since `mode === 'manual'` and `activeStudentCount > 0`, returns `409 { error: 'Students still active in this class', activeStudentCount: 3 }` — nothing else runs; no deletion of any kind happens.
3. Client-side, `confirmDeleteClass()`'s error handling recognizes this specific 409 shape and re-shows the same delete modal with the inline message "3 students are still active in this class. Choose how to handle them, or deactivate/reassign them yourself and try again." The modal is not dismissed.
4. The admin actually goes to the Students directory, deactivates the 3 students there, returns to Class Management, and clicks the ✕ on 6-A again — opening a fresh modal instance. This time `student_count` on the class row itself may still show `3` if `loadData()` hasn't refetched yet (the sidebar's `classes` state is only refreshed after a successful delete or on initial load), so the 3-option radio group may still render even though the true current count is `0` — but re-selecting "manual" and confirming now succeeds, since the server's own fresh re-count finds `activeStudentCount === 0` and falls through to the standard cleanup/soft-delete.

### Scenario D: An admin tries to add a subject to a grade with nothing subscribed yet

1. Grade 11 has no rows in `school_subjects` at all (the school hasn't touched the Syllabus Customizer for Grade 11 yet).
2. Admin opens a Grade 11 class's Subjects tab. `loadSubscribedSubjects()` finds zero matching rows, so `subscribedSubjects` state resolves to `null` (not an empty array — the code explicitly distinguishes "loaded, but zero for this grade" as `null`, via `setSubscribedSubjects(forGrade.length > 0 ? forGrade : null)`).
3. Instead of any chip row or free-text form, a violet notice box reads "No subjects subscribed for Grade 11 yet" with a "Go to Syllabus Customizer →" button.
4. The admin clicks it — `onNavigate?.('curriculum')` switches the app's active nav straight to the Curriculum Customizer screen (no sub-tab targeting needed here, since Curriculum Customizer doesn't have the same List/Onboard sub-tab split Staff/Students do).
5. After subscribing several subjects to Grade 11 there, the admin returns to this class in Class Management; `loadSubscribedSubjects()` (re-fired on class-selection change) now finds real rows, `subscribedSubjects` becomes a populated array, and the chip-based add-subject UI appears in place of the notice box.

---

## 11. Known gaps and quirks

- ~~A class's own `class_subjects`/`class_timetable`/`substitute_assignments` rows are hard-deleted, not soft-deleted or unlinked, when the class itself is (only) soft-deleted.~~ **Fixed** — the delete route's convergence point (see [§5](#5-the-3-option-class-deletion-flow)) now unlinks (`teacher_id`/`original_teacher_id`/`substitute_teacher_id` set to `NULL`) instead of deleting the rows, matching the pattern already used for staff removal. A soft-deleted class in the "Removed" list now retains its subject list, timetable, and substitute history.
- **`canTeachGrade()` in `ClassManagement.tsx` is a near-duplicate of `gradeInRange()` in `lib/matchTeacher.ts`** — both implement the identical rule (empty/null `teaches_grades` means unrestricted; otherwise a trimmed, uppercased inclusion check against a comma-split list), but as two separately-maintained functions in two different files rather than one shared import. A future change to the grade-eligibility rule (e.g., supporting grade ranges like "6-8" instead of only explicit comma lists) would need to be made in both places, and nothing in either file cross-references the other as a reminder to keep them in sync.
- **The "reassign" delete mode's roll-number collision check only looks at `school_roll_number`, not the internal `roll_number` login ID** — which is fine, since `roll_number` has no per-class uniqueness constraint anywhere in the system to begin with (see the Student Onboarding README's own glossary/known-gaps entries on this), but it does mean this check is specifically protecting the one constraint (`idx_students_school_roll_unique`, scoped to `(school_id, grade, section, school_roll_number)`) that would otherwise cause the bulk `UPDATE` to fail with a raw constraint-violation 500 rather than a clear, named, per-student 409 — the check exists purely to turn a would-be crash into a friendly error, not as a general-purpose duplicate-student guard.
- **The "reassign" and "deactivate" delete modes both operate on students by `grade`/`section` string match, not by any `class_id` foreign key** — consistent with the rest of the codebase's students-to-classes relationship (documented at length in the Student Onboarding README's §8 table: "By matching `(school_id, grade, section)` string values against the `classes` row — not a `class_id` foreign key on `students`"), but worth restating here specifically because it means the delete route's own student-affecting `UPDATE` statements have no referential-integrity backstop at all beyond the string match itself; a student whose `grade`/`section` text happens to typo-match a class that doesn't really represent their real class (a data-entry error elsewhere) would be silently swept into whichever delete-mode `UPDATE` runs, with no cross-check against a real foreign key.
- **Attendance-gating (`useFeature('attendance')`) is applied consistently within this screen** — the summary card is fully unrendered and its fetch is never issued when the feature is off, exactly matching the equally-thorough Timetable feature gate elsewhere in the same file. No gap was found here in this pass; called out explicitly because the task brief asked this to be checked specifically, not because a problem was found.
- **The Syllabus tab reuses the student portal's own `StudentSyllabus` component directly** (`import StudentSyllabus from '../../student/components/StudentSyllabus'`) rather than a school-admin-specific variant — a relative cross-portal import that works today because both portals live in the same Next.js app, but ties Class Management's build to whatever that student-portal component happens to require/render, including any student-specific chrome or copy that may not be perfectly appropriate for an admin's read of the same data (not independently verified in this pass whether the component renders any student-specific UI language when used this way — flagged as worth checking, not confirmed as a problem).
- **The empty-state "Add the first student →" link and the toolbar "Add Student" button both navigate away from Class Management entirely, with no memory of which class prompted the click** — grade/section are never passed through `navigateTo('students', 'onboard')` in any form (no query param, no shared state, no pre-fill), so an admin who clicked through from Grade 7-B's empty Students tab lands on a blank onboarding grid and must re-select Grade 7 and Section B there from scratch, same as if they'd navigated to Student Onboarding directly from the main sidebar.

---

## 12. Quick-reference glossary

| Term | Meaning |
|---|---|
| **`classes`** | One row per grade+section per school, `UNIQUE(school_id, grade, section)`; soft-deleted via `deleted_at`, never hard-deleted itself |
| **`class_subjects`** | The real per-class subject-and-teacher assignment table; `subject_name` free-text at the column level but in practice always sourced from `school_subjects` (Syllabus Customizer) as of this session; unlinked (`teacher_id` nulled, row kept) when its class is deleted |
| **`class_timetable`** | A generated day/period grid per class, gated behind the separate `timetable` feature flag; unlinked alongside `class_subjects` on class deletion |
| **`matchTeacher()`** | `lib/matchTeacher.ts` — subject→teacher fuzzy match (exact → partial containment → shared word), run at class creation and (inferred) when a subject is added manually via `POST /api/classes/[id]/subjects` |
| **`findAutoAssignableSubjects()`** | `lib/matchTeacher.ts` — the reverse, teacher→subjects direction, fired from Staff Onboarding's bulk-insert and edit routes; fully documented in the Staff Onboarding README's §8a, described here only from the Class Management side (see [§6](#6-teacher-auto-assign--the-class-management-side)) |
| **3-mode delete** | `deactivate` / `reassign` / `manual` — the three choices in the class-deletion modal, all converging on the same `class_subjects`/`class_timetable`/`substitute_assignments` unlink + `classes.deleted_at` soft-delete; see [§5](#5-the-3-option-class-deletion-flow) |
| **`reassign` mode** | Moves a class's active students into a different section of the *same* grade, after a roll-number collision pre-check that fails the whole request (409, named students) rather than allowing a partial move |
| **`manual` mode** | Does nothing to students itself — re-checks the live active-student count and 409s with that count if any remain, letting the same modal re-open for another attempt |
| **Subscribed subjects** | Subjects a school has added to a grade via the Syllabus Customizer (`school_subjects` table) — as of this session, the *only* source for the Subjects tab's add-subject chips; no static curriculum fallback and no free-text entry remain in this screen |
| **`onNavigate(key, subTab?)`** | The optional-second-argument navigation callback threaded from `page.tsx`'s `navigateTo` down into `ClassManagement` (and other screens); `subTab` is new this session, letting a caller land directly on a specific sub-tab (e.g. Students → Onboard) instead of each screen's own default |
| **`useFeature('attendance')` / `useFeature('timetable')`** | Two independent feature-flag hooks gating, respectively, the Overview tab's Attendance card (and its underlying fetch) and the entire Timetable tab — both hide fully rather than disable when off |
| **`canTeachGrade()`** | A local helper in `ClassManagement.tsx`, functionally identical to (but not sharing code with) `lib/matchTeacher.ts`'s `gradeInRange()` — see [§11](#11-known-gaps-and-quirks) |
