# Syllabus Feature — Complete Reference

> Last verified against code: 2026-09-06
> Scope: every part of the codebase that touches "syllabus" — database tables, API routes, and UI screens across all five portals (Platform Admin, School Admin, Teacher, Student, Parent).
> Historical context: `docs/syllabus-integration-plan.md` (the original build plan, now superseded by this document). This revision supersedes the 2026-09-04 version of this same file. The biggest changes since then: **teachers now have full rename/delete control over every chapter/topic in their school's own copy** (the earlier `is_custom` "board-mandated content is locked" guardrail was removed entirely, by explicit product decision — see [§4](#4-every-api-route-in-detail) and [§7](#7-teacher-syllabus-tracking-and-class-syllabus-setup)); a new **sibling-setup-copy** flow lets a teacher clone an already-completed Class Syllabus Setup from another section of the same grade instead of repeating it from scratch; subscribing a subject now **auto-assigns it to every existing class of that grade** (and Class Management no longer offers a manual "click to add" suggestion list); and the School Admin **Syllabus Tracking** screen was rebuilt from scratch as a two-pane class/teacher coverage view with a real trend chart.

This document explains the syllabus feature **inch by inch**: what each database table stores, what every API route accepts and returns, what every screen looks like and does, and how the pieces connect into complete end-to-end workflows. If you're new to this part of the codebase, read it top to bottom once — it's written in the order you'd actually learn the system.

---

## Table of Contents

1. [The big picture in one paragraph](#1-the-big-picture-in-one-paragraph)
2. [The core idea: master catalog → school copy → class setup](#2-the-core-idea-master-catalog--school-copy--class-setup)
3. [Database schema, table by table](#3-database-schema-table-by-table)
4. [Every API route, in detail](#4-every-api-route-in-detail)
5. [Platform Admin: building the master catalog](#5-platform-admin-building-the-master-catalog)
6. [School Admin: subject management only](#6-school-admin-subject-management-only)
6b. [School Admin: the Syllabus Tracking screen](#6b-school-admin-the-syllabus-tracking-screen--rebuilt-this-session)
7. [Teacher: syllabus tracking and Class Syllabus Setup](#7-teacher-syllabus-tracking-and-class-syllabus-setup)
8. [Student: what a child sees](#8-student-what-a-child-sees)
9. [Parent: the read-only summary](#9-parent-the-read-only-summary)
10. [Digital Library](#10-digital-library)
11. [Progress percentages — the chapter-weighted formula](#11-progress-percentages--the-chapter-weighted-formula)
12. [The bulk-import JSON format, in full](#12-the-bulk-import-json-format-in-full)
13. [Auth model — who can do what](#13-auth-model--who-can-do-what)
14. [End-to-end scenarios, step by step](#14-end-to-end-scenarios-step-by-step)
15. [Known quirks and gaps](#15-known-quirks-and-gaps)
16. [Quick-reference glossary](#16-quick-reference-glossary)

---

## 1. The big picture in one paragraph

A **master catalog** lives at the platform level: `board → grade → subject → chapter → topic`, built once by Platform Admin and shared across every school. A school "subscribes" to a subject, which **deep-copies** (not links) that whole tree into the school's own tables. From there, **each class's own teacher runs a one-time Class Syllabus Setup**, choosing which chapters/topics that specific class actually needs (deselecting anything not relevant, and optionally grouping the rest into Semester 1/Semester 2/... folders) — this per-class selection, not the raw school copy, is what every downstream screen renders. The teacher marks topics as taught, which drives progress percentages (now **chapter-weighted**, not a flat topic ratio) seen by the **student** (what's unlocked to study), the **parent** (the full syllabus, taught vs not-yet-taught), and the **school admin** (a read-only view of what each class curated, plus school-wide chapter-weighted analytics — admin no longer browses or edits chapters/topics directly at all). Teachers can also add chapters/topics that exist nowhere in the master catalog, and can rename their own custom chapters — either one at a time, by pasting a ChatGPT-generated JSON outline, or by just typing a chapter count.

---

## 2. The core idea: master catalog → school copy → class setup

This is the single most important concept to understand before anything else makes sense. There are now **three** layers, not two — Class Syllabus Setup was added as a new layer between "the school's copy" and "what everyone else sees."

```
MASTER CATALOG (platform-wide, one copy, shared by every school)
┌─────────────────────────────────────────────────────────┐
│ master_subjects  (board, grade, subject_name)            │
│   └── master_chapters  (chapter_name, book_type, ...)     │
│         └── master_topics  (topic_name, subtopics, ...)   │
│               └── master_resources  (links, videos, ...)  │
│   └── master_subject_materials  (textbook/handbook PDFs)  │
│   └── master_tasks  (homework templates per chapter)      │
└─────────────────────────────────────────────────────────┘
                          │
                          │  School Admin clicks "Subscribe"
                          │  POST /api/school/subscribe
                          │  → DEEP COPY, not a live link
                          ▼
SCHOOL COPY (one per school, independently editable from here on)
┌─────────────────────────────────────────────────────────┐
│ school_subjects  (school_id, master_subject_id, ...)      │
│   └── school_chapters  (master_chapter_id, is_custom)      │
│         └── school_topics  (master_topic_id, is_custom)    │
│               └── school_resources                         │
│   └── school_tasks                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          │  This class's own teacher runs
                          │  Class Syllabus Setup (one-time per
                          │  class+subject; re-editable anytime)
                          │  POST /api/syllabus/setup/apply
                          ▼
CLASS SETUP (per class-section, diverges freely from every other
class of the same subject — 9-A and 9-B can each keep a completely
different subset, in completely different semester groupings)
┌─────────────────────────────────────────────────────────┐
│ class_chapter_visibility  (class_id, school_chapter_id,   │
│   is_active, semester_label)                              │
│ class_topic_visibility    (class_id, school_topic_id,      │
│   is_active)                                               │
│ class_subject_setup_status (class_id, school_subject_id,   │
│   setup_completed_at, semester_mode, semester_count)       │
└─────────────────────────────────────────────────────────┘
                          │
                          │  Teacher marks a topic taught, for ONE class
                          ▼
school_topic_progress  (class_id, school_topic_id, status, covered_date, ...)
```

**Why a school-copy and not a live link?** Once a school subscribes, its curriculum needs to diverge freely — a teacher adds a local chapter, renames something, deletes an optional exercise — without ever touching (or being affected by changes to) the master catalog other schools use. Every school-side row has a nullable `master_*_id` pointing back to where it came from (useful for "sync new content" later, see `POST /api/school/subjects/:id/resync`), plus an `is_custom: boolean` flag marking anything the school created that has no master-catalog origin at all.

**Why a separate class-setup layer on top of the school copy?** A school's copy is shared by every class-section studying that subject at that grade — but not every class needs every chapter (a slower section might defer two chapters to next term; a school might simply not want certain optional chapters taught anywhere). Before this feature, the *only* way to hide content from one class was destructively deleting it from the school's copy, which affected every other class too. Class Syllabus Setup makes visibility a **per-class overlay**: nothing is ever deleted, a chapter/topic just gets an `is_active: false` row in `class_chapter_visibility`/`class_topic_visibility` for that one class. **Absence of a row means active** — this is the single rule that makes the whole system work: a freshly-subscribed subject with no Setup run yet shows everything (nothing has been deselected), and only an explicit Setup run can narrow it down.

**Where progress lives.** Notice `school_topic_progress` is keyed by `(class_id, school_topic_id)` — progress is tracked **per class**, not per school. Two different sections of the same grade (e.g. 9-A and 9-B) can be at completely different points in the same subject, because they have different teachers on different schedules.

---

## 3. Database schema, table by table

All of these live in `lib/db.ts`, inside a migrations array gated by `SCHEMA_VERSION` (currently `10`) — **every new migration statement must bump this constant**, or it silently never runs against an already-bootstrapped database (a documented trap in the file's own comments, and one that was hit and fixed twice this session).

### `master_subjects`
The top of the catalog tree. One row per (board, grade, subject).

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `board` | VARCHAR(50) | e.g. `CBSE`, `AP_SSC`, `TS_SSC`. **Extra subjects** (Dance, Music, Art — anything not tied to a board) use the literal board value `'EXTRA'` so they still fit the same `UNIQUE(board, grade, subject_name)` constraint without special-casing every query. |
| `grade` | VARCHAR(20) | |
| `subject_name` | VARCHAR(100) | |
| `category` | VARCHAR(20), default `'academic'` | `'academic'` or `'extra'` |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

Unique constraint: `(board, grade, subject_name)` — you cannot have two "CBSE / Grade 9 / Mathematics" rows.

### `master_chapters`
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `subject_id` | FK → master_subjects, CASCADE delete | |
| `chapter_name` | VARCHAR(200) | |
| `chapter_order` | INTEGER, default 0 | Display order within the subject |
| `description` | TEXT | |
| `semester` | VARCHAR(50), nullable | e.g. `"Sem 1"` — **school-wide/shared**, drives the pre-existing book-tab-style grouping every class of a subscribed subject sees the same way. Not to be confused with the per-class `class_chapter_visibility.semester_label` described below. |
| `book_type` | VARCHAR(20), default `'textbook'` | CHECK constraint: `'textbook' \| 'handbook' \| 'workbook'` |
| `audience` | VARCHAR(20), default `'student'` | CHECK constraint: `'teacher' \| 'student' \| 'both'` — who this book/chapter is meant for |
| `book_name` | VARCHAR(200), nullable | Distinguishes two different books of the same `book_type` (e.g. two different Text Books) |

A subject can have **more than one book** — e.g. a Telugu subject might have a "Telugu Parimalam" textbook and a "Telugu Vyakaranam" workbook, each its own set of chapters, distinguished by `(book_type, book_name)`. *(As of this session, the book-tab switcher UI that let a user flip between these books was removed from the teacher/student/parent tracking screens — see [§15](#15-known-quirks-and-gaps) — but the underlying `book_type`/`book_name` columns and grouping logic are unchanged and still drive `POST /api/syllabus/chapters`' inheritance behavior.)*

### `master_topics`
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `chapter_id` | FK → master_chapters, CASCADE delete | |
| `topic_name` | VARCHAR(200) | |
| `topic_order` | INTEGER, default 0 | |
| `content_text` | TEXT, nullable | Free-text study content |
| `content_pdf_url` | VARCHAR(512), nullable | |
| `questions` | JSONB, default `[]` | Legacy quiz question bank column — **no longer read by any UI** (see [§15](#15-known-quirks-and-gaps)); kept only because dropping it would be a destructive schema change with no functional upside today. |
| `subtopics` | JSONB, default `[]` | Array of plain strings — a topic can be broken down further without becoming its own topic row |

### `master_resources`
Per-topic supplementary links (videos, external references).

| Column | Type |
|---|---|
| `id` | SERIAL PK |
| `topic_id` | FK → master_topics, CASCADE delete |
| `resource_type` | VARCHAR(50) |
| `title` | VARCHAR(200) |
| `url` | VARCHAR(512) |

### `master_subject_materials`
Whole-book PDFs (a scanned textbook or handbook), uploaded **once per subject** — not per-chapter, and inherited by every school that subscribes.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `subject_id` | FK → master_subjects, CASCADE delete | |
| `material_type` | VARCHAR(20) | CHECK: `'textbook' \| 'handbook'` only (no `'workbook'` here — see [§15](#15-known-quirks-and-gaps)) |
| `title` | VARCHAR(200) | |
| `file_url` | VARCHAR(512) | An `/api/materials/file?key=...` link to Cloudflare R2 storage |

**Visibility rule:** students and parents only ever see `material_type = 'textbook'` rows — `'handbook'` is staff-only (school admin + the subject's own teacher). This rule is enforced in the API layer (see `subjects/materials` and `school/library` routes below), not the database.

### `school_subjects`
The top of a school's own copy. One row per school per grade per subject per academic year.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id` | FK → schools, CASCADE delete | |
| `master_subject_id` | FK → master_subjects, `ON DELETE SET NULL`, nullable | **NULL means this is a fully custom subject** the school created itself — see [§6](#6-school-admin-subject-management-only) |
| `subject_name` | VARCHAR(100) | Copied at subscribe/create time, not a live reference |
| `board` | VARCHAR(50), nullable | |
| `grade` | VARCHAR(20) | |
| `academic_year` | VARCHAR(20), default `'2025-26'` | |
| `category` | VARCHAR(20), default `'academic'` | Copied from `master_subjects.category` at subscribe time |

Unique constraint: `(school_id, grade, subject_name, academic_year)`.

**`master_subject_id` linkage — fixed this session.** Several "find-or-create" code paths (`POST /api/syllabus`, `POST /api/syllabus/chapters`, `POST /api/school/syllabus/bulk-import`, `POST /api/school/syllabus/bootstrap-chapters`) can create a bare `school_subjects` row as a side effect of a teacher adding content to a subject that has no row yet — before this session, **none of these paths ever set `master_subject_id`**, only the real `POST /api/school/subscribe` flow did. A subject created this way could never link to its uploaded textbooks/handbooks (Digital Library and the materials panel both join through this FK), even if a matching master-catalog subject genuinely existed. Two fixes:
1. All four find-or-create paths now look up `master_subjects` by `(grade, subject_name)` case-insensitively at insert time, linking `master_subject_id`/`board` when exactly one unambiguous match exists (left NULL otherwise — never guesses across two different boards).
2. A one-time backfill migration (bumped `SCHEMA_VERSION` to `10`) retroactively links every existing NULL row the same way.

A related, separate bug was found and fixed alongside this: a school-admin "Subscribe" modal's board dropdown defaulted to a hardcoded `'CBSE'` regardless of the school's own registered board — a school actually on `AP_SSC`/`TS_SSC` that didn't notice the dropdown could accidentally subscribe under the wrong board, creating a subject permanently orphaned from any real catalog content (since materials are uploaded per-board). The dropdown now seeds itself from `schools.board` when it matches one of the three curriculum board codes.

### `school_chapters`
Same shape as `master_chapters`, plus:

| Column | Type | Notes |
|---|---|---|
| `school_subject_id` | FK → school_subjects, CASCADE delete | |
| `master_chapter_id` | FK → master_chapters, `ON DELETE SET NULL`, nullable | NULL if this chapter has no master-catalog origin |
| `is_custom` | BOOLEAN, default FALSE | TRUE means a teacher or admin created this at the school level (vs. inherited from the master catalog at subscribe time). **No longer gates rename/delete permission** — see the note below. |

Plus the identical `semester`, `book_type`, `audience`, `book_name` columns as `master_chapters`.

**`is_custom` and edit permission — changed this session.** `is_custom` used to double as a hard rename/delete guardrail: a board-mandated chapter/topic (`is_custom: false`) could never be renamed or deleted, only ones a teacher created themselves. That guardrail has been **removed entirely, by explicit product decision** — a teacher can now rename or delete *any* chapter or topic in their school's own copy, board-mandated or custom. The column itself still exists and is still set correctly at copy/creation time (it's meaningful provenance metadata — "did this come from the master catalog or not" — and other logic like `DELETE /api/school/subjects/:id`'s "has real teaching data" check doesn't touch it), it just no longer restricts who can edit what. The reasoning, verbatim from the product decision: an edit here only ever touches `school_chapters`/`school_topics` — the school's own copy — never `master_chapters`/`master_topics`, so it can never leak into another school's catalog or the platform-wide master data. See [§4](#4-every-api-route-in-detail) for exactly which routes changed.

### `school_topics`
Same shape as `master_topics`, plus `master_topic_id` (nullable) and `is_custom` (provenance only, doesn't gate edits — see above), plus `subtopics` (JSONB array of strings).

### `school_resources`
School-side mirror of `master_resources`, plus `master_resource_id` and `is_custom`.

### `school_topic_progress` — where "taught" actually lives
This is the table that everything downstream (student unlocking, parent summaries, admin analytics, progress percentages) reads from.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `class_id` | FK → classes, CASCADE delete | **Not school_id** — progress is per class-section |
| `school_topic_id` | FK → school_topics, CASCADE delete | |
| `status` | VARCHAR(20), default `'pending'` | `'pending'` or `'covered'` |
| `covered_date` | DATE, nullable | Set automatically to today when first marked covered; **preserved** if toggled covered→pending→covered again (doesn't reset to "today" the second time) |
| `covered_by` | FK → teachers, `ON DELETE SET NULL`, nullable | |
| `target_date` | DATE, nullable | A teacher's planned date to cover a still-pending topic |
| `delay_reason` | TEXT, nullable | Free text explaining why a topic is behind schedule |

Unique constraint: `(class_id, school_topic_id)` — exactly one progress row per topic per class, upserted via `ON CONFLICT`.

### `class_chapter_visibility` — NEW this session
The per-class chapter overlay that Class Syllabus Setup writes to. **The only place this table is ever written is `POST /api/syllabus/setup/apply`** — never on subscribe, never just from opening or viewing the Setup screen.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `class_id` | FK → classes, CASCADE delete | |
| `school_chapter_id` | FK → school_chapters, CASCADE delete | |
| `is_active` | BOOLEAN NOT NULL, default TRUE | **Absence of a row for a given (class, chapter) also means active** — the DEFAULT only matters for a row that does get written; most chapters for most classes simply have no row at all |
| `semester_label` | VARCHAR(50), nullable | The **per-class** Semester 1/2/... grouping a teacher assigns during Setup — see the important distinction below |
| `updated_by` | FK → teachers, `ON DELETE SET NULL` | |
| `updated_at` | TIMESTAMPTZ | |

Unique constraint: `(class_id, school_chapter_id)`.

**Critical distinction — `semester_label` here vs. `school_chapters.semester`:** these are two unrelated concepts that share a similar name and caused real user confusion during this session's development. `school_chapters.semester` is a **shared, board-level** column driving the pre-existing book-tab-style switcher every class/teacher of a subscribed subject sees identically (e.g. a board-imported book literally named "MATHEMATICS SEM-1"). `class_chapter_visibility.semester_label` is a **brand-new, per-class** column a teacher assigns themselves during Setup — two different classes studying the exact same subscribed subject can group it into a completely different number of semesters, with completely different chapters in each. Only `semester_label` drives the real "Semester 1 / Semester 2" tabs described in [§7](#7-teacher-syllabus-tracking-and-class-syllabus-setup)–[§9](#9-parent-the-read-only-summary).

### `class_topic_visibility` — NEW this session
Same shape and same "no row = active" rule as `class_chapter_visibility`, but per topic:

| Column | Type |
|---|---|
| `id` | SERIAL PK |
| `class_id` | FK → classes, CASCADE delete |
| `school_topic_id` | FK → school_topics, CASCADE delete |
| `is_active` | BOOLEAN NOT NULL, default TRUE |
| `updated_by` | FK → teachers, `ON DELETE SET NULL` |
| `updated_at` | TIMESTAMPTZ |

Unique constraint: `(class_id, school_topic_id)`.

### `class_subject_setup_status` — NEW this session
Tracks, per (class, subject), whether Setup has ever been completed at all — this is what tells the frontend whether to open Setup unchecked-by-default (first time) versus pre-filled with the current selection (re-edit via "Edit Syllabus Setup").

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `class_id` | FK → classes, CASCADE delete | |
| `school_subject_id` | FK → school_subjects, CASCADE delete | |
| `setup_completed_at` | TIMESTAMPTZ, nullable | NULL until the first real Apply submission |
| `setup_by` | FK → teachers, `ON DELETE SET NULL`, nullable | NULL if a non-teacher role (school admin, principal, etc.) ran Setup |
| `semester_mode` | BOOLEAN NOT NULL, default FALSE | Whether this class organized the subject into semester folders |
| `semester_count` | INTEGER, nullable | How many semesters, only meaningful when `semester_mode` is true |

Unique constraint: `(class_id, school_subject_id)`.

### `class_subjects` — the "who teaches what" table
This table lives outside the syllabus schema block but is central to almost every access-control decision in this feature.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `class_id` | FK → classes, CASCADE delete | |
| `subject_name` | VARCHAR(100) | A plain string, not a foreign key to `school_subjects` — matched by name |
| `teacher_id` | FK → teachers, `ON DELETE SET NULL`, nullable | |
| `periods_per_week` | INTEGER, default 4 | |

Unique constraint: `(class_id, subject_name)` — this is what makes the `ON CONFLICT (class_id, subject_name) DO UPDATE` in the subscribe flow work (see [§6](#6-school-admin-subject-management-only)).

**Why this table matters so much:** it's the source of truth for "which subjects can this teacher see for this class" everywhere in the app — the teacher's Syllabus tab, the Digital Library, materials visibility. A subject can exist in `class_subjects` with **no corresponding `school_subjects` row at all** — the syllabus GET route specifically handles this case by surfacing it as an empty, zero-chapter subject rather than silently hiding it.

**Auto-assignment, both directions — changed this session.** Two related gaps existed before this session: (1) subscribing a subject only assigned it to class-sections the admin explicitly checked in the Subscribe modal, so a class created later, or simply left unchecked, never got the subject at all; (2) Class Management's Subjects tab showed a manual "click to add" suggestion list for subjects the grade was already subscribed to, requiring the admin to separately re-add what should have been automatic. Both are now closed:
- `POST /api/school/subscribe` queries every existing, non-deleted class of the target grade (`SELECT id, grade FROM classes WHERE school_id = $1 AND grade = $2 AND deleted_at IS NULL`) and assigns the subject to all of them, with a teacher auto-matched where possible — not just the classes checked in the modal.
- Class Management's manual suggestion list was removed outright (dead `addSubject`/`availableSuggestions`/`existingNames` code deleted) since auto-assign now covers the same ground automatically.
- A **one-time backfill migration** (bumped `SCHEMA_VERSION`) retroactively assigns every existing `(school_subjects, class)` pair that was missing a `class_subjects` row before this fix existed. This is deliberately a **one-time backfill, not a live reconciliation** — it runs once on schema-version bump and never again, because `class_subjects` has no soft-delete column; re-running the same check on every load would silently resurrect a subject an admin had deliberately removed from a specific class.

---

## 4. Every API route, in detail

### `GET /api/syllabus?school_id=&class_id=&subject=`
**The read endpoint every tracking screen calls** — teacher's own tracking, student, parent, and school-admin's per-class Setup drill-down all consume this exact same response shape.

Auth: `requireSyllabusAccess` (any logged-in school-scoped role, or platform admin).

- `school_id`, `class_id` required (400 if missing). `subject` optionally narrows to one subject.
- Looks up the class's `grade`, resolves `academic_year` (from query param, else the school's current active year).
- Joins `school_subjects → school_chapters → school_topics → school_topic_progress (scoped to class_id) → teachers (for covered_by_name)`, plus **`class_chapter_visibility`/`class_topic_visibility`** (both LEFT JOINed, both defaulting to active when no row exists — this is the "no row = active" rule from §2 actually implemented in SQL).
- **A topic individually deactivated for this class is excluded from the response entirely** — this is what keeps the chapter itself in the response (with a lower topic count) even when only some of its topics are hidden. **A chapter deactivated for this class is excluded via the join condition, never even producing a zero-topic placeholder row.**
- **The `class_subjects` fallback:** after building the grouped response from `school_subjects`, the route runs a second query — `SELECT DISTINCT subject_name FROM class_subjects WHERE class_id = $1` — and adds any subject name found there but missing from the main result, as an empty `{ chapters: [] }` entry.
- **Per-subject Setup status** is joined in and returned alongside each subject: `setup_completed_at`, `semester_mode`, `semester_count`. This is what every portal's frontend reads to decide whether to render Semester 1/2 tabs at all, and (for the teacher's own view) whether to hard-gate the tracking screen behind Setup — see [§7](#7-teacher-syllabus-tracking-and-class-syllabus-setup).
- Each chapter carries **both** `semester` (the shared, board-level column) and `class_semester_label` (the new per-class one — see the distinction called out in §3) — these drive two completely different pieces of UI and must not be confused.
- Response shape: `{ subjects: [{ subject, board, total, covered, completion_pct, setup_completed_at, semester_mode, semester_count, chapters: [{ school_chapter_id, chapter_name, chapter_order, semester, class_semester_label, book_type, audience, book_name, total, covered, topics: [...] }] }] }`.
- **`completion_pct` is chapter-weighted** (changed this session) — see [§11](#11-progress-percentages--the-chapter-weighted-formula) for the exact formula; it is **not** a flat `covered_topics/total_topics` ratio anymore.

### `POST /api/syllabus`
Adds one or more custom topics. Auth: `requireSyllabusWriteAccess` (teacher, school_admin, principal, vice_principal, or platform_admin).

- Body is either one topic object, or `{ topics: [...] }` for several at once.
- Required per topic: `school_id, class_id, subject, chapter_name, topic_name`.
- **Find-or-create cascade:** if the named `school_subjects` row doesn't exist, it's created (now correctly linking `master_subject_id`/`board` when an unambiguous match exists — see §3). If the named chapter doesn't exist under it, it's created too (`is_custom: TRUE`). Then the topic is inserted.
- `chapter_order`/`topic_order` are optional — if omitted, auto-assigned as `MAX(existing order) + 1`.
- Duplicate name in the same chapter → 409.

### `PATCH /api/syllabus/:id`
The **mark-taught / schedule / rename** endpoint, where `:id` is a `school_topics.id`. Auth: `requireSyllabusWriteAccess`.

Handles three independent kinds of update in one route, based on which body fields are present:
1. **Progress update** (`status`, `target_date`, and/or `delay_reason` present): requires `class_id`. Upserts `school_topic_progress` via `ON CONFLICT (class_id, school_topic_id) DO UPDATE`. Marking `status: 'covered'` sets `covered_date` to today **only if it wasn't already set**; any other status clears both `covered_date` and `covered_by`.
2. **Rename/reorder** (`topic_name` and/or `topic_order` present): a teacher can rename **any** topic in their school's own copy — board-mandated or custom (the earlier `!is_custom → 403` guardrail was removed this session, by explicit product decision — see the `is_custom` note in [§3](#3-database-schema-table-by-table)). This only ever writes to `school_topics`, never `master_topics`, so it can't leak across schools or touch the shared platform catalog.
3. Neither present → 400 `'Nothing to update'`.

Response: `{ success: true, progress: <row or null>, topic: <row or null> }`.

### `DELETE /api/syllabus/:id`
Deletes a topic. **The board-mandated guardrail was removed this session** — same reasoning as the PATCH rename above: a teacher can delete any topic (board-mandated or custom), since it only ever removes that school's own `school_topics` row (cascading away only that class's own progress history against it), never touching another school's data or the master catalog.

### `DELETE /api/syllabus?school_id=&class_id=&subject=&chapter_name=`
Deletes a whole chapter (and cascades to its topics). Same removed guardrail — any chapter, board-mandated or custom, can now be deleted.

### `POST /api/syllabus/chapters`
**Creates an empty chapter shell** — no topic required. Auth: `requireSyllabusWriteAccess`.

- Same find-or-create-subject logic as above; 409 if a chapter with that exact name already exists in the subject; auto-numbers `chapter_order` the same MAX+1 way if omitted.
- **New this session — `semester_label` in the body:** when the teacher adds a chapter from inside the tracking screen while the subject is in Semester Wise mode, the frontend passes the currently-active semester tab's label, and the route writes a matching `class_chapter_visibility` row for it immediately. Without this, a freshly-added chapter would be created active but invisible under every semester tab (having no label to match any of them) until a separate trip through "Edit Syllabus Setup" to assign one — this was a real reported bug, fixed by auto-assigning to whatever the teacher was actually looking at when they clicked Add Chapter.
- **Parameter-type bug fixed this session:** the SELECT-based INSERT used to link `master_subject_id` threw a Postgres `42P08 "inconsistent types deduced for parameter"` error whenever a genuinely new `school_subjects` row had to be created (i.e. every first-time bootstrap of a brand-new subject) — caused by the same `$` parameter (grade, then subject) appearing in both a plain `SELECT` target position and inside a `WHERE`/`lower()` position within one statement, which lets pg infer two different types for it. Fixed by casting both explicitly (`$2::varchar`, `$3::varchar`) everywhere this pattern appears — this same fix was applied identically in `bootstrap-chapters`, `bulk-import`, and `POST /api/syllabus`'s own find-or-create.

### `PATCH /api/syllabus/chapters/:id`
Renames a chapter. Body: `{ school_id, chapter_name }`.

- A teacher can rename **any** chapter in their school's own copy — board-mandated or custom (the earlier `!is_custom → 403` guardrail was removed this session; it was originally scoped mainly to renaming the "Chapter 1"/"Chapter 2" placeholders `bootstrap-chapters` creates, opened up to every chapter per explicit product direction). Only ever updates `school_chapters`, never the master catalog.
- 409 on a duplicate name within the same subject.
- Exposed in the teacher's tracking screen as a pencil icon next to every chapter's delete button (no longer conditional on `is_custom`) — both icons were made more visible in an earlier pass this session (previously a near-invisible `text-gray-300` at rest; now `text-gray-500`/`text-red-400` respectively, darkening further on hover).

### `GET /api/syllabus/analytics?school_id=&academic_year=`
The school-wide **admin dashboard** data source, and the data backing the School Admin **Syllabus Tracking** screen (§7 in the school-admin section below). Auth: `requireFeeAccess` (note: not a syllabus-specific guard — this is the same tenant check fee routes use).

**`pct` is chapter-weighted with partial credit** (see [§11](#11-progress-percentages--the-chapter-weighted-formula) for the exact formula). `total`/`covered` remain raw chapter counts for display purposes, but `pct` is computed separately from a weighted sum, not `covered/total`.

Returns three breakdowns in one response:
- **`by_class`** — grouped by class, with a per-subject sub-breakdown. Each subject entry now also carries **`teacher_name`** (joined via `class_subjects → teachers` for that exact class+subject pair) — `null` if no `class_subjects` row exists yet for that subject/class.
- **`by_teacher`** — restructured this session from a `subjects[]` array merged by subject name across every class a teacher taught, into an **`assignments[]`** array with **one row per (class, subject)** — `{ class_id, grade, section, subject, total, covered, pct }`. A teacher holding Mathematics in both 9-A and 9-B now shows two separate assignment rows instead of one blended total; this is what lets the Syllabus Tracking screen's teacher view drill into per-class-per-subject detail instead of a merged number that hides which specific class is behind.
- `by_subject` — school-wide totals per subject name (unchanged).

A class/teacher/subject with zero chapters gets `pct: null` (shown as an em-dash in the UI) rather than `0`.

**Denominator bug fixed this session:** `total` in every one of the three queries above used to be computed with `FILTER (WHERE topic_count > 0)`, silently dropping any active-but-zero-topic chapter from the count — for one real class with 15 active chapters (6 genuinely empty), this shrank the denominator to 9 and inflated the reported percentage from a correct 47% to 78%, disagreeing with the teacher's own `GET /api/syllabus`-driven tracking screen for the identical data. Fixed by removing that filter from `total` only (every active chapter counts toward the denominator, zero-topic ones included) while keeping it on `covered` (a chapter with zero topics still never counts as "covered" — that stricter display-only count is correct as-is). See [§11](#11-progress-percentages--the-chapter-weighted-formula) for the full story.

### `GET /api/syllabus/analytics/trend?school_id=&class_id=&academic_year=` (or `&teacher_id=` instead of `class_id`) — NEW this session
Coverage-over-time data for the Syllabus Tracking screen's trend chart. Auth: `requireFeeAccess`. Exactly one of `class_id`/`teacher_id` is required.

- Reads from `syllabus_coverage_snapshots` (below) — a **binary**, chapter-covered/chapter-total weekly snapshot, not the live chapter-weighted number the rest of this feature uses elsewhere. It answers "how has coverage trended week over week," not "what's the precise progress right now" (that's still `GET /api/syllabus/analytics`).
- **Class mode** (`class_id`): one series per subject taught in that class.
- **Teacher mode** (`teacher_id`): one series per `"{grade}-{section} · {subject}"` assignment, so a teacher's different classes/subjects don't get blended into one line.
- Response: `{ weeks: [...dates], series: [{ subject, values: [...pct per week, null if no snapshot exists for that week] }] }`.

### `syllabus_coverage_snapshots` table + weekly cron — NEW this session
A new table (`id, school_id, class_id, school_subject_id, academic_year, snapshot_date, total_chapters, covered_chapters, created_at`, unique on `(class_id, school_subject_id, snapshot_date)`) purely for historical trend data — nothing else in the feature reads from it.

`GET/POST /api/cron/syllabus-coverage-snapshot` (Vercel cron, `vercel.json` schedules it Mondays 02:00 UTC) iterates every active school, resolves its current academic year, computes the same binary chapter-covered/chapter-total count used here (not the weighted formula), and upserts one row per (class, subject) with `ON CONFLICT (class_id, school_subject_id, snapshot_date) DO NOTHING` — so a manual re-run on the same day never double-writes. Auth: `Authorization: Bearer <CRON_SECRET>` (skipped if the env var is unset, so it's a no-op rather than a hard failure in environments without it configured).

### `POST /api/notifications/nudge-teacher` — NEW this session
Body: `{ school_id, teacher_id, subject, class_label, pct }`. Lets a school admin flag a subject/class as behind schedule directly from the Syllabus Tracking screen. Auth: `requireFeeAccess`, plus a check that the target teacher actually belongs to the school. Inserts a plain notification (`"{adminName} flagged {subject} for {class_label} as behind schedule ({pct}% covered)."`) — same fire-and-forget pattern every other notification in the app uses, no new abstraction introduced.

### `GET /api/syllabus/setup?school_id=&class_id=&subject=&academic_year=` — NEW this session
The Setup screen's own data source — same chapter→topic tree shape as `GET /api/syllabus`, but **deliberately without any `school_topic_progress` join**: this is a selection screen (what should this class even see), not a tracking screen (what's been covered). Auth: `requireSyllabusAccess`.

Every chapter/topic carries its **current** `is_active` state (defaulting to `true` when no visibility row exists yet). Response also includes top-level `setup_completed_at`, `semester_mode`, `semester_count`. This same route backs three different UI needs: the teacher's first-time Setup screen, the teacher's "Edit Syllabus Setup" re-entry, and school-admin's read-only per-class drill-down.

### `POST /api/syllabus/setup/apply` — NEW this session
**The only place `class_chapter_visibility`/`class_topic_visibility` ever get written.** Auth: `requireSyllabusWriteAccess`.

Body: `{ school_id, class_id, subject, academic_year?, semester_mode?, semester_count?, chapters: [{ school_chapter_id, is_active, semester_label?, topics: [{ school_topic_id, is_active }] }] }`.

- Writes a row for **every** item in the payload, checked or not — an explicit `is_active: false` row is what actually enforces deselection; since absence of a row means active everywhere else in the system, an unchecked item **must** get a real row, not just be silently omitted.
- Only touches items present in the payload — anything added to the school copy after this specific request was built is left untouched (it naturally defaults active, via the "no row" rule).
- Runs the whole per-chapter/per-topic write loop inside one transaction, with a defense-in-depth check per item confirming it actually belongs to the target subject/chapter (rejects a malformed or stale payload trying to write visibility for the wrong subject's chapter).
- Also upserts `class_subject_setup_status` (`setup_completed_at = NOW()`, `setup_by`, `semester_mode`, `semester_count`).
- Returns the updated tree in the same shape as the GET, so the frontend can render the post-Apply state without a second round trip.

### `GET /api/syllabus/setup/siblings?school_id=&class_id=&subject=&academic_year=` — NEW this session
Finds other classes of the **same grade** (never a different grade) that have already **completed** Class Syllabus Setup for the same `school_subject_id`, excluding the requesting class itself. Auth: `requireSyllabusAccess`.

Response: `{ school_subject_id, siblings: [{ class_id, grade, section, setup_completed_at, setup_by_name, semester_mode, semester_count, active_chapters }] }`, ordered most-recently-completed first. Powers the sibling-setup-prompt described in [§7](#7-teacher-syllabus-tracking-and-class-syllabus-setup) — this is a **read-only lookup**, it never writes anything; the actual copy only happens via the route below, and only once the teacher explicitly confirms.

### `POST /api/syllabus/setup/copy-from-sibling` — NEW this session
Body: `{ school_id, source_class_id, target_class_id, school_subject_id }`. Auth: `requireSyllabusWriteAccess`.

- Verifies both classes belong to the school and share the same grade, and that the source class has actually completed Setup — refuses otherwise.
- In one transaction: copies every `class_chapter_visibility` row (`is_active`, `semester_label`) and every `class_topic_visibility` row (`is_active`) from source to target via `INSERT ... SELECT ... ON CONFLICT DO UPDATE`, then upserts `class_subject_setup_status` for the target class with `setup_completed_at = NOW()`.
- This is a **one-time clone, not a live link** — after copying, the target class's visibility rows are its own; editing 10-A's setup later never retroactively changes what was copied to 10-B, and vice versa. If the source class's setup later changes and the target should pick that up too, the teacher would need to re-run the copy explicitly.

### `GET /api/syllabus/setup/status?school_id=&school_subject_id=` — NEW this session
**School-admin's read-only view of Class Syllabus Setup.** Auth: `requireFeeAccess`.

For every class in this subject's grade, returns whether that class has ever completed Apply (`setup_completed_at`), who did it (`setup_by_name`), and the current active chapter/topic counts against the school-wide totals. **Admin never edits anything here** — this route exists purely so an admin can see what each class curated, not change it; per-item selection stays exclusive to that class's own assigned teacher via the Setup screen.

### `POST /api/school/syllabus/bulk-import`
The **teacher-facing** bulk import — paste JSON, get chapters+topics created. Auth: `requireSyllabusWriteAccess`.

- Body: `{ school_id, class_id, subject, json, book_type?, audience?, book_name? }`. `academic_year` (if you need to override the current one) comes from the **query string**, not the body.
- Parses `json` using the shared parser (see [§12](#12-the-bulk-import-json-format-in-full)) — any validation failure returns its exact error message at 400.
- Resolves the target subject by `(school_id, grade, subject_name, academic_year)` — **not** by `master_subject_id`, because this route exists specifically for subjects that may have no master-catalog backing at all. Same `master_subject_id` auto-link + parameter-cast fixes as `POST /api/syllabus/chapters` (see above) apply here too.
- **Append-only by design** — no "replace" mode here (unlike the platform-admin version). Re-importing a chapter that already exists (matched by `book_type` + `book_name` + `chapter_name`, case/whitespace-insensitive) **updates it in place** rather than creating a duplicate.
- Runs in a single database transaction; a mid-import failure rolls back everything.

### `POST /api/school/syllabus/bootstrap-chapters`
**The "I don't have a PDF, I just know the chapter count" path.** Auth: `requireSyllabusWriteAccess`.

- Body: `{ school_id, class_id, subject, count }`. `count` must be a whole number from 1 to **50**.
- Creates `count` empty placeholder chapters named `"Chapter 1"`, `"Chapter 2"`, etc. — numbered starting from **however many chapters already exist + 1**.
- These are meant to be renamed (via the new `PATCH /api/syllabus/chapters/:id` above) and filled in with real topics afterward.
- Same `master_subject_id` auto-link + parameter-cast fixes as above.

### `DELETE /api/school/subjects/:id` — NEW this session
**Removes a school's subscription to a subject.** Auth: `requireFeeAccess`.

- Refuses (409) if any class has already **completed Class Syllabus Setup** for this subject, or if any topic under it has already been **marked taught** for any class — both are read as "real teaching data exists," which this route will never cascade away.
- With neither condition true (a freshly subscribed subject nobody has touched yet), deletes cleanly — the entire FK chain (`school_subjects → school_chapters → school_topics → school_resources/school_tasks`, plus `class_chapter_visibility`/`class_topic_visibility`/`class_subject_setup_status` keyed off chapter/topic/subject ids) is `ON DELETE CASCADE`, so nothing is left orphaned.
- Exposed in Curriculum Customizer as a trash-icon button per subject in the sidebar list.

### `POST /api/school/subjects/create-custom`
Creates a bare subject with **no** master-catalog link. Auth: `requireFeeAccess`.

- Body: `{ school_id, grade, subject_name, academic_year? }`.
- 409 if a subject with that exact name already exists for that grade+year.
- Inserts with `master_subject_id: NULL`, `category: 'academic'` (hardcoded). **No chapters or topics are created here** — deliberately left to the teacher, via the bootstrap endpoints, once Class Management has assigned someone to teach it.

### `GET /api/school/subjects/materials?school_id=&grade=&subject_name=&academic_year=`
Returns the textbook/handbook PDFs for one specific subject — the list shown inside the teacher/student syllabus screens (not the standalone Digital Library, a separate feature — see [§10](#10-digital-library)). Auth: `requireSyllabusAccess`, **plus an extra check for teachers**: a teacher can only see materials for a `(subject, grade)` they're actually assigned to via `class_subjects`, otherwise 403.

Students and parents only ever get `material_type: 'textbook'` rows back; everyone else (teacher/admin) gets both types. Returns a bare array. If the subject has no `master_subject_id`, returns `[]` rather than an error.

### `GET /api/school/library?school_id=&academic_year=&class_id=&student_id=`
**The Digital Library data source.** See [§10](#10-digital-library) for the full UI story. Auth: `requireSyllabusAccess`, plus the `library` feature-flag gate (`schoolHasFeature`).

- `school_admin`/`principal`/`vice_principal`/`platform_admin`: no extra filter, full school-wide browsing.
- `teacher`: scoped to `(grade, subject)` pairs actually assigned via `class_subjects`. **New this session — optional `class_id`**: further narrows to just that one class's own subject assignments, used by the teacher portal's new class-picker library flow.
- `student`: own grade only, textbooks only.
- `parent`: requires `student_id` (verified against `student_parents` so a parent can't read a different family's grade), own child's grade only, textbooks only.

### `GET /api/platform/subjects/gaps`
**The Missing-Content QA checklist**, platform-admin only (`requirePlatformAdmin`). Two read-only queries against the master catalog: subjects with zero chapters, chapters with zero topics.

### `POST /api/platform/syllabus/bulk-import`
The **platform-admin** version of bulk import — requires `subject_id` (a `master_subjects.id`), supports `mode: 'append' | 'replace'` (destructive replace deletes every existing chapter for the exact `(book_type, book_name)` being imported first, with a confirm dialog in the UI).

### `POST /api/school/subscribe`
**The deep-copy engine.** Auth: `requireFeeAccess`. See [§6](#6-school-admin-subject-management-only) for the full step-by-step.

### `POST /api/school/subjects/:id/resync`
Diffs a subscribed subject's school-side chapters against the master catalog by `master_chapter_id` and clones whatever's missing — additive only, never touches or overwrites existing school-side content.

### `POST /api/school/subjects/copy-from-year`
Carries a subject's school-side content forward into a new academic year (used by the Academic Years / year-rollover flow in Curriculum Customizer), preserving `master_subject_id`/`board` from the source row.

### Platform catalog CRUD (brief)
- `GET/POST/DELETE /api/platform/subjects` — list/create/delete master subjects. GET accepts `?include_details=true`.
- `GET/POST/DELETE /api/platform/subjects/:id/chapters` — chapter CRUD under one master subject. `DELETE` here removes a whole *book* (matched by `book_type`+`book_name`), not a single chapter.
- `GET/POST /api/platform/subjects/:id/materials` — textbook/handbook PDF metadata.

---

## 5. Platform Admin: building the master catalog

**Screen:** `/platform-admin/curriculum` (`app/platform-admin/curriculum/page.tsx`)

Unchanged this session. This is where the shared catalog every school draws from gets built:

**1. The subject/chapter/topic browser.** A left sidebar lists subjects filtered by board+grade+category; selecting one shows its chapters (grouped by book, then by semester if applicable), each expandable to its topics.

**2. Bulk import.** Paste JSON directly, "Copy ChatGPT prompt" (see [§12](#12-the-bulk-import-json-format-in-full)), "Load example", or "Select file…". Two submit buttons: **Append** and **Replace all** (destructive, confirm-gated).

**3. Missing Content tab.** A toggle in the header (with a live count badge) switches the page to a QA checklist of every empty subject/chapter in the catalog, each with a "Go fix" deep link.

---

## 6. School Admin: subject management only

**Screen:** the "Syllabus Customizer" tab in the school-admin sidebar (`app/school-admin/components/CurriculumCustomizer.tsx`)

**This screen was substantially narrowed this session.** Before, admin could browse and edit the full master chapter/topic tree for any subscribed subject — add custom chapters/topics, view resources and quiz questions, edit book grouping, etc. **All of that master-chapter browsing UI was removed entirely.** The reasoning: once Class Syllabus Setup exists as the real per-class curation layer owned by each class's own teacher, admin editing the shared school-copy chapter tree directly was redundant with (and could silently conflict with) what a teacher had already curated for their class. Admin's job here is now purely **subject management**: subscribe, delete, and a read-only window into what each class has set up — never editing chapter/topic content itself.

### What the page now shows

1. **Subject list** (sidebar) — every subscribed/custom subject for the school, grouped by grade. Each row has a **delete button** (trash icon, `data-testid="curriculum-delete-subject-btn-{id}"`) that confirms destructively, calls `DELETE /api/school/subjects/:id`, and surfaces the API's 409 error clearly if a class has already set up or taught something under it (see §4).
2. **Subscribe modal** — filter by category/board/grade/academic year, pick one or more master subjects. The board dropdown defaults to the school's own registered board instead of a hardcoded `'CBSE'` (see §3). **The class-section checklist ("Sections Selector") was removed this session** — since `POST /api/school/subscribe` now auto-assigns to every existing class of the grade server-side (see §3's auto-assignment note), picking sections in the modal became redundant. In its place, a static info line: *"Will be assigned automatically to every Grade {grade} class, with a teacher auto-matched where possible."*
3. **"Add Custom Subject"** — always available regardless of subscription state; creates a bare `school_subjects` row with no chapters, hands off to the teacher's own bootstrap flows.
4. **Academic Years selector** and **carry-forward from a prior year** — the carry-forward UI was rebuilt this session (see below).
5. **Textbooks & Handbooks**, followed immediately by **Class Syllabus Setup — read-only per-class status** (relocated this session — see below).

### Class Syllabus Setup's read-only view — relocated this session

Before this session, clicking a "Class Syllabus Setup" row expanded its read-only tree **inline, directly under that row** — one class at a time, nested inside the class list itself. That inline-expand pattern is gone. Class rows are now **pure selectors**: clicking one just highlights it (teal), and the actual read-only tree renders once, in a **new fixed section placed below Textbooks & Handbooks** (`expandedClassDetail` state), showing whichever class is currently selected. Same underlying data source (`GET /api/syllabus/setup/status`) and same visual — Semester 1/Semester 2 pill tabs when the subject is in semester mode, only that class's active chapters/topics, a collapsible inactive-chapters section, matching exactly what the teacher/student/parent of that class actually see — just relocated out of the class list into its own stable spot on the page, so switching between classes doesn't reflow the whole subject list around an expanding/collapsing row.

**Admin never edits anything here** — this view exists purely so an admin can see what each class curated, never to change it; per-item selection stays exclusive to that class's own assigned teacher via the Setup screen (or, now, via copying a sibling class's setup — see [§7](#7-teacher-syllabus-tracking-and-class-syllabus-setup)).

### Carry-forward from a prior year — rebuilt this session

The old carry-forward UI was a banner listing every candidate subject as its own row (potentially dozens of rows for a school with many subjects). It's now a **slim one-line nudge** ("You have N subjects from {prior year} not yet carried forward — Copy from {year}") that opens a **bulk modal**: pick a grade → check which subjects to carry forward → confirm, calling `handleBulkCopyFromPriorYear` for the whole batch in one action instead of one subject at a time.

When candidates exist, subscribing to a subject that's also available to carry forward now opens a **"Subscribe chooser"** first — "Clone Master Syllabus" (the normal fresh subscribe) vs. "Copy from Previous Year" (preserves whatever custom chapters/topics/renames the school already made last year, instead of starting from the master catalog again). The superseded one-subject-at-a-time `handleCopyFromPriorYear` and the dead `handleResubscribeFromMaster`/`copyingSubjectId` were removed.

### Subscribing to a master subject, step by step

1. School admin clicks **"Subscribe to Board Subject"**, opening a modal.
2. Filters by category, board, grade, and academic year; sees matching master subjects with checkboxes.
3. Submits. For **each** selected master subject, `POST /api/school/subscribe` runs sequentially:
   - Checks the subject isn't already subscribed for that grade+year — 409 if it is.
   - Inserts one `school_subjects` row, copying `board`, `grade`, `category` from the master row.
   - Deep-copies every chapter, topic, resource, and task template.
   - **Auto-assigns to every existing class of the grade** (not just classes explicitly checked — see §3): queries `SELECT id, grade FROM classes WHERE school_id = $1 AND grade = $2 AND deleted_at IS NULL`, and for each one, matches an active staff member by `teaches_grades` + subject name and inserts/updates `class_subjects` — the moment a teacher becomes able to see the subject on their own Syllabus tab.
4. Each subject's subscribe/copy/assign sequence is one database transaction.

### Resyncing after the master catalog changes

A **"Resync"** button on each subscribed subject pulls in any *new* master chapters not part of the original copy — additive only. Kept unchanged this session (it never showed the chapter tree UI to begin with, only a button + a count).

---

## 6b. School Admin: the Syllabus Tracking screen — rebuilt this session

**Screen:** `app/school-admin/components/SyllabusTracking.tsx`, rendered as the "Syllabus Coverage" tab inside `AcademicAnalytics.tsx` (which now only owns the top-level tab switcher plus its own separate Tasks tab — all Syllabus Coverage rendering was delegated out to this new component).

This is a full rebuild of what used to be a simpler bar-chart-only view, matching a provided mockup and re-skinned onto the app's own palette (teal/gold/coral/ink) rather than the mockup's original colors. Data source throughout: `GET /api/syllabus/analytics` (§4) plus `GET /api/syllabus/analytics/trend` (§4) for the chart.

**Layout:**
- A real **academic year selector** (`GET /api/academic-years`) — not hardcoded to the current year, so an admin can look back at a closed year's final coverage.
- A **KPI strip**: overall coverage %, count of classes "on track," count of classes "behind" — computed from `by_class`.
- A **class/teacher view toggle** — class mode lists every class with a per-subject breakdown; teacher mode lists every teacher with a per-(class, subject) breakdown (using the new `assignments[]` shape from §4, so a teacher's two different classes never get blended into one row).
- A searchable, sortable **left-hand list** (classes or teachers, depending on the toggle) and a **right-hand detail table** — Subject / Teacher / Chapters covered / Status / Nudge in class mode; Class / Subject / ... / Nudge in teacher mode.
- A **trend chart** (Recharts `LineChart` — the first chart library in this codebase; installed specifically for this screen) wired to `GET /api/syllabus/analytics/trend`, one line per subject (class mode) or per class-subject assignment (teacher mode).
- A **"Nudge teacher"** button per row, calling `POST /api/notifications/nudge-teacher` (§4), with a sent/disabled state once used.

**Status thresholds are deliberately its own scale**, not shared with any other component: ≥75% green "On track," 50–74% amber "Watch," <50% red "Behind" (`statusOf()`). This intentionally does **not** reuse `AcademicAnalytics.tsx`'s differently-tuned banding (which uses 75/40 as its cutoffs) — the two screens were specified with different thresholds and merging them would silently change one screen's meaning to match the other's.

**Per-section tracking accuracy — by design, not an add-on.** Every layer this screen reads from is keyed on `class_id`, never merged by grade: `class_chapter_visibility`, `class_topic_visibility`, `school_topic_progress`, and `GET /api/syllabus/analytics`'s own `by_class` rollup. So if 10-B's teacher renames a chapter, deletes a topic, or marks something covered, it only ever changes 10-B's own row in this screen and only ever reflects to 10-B's own students/parents — 10-A stays completely independent unless a teacher explicitly uses the sibling-copy feature (§7) to clone it. There is no code path anywhere in this feature that merges two sections' visibility or progress together.

---

## 7. Teacher: syllabus tracking and Class Syllabus Setup

**Screens:** `app/teacher/components/TeacherSyllabus.tsx` (class picker wrapper) → `SyllabusTracking`, a large exported component inside `app/teacher/components/ClassView.tsx`.

This is the screen teachers actually live in day to day, and it's where the bulk of this session's new feature work landed. The old flat "list every chapter, mark topics complete" screen still exists, but it is now **gated behind a mandatory Setup step** and reshaped by whatever that Setup produced.

### Which classes and subjects a teacher sees

`TeacherSyllabus` fetches every subject-assignment via `class_subjects` and every class in the school. A teacher's visible class list is the union of (a) the class they're the official class teacher of, and (b) every class they have a `class_subjects` row for.

**Class teacher vs. subject teacher:** the official class teacher of the currently-selected class sees **every subject** for that class, regardless of formal assignment. A subject teacher is strictly limited to what `class_subjects` assigned them.

### The hard Setup gate — `needsSetup`

A subject with real chapters that has **never** completed Setup renders **nothing** of the normal tracking view — no chapter list, no book tabs, no progress bar — until the teacher runs Setup at least once. This is computed synchronously from the same `GET /api/syllabus` response that populates the subject list (`chapters.length > 0 && !setup_completed_at`), so there's no timing gap where the tracking view could flash empty/wrong content before a separate fetch resolves. A genuinely empty subject (0 chapters) is unaffected by this gate — it goes to the existing bootstrap panel instead, which is itself a prerequisite to ever running Setup.

**Before opening blank Setup, a sibling check now runs first — new this session.** If any other class of the **same grade** has already completed Setup for this exact subject (checked via `GET /api/syllabus/setup/siblings`, §4), the teacher is shown a **sibling-setup prompt** instead of going straight to blank Setup: a list of sibling classes, each with who set it up and when, and a "Preview & use this setup" button per sibling plus a "No, set up this class on my own" fallback that proceeds to the normal blank Setup screen. Clicking a sibling opens a **read-only preview** of that class's exact chapter/topic selection (the same tree visual admin's read-only drill-down uses); confirming calls `POST /api/syllabus/setup/copy-from-sibling` (§4), which clones the sibling's visibility rows onto this class and marks Setup complete immediately — no manual re-checking every chapter by hand. If multiple siblings exist, all are listed and the teacher picks which one to copy.

The very first time blank Setup fires for a subject (no sibling found, or the teacher declined to copy one), the screen opens automatically, **unchecked by default** — nothing is written until the teacher actually clicks Apply.

**Implementation note — a real race condition was found and fixed in this flow.** The `useEffect` driving this whole check originally called its own dependency-triggering state setter (`setSetupStatus`) *before* the async sibling-check fetch had fully resolved. Since that setter is listed in the effect's own dependency array, calling it mid-flight triggered React to re-run the effect and fire its cleanup (`cancelled = true`) — silently aborting the still-in-flight sibling-check fetch's continuation before it could ever call `setSetupMode('sibling-prompt')`, even though the fetch itself succeeded and returned correct sibling data. The visible symptom was a completely blank Syllabus tab for the affected class (confirmed via network logs showing every API call succeeding while the rendered page contained no sibling-related text at all). Fixed by resolving the full `nextMode` decision first (checking `cancelled` at each async step), then calling `setSetupMode`/`setSetupStatus` together at the very end in one synchronous tick, so React batches both updates before the next effect re-run's cleanup has a chance to fire.

### The Setup screen itself

Two organization modes, chosen with a toggle:

- **Full Syllabus** — a flat checklist of every chapter/topic; check/uncheck to include/exclude, no grouping.
- **Semester Wise** — the teacher first enters how many semesters this subject has, then assigns each chapter to one via a dropdown **or by dragging it** into a sticky Semester N drop-zone box pinned above the scrolling chapter list (added specifically because dragging a chapter from far down the list up to a semester header at the very top was reported as unusably difficult with inline section headers — the sticky boxes fixed that).

**Checking a chapter auto-checks every one of its topics** (and unchecking auto-unchecks them) — this was a real bug fix: previously a teacher who checked only the chapter box and left its topics untouched would silently submit `is_active: false` for every topic on Apply, since the payload only ever reflects each item's own checkbox state. A teacher can still uncheck individual topics afterward to exclude just one within an otherwise-included chapter.

Re-entering via **"Edit Syllabus Setup"** (a button on the tracking screen's progress card) reopens the same screen but **pre-filled** with the class's actual current selection — never blank. The unchecked-by-default behavior is exclusive to the very first pass.

Clicking **Apply** calls `POST /api/syllabus/setup/apply` (§4), then reloads the tracking view.

### The tracking view, once Setup has run

- **Semester 1/Semester 2/... pill tabs** (only shown when the subject is in semester mode) — filters the chapter list down to just that semester's active chapters, with a live count per tab.
- **An "Inactive Chapters" pill** alongside the semester tabs — a new, always-visible tab showing every chapter the teacher excluded via Setup (name + topic count), read-only, with an "Edit Syllabus Setup" button to actually act on it. This exists so a teacher can see at a glance what they deselected without having to re-open the full Setup screen just to check.
- The old book-tab switcher (Text Book / Hand Book / ...) was **removed entirely** from this screen — semester tabs (in semester mode) or a flat chapter list (in full-syllabus mode) are now the only organizing structure. This was a deliberate simplification after user feedback that showing both semester tabs and book tabs side by side was confusing and the book split added no value once semester grouping existed.
- An overall progress card (now **chapter-weighted**, §11), a Textbooks & Handbooks card, and the chapter accordion — every chapter has a **rename** (pencil) and **delete** (trash) control, **regardless of `is_custom`** (the earlier board-mandated-content lock was removed this session — see the `is_custom` note in [§3](#3-database-schema-table-by-table) and the route changes in [§4](#4-every-api-route-in-detail)).
- Inside each chapter, every topic has **Mark Complete**, a **Schedule** button (target date + delay reason), and — **new this session** — its own **rename** (pencil) and **delete** (trash) controls, matching the chapter-level UI exactly (inline edit input, autofocus, Enter-to-save, Save/Cancel). Topic rename previously didn't exist as a UI at all (only delete did, and only for custom topics); it's now built and, like chapter rename, works on any topic.
- **"+ Add Chapter"** at the subject level — when the subject is in semester mode, a newly-added chapter is now auto-assigned to whichever semester tab the teacher currently has open (§4), so it appears immediately instead of vanishing until a separate Setup trip.
- **"+ Add Subtopic"** per chapter.

### The empty-subject bootstrap panel

When the selected subject has **zero chapters**, the chapter accordion is replaced by a bootstrap panel: **"Import from ChatGPT / JSON"** (bulk-import) or **"Enter chapter count"** (1–50, creates numbered placeholders). Both funnel into the exact same Setup-gated tracking UI once content exists.

---

## 8. Student: what a child sees

**Screen:** `app/student/components/StudentSyllabus.tsx`, titled **"My learning"**.

Same Semester 1/2 tab structure as the teacher screen (driven by the same `class_semester_label`/`semester_mode` data), an overall progress card (chapter-weighted, §11), and a "Textbook" materials card (student-scoped, `material_type: 'textbook'` only).

The book-tab switcher was removed here too, same as the teacher screen — a student now sees exactly the semester structure (or flat list) the teacher's Setup produced, nothing else layered on top.

**Topics are gated.** A topic the teacher hasn't marked covered yet shows only a lock icon and its name. Once covered, the row becomes a clickable link opening the full topic content (`TopicContentViewer`).

**The interactive quiz was removed entirely this session** — `openQuiz`/`closeQuiz`/`submitQuiz`, the quiz-taking panel, the "Take quiz" button, and the `Math.random()`-based question shuffler are all gone (the shuffler was also independently flagged by lint as an impure function called during render). This was never backed by real persisted data — no endpoint has ever existed to save a quiz attempt against a student, so the score only ever lived in that browser tab's memory and vanished on refresh. The removal matches an earlier, separate removal of the same quiz UI from `TopicContentViewer.tsx` and the parent portal's quiz-score placeholders — this was the one remaining copy that had been missed.

An empty state ("No syllabus yet") is the fallback when the class has literally nothing.

---

## 9. Parent: the read-only summary

**Screen:** `app/parent/components/ParentSyllabus.tsx`, titled **"{Child's first name}'s progress"**.

**Substantially changed this session.** Previously this screen only ever showed chapters that had at least one topic already marked covered — everything pending or locked was hidden entirely, with no way for a parent to see what was coming up. This has been reversed to match the student view: **the full syllabus is now shown** (every active chapter/topic the teacher's Setup kept), with each topic row distinguishing **taught** (green checkmark, taught date, teacher name) from **not-yet-taught** (greyed row, lock icon, name only, matching the student view's existing locked-topic styling exactly) — rather than hiding untaught content.

Same Semester 1/2 tab structure as teacher/student, driven by the same underlying data. The interactive-quiz-adjacent placeholders ("avg score /10" card, per-topic "not attempted" pill) were already removed in an earlier session — those stay removed; they were always fabricated `—` placeholders with no real data source.

---

## 10. Digital Library

A standalone, read-only PDF-browsing feature (`app/components/library/DigitalLibrary.tsx`) — grouped board → grade → subject, distinct from the per-subject materials card embedded in each syllabus tracking screen. Gated by the `library` school-plan feature.

**Teacher's entry point was rebuilt this session.** Previously a teacher landed directly on a school-wide library browser scoped only by their assigned `(grade, subject)` pairs — meaning a teacher with two different classes at the same grade but different subject sets saw one merged, ungrouped list. It's now a two-step flow via a new component, `app/teacher/components/TeacherLibrary.tsx`:

1. A **class picker** (same data source and card layout as "My Classes") — pick which of your classes you want the library for.
2. Selecting a class calls `DigitalLibrary` with the `class_id` query param wired through to `GET /api/school/library`, which further narrows the teacher's existing `class_subjects`-based filter down to just that one class's own subject assignments (§4) — so a teacher only ever sees the textbooks/handbooks actually relevant to the class they picked.

School admin/student/parent library access is unchanged — admin still gets full school-wide browsing, student/parent are scoped to their own grade and textbooks only.

---

## 11. Progress percentages — the chapter-weighted formula

**Changed this session, applied everywhere a completion percentage is shown** (`GET /api/syllabus`'s `completion_pct`, and `GET /api/syllabus/analytics`'s `pct` at every level — by_class, by_teacher, by_subject).

### The old behavior

`completion_pct` was a flat ratio: `covered_topics / total_topics` across the whole subject. This meant a subject where one chapter happened to carry far more topics than the rest could be dominated by that one chapter's progress, and a chapter with very few topics barely moved the needle — not a meaningful "how much of the syllabus is actually done" signal for a school admin or parent trying to track real progress transparently.

Separately, `GET /api/syllabus/analytics` used an entirely different, **binary** per-chapter definition: a chapter only counted as "covered" at all once *every one* of its topics was done — no partial credit, so a chapter with 7 of 8 topics taught contributed exactly 0% same as one with 0 of 8.

### The new formula

Every chapter is an **equal 1/N share** of its subject (10 chapters → each chapter is worth 10%, regardless of how many topics it contains), and each chapter's own share is scaled by **how much of that chapter is actually done**:

```
subject_pct = 100 × ( Σ over all chapters of (chapter.covered / chapter.total) ) / chapter_count
```

A chapter with 2 topics counts exactly the same toward the subject total as a chapter with 20 — deliberately, per explicit product direction: "if 10 chapters there means 100/10 = 1 chapter is equal to 10%... if all subtopics completed in that chapter means showcase 10% tracking progress." A chapter with 5 of 8 topics done contributes `5/8` of its own `1/N` share (partial credit), not a binary 0% or 100%.

### Where it's implemented

- `GET /api/syllabus`: computed in JS after grouping, over the already-built chapter list for each subject.
- `GET /api/syllabus/analytics`: computed in SQL — each of the three underlying queries (`by_class`, `by_teacher`, `by_subject`) now also selects a `weighted_sum` aggregate (`SUM(topics_covered::numeric / NULLIF(topic_count, 0)) FILTER (WHERE topic_count > 0)`), and every `pct` field in the response is `weighted_sum / total` rather than `covered / total`. `total`/`covered` remain raw chapter counts (still shown to the user), but are no longer what `pct` is derived from once any chapter has partial progress.
- Verified via a rolled-back test transaction against real data: marking specific chapters partially/fully covered and manually summing `topics_covered/topic_count` by hand matched the SQL's `weighted_sum` output to full decimal precision.
- **A follow-up bug was caught and fixed against real production data after this formula first shipped:** the analytics route's `total` (the denominator N) was computed with `FILTER (WHERE topic_count > 0)`, which silently dropped any active-but-zero-topic chapter from the count entirely — for a real class with 15 active chapters (6 genuinely empty), this shrank the denominator to 9 and inflated the reported percentage from the correct 47% to 78%, disagreeing with the teacher's own tracking screen for the identical data. Fixed by removing that filter from `total` only (every active chapter counts toward N, zero-topic ones included, exactly matching `GET /api/syllabus`'s own semantics) while leaving it on `covered` (a chapter with zero topics is still never "covered", so that stricter display-only count is correct as-is). Re-verified against the same real class: both routes now agree at 15 chapters / 47%.

A subject/class/teacher with zero chapters still returns `pct: null` (or `0` for `GET /api/syllabus`, matching its prior null-handling convention), never a divide-by-zero.

---

## 12. The bulk-import JSON format, in full

Shared parser: `lib/syllabus/bulk-import-schema.ts`, used identically by the platform, school-admin, and teacher bulk-import routes (only the destination table differs). Unchanged this session.

### The three shapes it accepts

**1. Flat chapter array** — no semester splitting:
```json
[
  {
    "title": "Force and pressure",
    "topics": [
      "Pressure in fluids",
      { "title": "Frictional force", "subtopics": ["Static friction", "Kinetic friction"] }
    ]
  }
]
```

**2. Semester groups** — when a subject's syllabus splits by term:
```json
[
  {
    "semester": "Sem 1",
    "chapters": [
      { "title": "Force and pressure", "topics": [ "..." ] }
    ]
  }
]
```
Shapes 1 and 2 can be **mixed in one paste** — the parser checks each top-level array item independently. *(Note: this `"semester"` field, from imported JSON, populates the shared `school_chapters.semester` column — the board-level book-tab grouping — not the new per-class `class_chapter_visibility.semester_label` from Class Syllabus Setup. See the distinction called out in §3.)*

**3. Book-extraction shape** — for a PDF mechanically extracted into a flat "units" outline:
```json
{ "book": "NCERT Physics Part 1", "book_type": "textbook", "units": [ ... ] }
```

A **topic** can be a plain string, or `{ "title": "...", "subtopics": [...] }`. A **subtopic** can be a plain string or `{ "title": "..." }`.

### Auto-repair for messy PDF extraction

The parser detects heading patterns like `"Chapter 9"`, `"Unit 3"`, or a leading number, and **folds** any non-chapter-heading unit that looks sub-numbered (`"9.1 ..."`) or has no content of its own into the *previous* chapter's subtopics — only after confirming the book actually uses that convention somewhere at all. The number of folded sections is reported back as `sections_merged`.

### Validation errors you might see

Specific, actionable messages naming exactly which chapter/topic/subtopic index failed — e.g. `"Chapter 3: needs a non-empty title."`, `"Chapter 2, topic 4 (\"...\"): 'subtopics' must be an array of strings."`.

### The "Copy ChatGPT prompt" text

Generated by `lib/syllabus/chatgpt-prompt.ts`, tailored to the exact board/grade/subject being worked on — tells ChatGPT to use its own knowledge of the official textbook if no PDF is attached, output *only* JSON with no markdown fences, follow one of the two exact shapes above, and never generate quiz content.

---

## 13. Auth model — who can do what

Two tenant-scoped helper functions in `lib/auth.ts` do almost all the gatekeeping for this feature:

- **`requireSyllabusAccess(school_id)`** — read access. Admits platform admin (any school), or any logged-in teacher/student/parent/school-admin session whose own `school_id` matches the one requested.
- **`requireSyllabusWriteAccess(school_id)`** — everything `requireSyllabusAccess` does, narrowed to roles that can actually mutate the syllabus: `teacher, school_admin, principal, vice_principal, platform_admin`. Students and parents can read but never write.

**Not every route in this feature uses these two functions.** `GET /api/syllabus/analytics`, `GET /api/syllabus/setup/status`, `POST /api/school/subjects/create-custom`, `POST /api/school/subscribe`, and `DELETE /api/school/subjects/:id` all use `requireFeeAccess` instead — an older, differently-named tenant-check helper with the same underlying tenant-matching behavior. Not a security gap, just a naming trap when searching the codebase by function name.

**Feature-flag gating, separately:** a school can have the `curriculum` (syllabus) or `library` feature toggled on/off at the plan-tier level (`plan_features`) or overridden per-school (`school_feature_overrides`). `schoolHasFeature()` checks the per-school override first, then the school's subscription tier, with tiers inheriting downward.

---

## 14. End-to-end scenarios, step by step

### Scenario A: A school subscribes and a teacher sets up their class

1. School admin opens Syllabus Customizer, clicks "Subscribe to Board Subject", picks CBSE/Grade 9/Mathematics, selects class 9-A, submits.
2. Behind the scenes: `school_subjects`, `school_chapters`, `school_topics` all get deep-copied; `class_subjects` gets a row linking whichever Mathematics teacher matches by subject name to class 9-A.
3. That teacher logs in, opens Syllabus for 9-A Mathematics. Because Setup has never run, the tracking view is **completely gated** — no chapter list, nothing — and the Setup screen opens automatically, everything unchecked.
4. Teacher reviews the full chapter/topic list, unchecks two optional chapters this class won't cover this term, switches to Semester Wise mode, enters "2" semesters, drags the remaining chapters into Semester 1 / Semester 2 boxes, clicks Apply.
5. The tracking view now opens for real: Semester 1/Semester 2 pill tabs, an "Inactive Chapters" tab showing the two excluded chapters, and only the active chapters under each semester.
6. Teacher expands a Semester 1 chapter, marks the first topic "Mark Complete".
7. A student in 9-A opens their own Syllabus tab — same Semester 1/2 tabs, same active-only chapter set, that first topic now unlocked and clickable, everything else in the chapter still locked.
8. A parent of that student opens their portal — same Semester 1/2 tabs, the **full** active syllabus (not just what's taught), that one topic shown with a green checkmark and today's date/teacher name, everything else shown locked (not hidden).
9. School admin expands 9-A's row under Mathematics' "Class Syllabus Setup" status — sees "Set up by {teacher}", and expanding it renders the exact same Semester 1/2 view the teacher/student/parent see.
10. School admin checks the syllabus analytics sidebar — Mathematics for 9-A now shows a chapter-weighted percentage that moves proportionally as individual topics get marked, not just once whole chapters are 100% done.

### Scenario B: A teacher re-edits Setup after realizing a mistake

1. Weeks later, the same teacher realizes one of the two chapters they excluded should actually be taught this term.
2. Opens "Edit Syllabus Setup" from the tracking screen's progress card — the screen reopens **pre-filled** with the class's current selection (not blank).
3. Checks the previously-excluded chapter (auto-checking all its topics), assigns it to Semester 2, clicks Apply.
4. The chapter instantly appears under Semester 2 for the teacher's own tracking view — and, on their next page load, for the student, parent, and admin's read-only drill-down too, since all four read from the same underlying visibility tables.

### Scenario C: A subject exists nowhere in the master catalog

1. School admin needs "Value Education" for Grade 6 — not in the platform catalog at all.
2. Clicks "Add Custom Subject", types the name and grade, submits. A bare `school_subjects` row is created with no chapters.
3. Goes to Class Management, assigns a teacher — creates the `class_subjects` row.
4. That teacher opens their Syllabus tab. Thanks to the `class_subjects` fallback in `GET /api/syllabus`, "Value Education" appears as a subject tab even with zero chapters.
5. Teacher picks "Enter chapter count", types 8, gets 8 empty "Chapter 1".."Chapter 8" placeholders — each correctly linked to a `master_subject_id` if an unambiguous match exists (it won't here, since this subject has no master-catalog origin at all — stays NULL, which is expected and correct).
6. Teacher renames each placeholder to its real chapter title via the new pencil-icon rename control, adds subtopics as they go.
7. Once real content exists, Setup still gates the tracking view the same way — the teacher must run Setup (even if just "select everything, no semesters") before the tracking view, student, or parent screens show anything.

### Scenario D: School admin tries to delete a subject with real data

1. School admin opens the sidebar, clicks the trash icon on a subject.
2. Confirms the destructive prompt.
3. `DELETE /api/school/subjects/:id` checks: at least one class has completed Setup for this subject → refuses with a 409 and a clear message ("At least one class has already completed Syllabus Setup for this subject — it can't be deleted while real teaching data exists.").
4. Admin sees the error surfaced in the page's existing error banner; the subject remains in the list untouched.
5. A freshly-subscribed subject nobody has touched (no Setup, no taught topics) deletes cleanly on the same flow.

---

## 15. Known quirks and gaps

Documenting these here so they're not mistaken for bugs when someone notices them later.

- **No quiz-attempt persistence anywhere, and no quiz UI left either.** The interactive quiz was fully removed from every remaining surface this session (student's own topic rows — the last copy that had been missed in an earlier removal pass). `master_topics.questions`/`school_topics.questions` still exist as JSONB columns but are dead — nothing reads or writes them anymore. If quiz functionality returns, it needs a real `quiz_attempts`-style table and API before any UI is rebuilt on top of it.
- **No topic auto-unlock/lock schema.** The student-facing "locked until taught" behavior is enforced purely by `status !== 'covered'` in the UI — there's no dedicated locking column or ordering gate. Marking one topic taught never affects any other topic's visibility.
- **The book-tab switcher (Text Book / Hand Book / Work Book) is gone from teacher/student/parent tracking screens**, removed deliberately this session in favor of semester tabs as the sole organizing structure. The underlying `book_type`/`book_name`/`semester` columns on `school_chapters` are untouched and still used elsewhere (chapter-creation inheritance, the bulk-import JSON schema, platform-admin's own curriculum page still has its book browser).
- **`master_subject_materials.material_type` doesn't allow `'workbook'`**, even though `book_type` on chapters does. A workbook upload can end up mislabeled "Hand Book" in the Digital Library.
- **`GET /api/platform/subjects/:id/chapters` has no authentication check at all.** Every other platform-admin write route in this feature correctly requires `requirePlatformAdmin`; this one GET route was missed. Not touched this session — flagged again for visibility.
- **Auth helper naming is inconsistent** across several routes (`requireFeeAccess` used for genuinely syllabus-scoped routes) — cosmetic, not a security gap, but a trap when searching by function name. See [§13](#13-auth-model--who-can-do-what).
- **`DELETE /api/syllabus` (whole-chapter delete) doesn't filter by `academic_year`** when resolving which subject to delete a chapter from, unlike every sibling route. Low practical risk, not yet observed to trigger, but worth fixing if a school ever has the same subject name duplicated across years in a way that hits it.
- **A handful of helper functions were duplicated across files even before this session** (`computeBookGroups`, `audienceBadge`/`majorityAudienceBadge`, `BOOK_TYPE_LABELS`/`AUDIENCE_LABELS`) — this session actually reduced that duplication somewhat by deleting the teacher/student book-tab copies outright rather than keeping them in sync, but platform-admin's curriculum page still has its own copy since that page's book browser was intentionally left alone.
- **Two different completion-percentage formulas existed as recently as this session's start** (topic-flat on tracking screens, chapter-binary on admin analytics) — both are now unified on the same chapter-weighted-with-partial-credit formula (§11). Getting there took two passes: the first pass unified the *formula* but left a real bug in the analytics route's SQL — its `total` denominator used `FILTER (WHERE topic_count > 0)`, silently excluding any active-but-zero-topic chapter from the count. For a real class with 15 active chapters (6 of them genuinely empty), this shrank the analytics denominator to 9, producing 78% there against 47% on the teacher's own screen for the identical data. Fixed by dropping that filter from `total` (every active chapter now counts, zero-topic or not — matching `GET /api/syllabus`'s own semantics exactly) while keeping it on `covered` (a stricter "fully done, non-empty" display count is still meaningful on its own). Verified against real data: both routes now report 15 chapters / 47% for the same class+subject.
- **Full edit access has no undo.** Since a teacher can now rename or delete any chapter/topic (board-mandated or custom), deleting a board-imported chapter by mistake removes it from that school's copy permanently — there's no "restore from master catalog" button. The only recovery path today is manually re-running the subject's Resync (§6, additive-only) if the deleted chapter still exists in the master catalog, or recreating it by hand otherwise.
- **The sibling-setup-copy feature only offers *completed* setups, and only within the same grade.** A class whose Setup is still in-progress (started but never Applied) never appears as a copyable sibling, and a teacher can't copy from a different grade's setup even if the syllabus content happens to be similar — both are deliberate scope limits, not bugs.
- **A copied sibling setup is a one-time clone, not a live link.** If the source class's teacher edits their Setup afterward (excludes another chapter, reorganizes semesters), the class that copied from them earlier does **not** pick up that change automatically — there's no propagation, by design (see the route note in §4).
- **A real data-integrity bug was found and fixed for one specific school during this session** (not a systemic issue going forward, but worth knowing the shape of it if it recurs elsewhere): a subject's *current* academic year's `school_subjects` row can end up with the wrong `board` value if it was ever created via a "find-or-create" side-effect path before this session's `master_subject_id`-linking fix, then carried forward year-to-year via `copy-from-year` — meaning a school genuinely correctly subscribed under one board (e.g. AP_SSC) could have a *separate*, silently mislabeled row under a different board (e.g. CBSE) for the same subject/grade, permanently orphaned from any real catalog content because no master-catalog entry existed under the wrong board. The root cause (Subscribe's board dropdown defaulting to a hardcoded value instead of the school's own registered board) is fixed going forward (§3), but any school with this exact mislabel already baked into an existing academic year's data needs a manual one-off correction (`UPDATE school_subjects SET board = ..., master_subject_id = ... WHERE id = ...`), not something the app self-heals.

---

## 16. Quick-reference glossary

| Term | Meaning |
|---|---|
| **Master catalog** | The platform-wide, shared `master_subjects → master_chapters → master_topics` tree, built once by Platform Admin |
| **School copy** | A school's own independent deep-copy of some or all of the master catalog, made at subscribe time |
| **Class Syllabus Setup** | The per-class curation layer on top of the school copy — a teacher selects which chapters/topics their specific class needs and optionally groups them into semesters, written to `class_chapter_visibility`/`class_topic_visibility`/`class_subject_setup_status` |
| **`is_active` (visibility row)** | Whether a chapter/topic is included for one specific class, per Class Syllabus Setup. **Absence of a row means active** — this is the rule the whole feature is built on |
| **`semester_label`** (per-class) | A teacher-assigned Semester 1/2/... grouping, set during Setup, unique to one class — distinct from the shared `school_chapters.semester` column |
| **`semester`** (shared) | The board-level column on `school_chapters` driving the (now removed from tracking screens) book-tab-style grouping every class of a subscribed subject sees identically |
| **`is_custom`** | Flag on a school-side chapter/topic meaning it has no master-catalog origin — created directly at the school level. Provenance only — it no longer gates rename/delete permission (removed this session; a teacher can now edit any chapter/topic, board-mandated or custom) |
| **Sibling class** | Another class-section of the **same grade** studying the same subject — Class Syllabus Setup completed by one can be copied to another via `POST /api/syllabus/setup/copy-from-sibling`, instead of repeating Setup from scratch |
| **Bootstrap** | Populating an otherwise-empty subject with chapters, via JSON import or by entering a chapter count |
| **Book** | A subject can have more than one — distinguished by `(book_type, book_name)` |
| **`book_type`** | `'textbook' \| 'handbook' \| 'workbook'` |
| **`audience`** | Who a book is meant for: `'teacher' \| 'student' \| 'both'` — a display label only |
| **Progress / coverage** | Whether a topic has been marked taught for one specific class-section, tracked in `school_topic_progress` |
| **Chapter-weighted completion** | The current progress-percentage formula: every chapter is an equal `1/N` share of its subject, scaled by that chapter's own partial `covered/total` topic ratio — not a flat topic-count ratio |
| **`class_subjects`** | The table recording which teacher teaches which subject to which class — the real source of truth for "can this teacher see this subject" everywhere in the feature |
| **Resync** | Pulling newly-added master-catalog chapters into a school's already-subscribed copy, without touching what's already there |
| **Digital Library** | The standalone board→grade→subject PDF browser; teacher's own entry point is now class-scoped (pick a class, see its books) rather than a flat school-wide list |
| **Missing Content** | The platform-admin QA tab listing every empty subject/chapter in the master catalog |
