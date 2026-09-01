# Syllabus Feature — Complete Reference

> Last verified against code: 2026-08-24
> Scope: every part of the codebase that touches "syllabus" — database tables, API routes, and UI screens across all five portals (Platform Admin, School Admin, Teacher, Student, Parent).
> Historical context: `docs/syllabus-integration-plan.md` (the original build plan, now superseded by this document — some names in that file, like `HODSyllabus.tsx` and `syllabus_topics`, no longer exist).

This document explains the syllabus feature **inch by inch**: what each database table stores, what every API route accepts and returns, what every screen looks like and does, and how the pieces connect into complete end-to-end workflows. If you're new to this part of the codebase, read it top to bottom once — it's written in the order you'd actually learn the system.

---

## Table of Contents

1. [The big picture in one paragraph](#1-the-big-picture-in-one-paragraph)
2. [The core idea: master catalog → school copy](#2-the-core-idea-master-catalog--school-copy)
3. [Database schema, table by table](#3-database-schema-table-by-table)
4. [Every API route, in detail](#4-every-api-route-in-detail)
5. [Platform Admin: building the master catalog](#5-platform-admin-building-the-master-catalog)
6. [School Admin: subscribing and customizing](#6-school-admin-subscribing-and-customizing)
7. [Teacher: the day-to-day workhorse screen](#7-teacher-the-day-to-day-workhorse-screen)
8. [Student: what a child sees](#8-student-what-a-child-sees)
9. [Parent: the read-only summary](#9-parent-the-read-only-summary)
10. [The bulk-import JSON format, in full](#10-the-bulk-import-json-format-in-full)
11. [Auth model — who can do what](#11-auth-model--who-can-do-what)
12. [End-to-end scenarios, step by step](#12-end-to-end-scenarios-step-by-step)
13. [Known quirks and gaps](#13-known-quirks-and-gaps)
14. [Quick-reference glossary](#14-quick-reference-glossary)

---

## 1. The big picture in one paragraph

A **master catalog** lives at the platform level: `board → grade → subject → chapter → topic`, built once by Platform Admin and shared across every school. A school "subscribes" to a subject, which **deep-copies** (not links) that whole tree into the school's own tables. From there, a **teacher** marks topics as taught for their specific class, which drives progress percentages seen by the **student** (what's unlocked to study), the **parent** (a read-only summary of what's been taught), and the **school admin** (chapter-completion analytics across the whole school). Teachers can also add chapters/topics that exist nowhere in the master catalog — either one at a time, by pasting a ChatGPT-generated JSON outline, or by just typing a chapter count — because sometimes a school's real subject list is bigger than the master catalog covers.

---

## 2. The core idea: master catalog → school copy

This is the single most important concept to understand before anything else makes sense.

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
                          │  Teacher marks a topic taught, for ONE class
                          ▼
school_topic_progress  (class_id, school_topic_id, status, covered_date, ...)
```

**Why a copy and not a live link?** Once a school subscribes, its curriculum needs to diverge freely — a teacher adds a local chapter, renames something, deletes an optional exercise — without ever touching (or being affected by changes to) the master catalog other schools use. Every school-side row has a nullable `master_*_id` pointing back to where it came from (useful for "sync new content" later, see `POST /api/school/subjects/:id/resync`), plus an `is_custom: boolean` flag marking anything the school created that has no master-catalog origin at all.

**Where progress lives.** Notice `school_topic_progress` is keyed by `(class_id, school_topic_id)` — progress is tracked **per class**, not per school. Two different sections of the same grade (e.g. 9-A and 9-B) can be at completely different points in the same subject, because they have different teachers on different schedules.

---

## 3. Database schema, table by table

All of these live in `lib/db.ts`, inside a migrations array. New columns get added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` appended near the bottom of the file over time — so a column's full history is scattered across several statements; this section already merges that history into one picture per table.

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
| `semester` | VARCHAR(50), nullable | e.g. `"Sem 1"` — only set when a subject splits its syllabus by term |
| `book_type` | VARCHAR(20), default `'textbook'` | CHECK constraint: `'textbook' \| 'handbook' \| 'workbook'` |
| `audience` | VARCHAR(20), default `'student'` | CHECK constraint: `'teacher' \| 'student' \| 'both'` — who this book/chapter is meant for |
| `book_name` | VARCHAR(200), nullable | Distinguishes two different books of the same `book_type` (e.g. two different Text Books) |

A subject can have **more than one book** — e.g. a Telugu subject might have a "Telugu Parimalam" textbook and a "Telugu Vyakaranam" workbook, each its own set of chapters, distinguished by `(book_type, book_name)`.

### `master_topics`
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `chapter_id` | FK → master_chapters, CASCADE delete | |
| `topic_name` | VARCHAR(200) | |
| `topic_order` | INTEGER, default 0 | |
| `content_text` | TEXT, nullable | Free-text study content |
| `content_pdf_url` | VARCHAR(512), nullable | |
| `questions` | JSONB, default `[]` | Quiz question bank for this topic (see [§8](#8-student-what-a-child-sees) for how students take a quiz from this) |
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
| `material_type` | VARCHAR(20) | CHECK: `'textbook' \| 'handbook'` only (no `'workbook'` here — see [§13](#13-known-quirks-and-gaps)) |
| `title` | VARCHAR(200) | |
| `file_url` | VARCHAR(512) | An `/api/materials/file?key=...` link to Cloudflare R2 storage |

**Visibility rule:** students only ever see `material_type = 'textbook'` rows — `'handbook'` is staff-only (school admin + the subject's own teacher). This rule is enforced in the API layer (see `subjects/materials` route below), not the database.

### `school_subjects`
The top of a school's own copy. One row per school per grade per subject per academic year.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `school_id` | FK → schools, CASCADE delete | |
| `master_subject_id` | FK → master_subjects, `ON DELETE SET NULL`, nullable | **NULL means this is a fully custom subject** the school created itself — see [§6](#6-school-admin-subscribing-and-customizing) |
| `subject_name` | VARCHAR(100) | Copied at subscribe/create time, not a live reference |
| `board` | VARCHAR(50), nullable | |
| `grade` | VARCHAR(20) | |
| `academic_year` | VARCHAR(20), default `'2025-26'` | |
| `category` | VARCHAR(20), default `'academic'` | Copied from `master_subjects.category` at subscribe time |

Unique constraint: `(school_id, grade, subject_name, academic_year)`.

### `school_chapters`
Same shape as `master_chapters`, plus:

| Column | Type | Notes |
|---|---|---|
| `school_subject_id` | FK → school_subjects, CASCADE delete | |
| `master_chapter_id` | FK → master_chapters, `ON DELETE SET NULL`, nullable | NULL if this chapter has no master-catalog origin |
| `is_custom` | BOOLEAN, default FALSE | **TRUE means a teacher or admin created this at the school level** — it cannot be deleted/renamed the same way as a board-mandated chapter (see the DELETE/PATCH guardrails in [§4](#4-every-api-route-in-detail)) |

Plus the identical `semester`, `book_type`, `audience`, `book_name` columns as `master_chapters`.

### `school_topics`
Same shape as `master_topics`, plus `master_topic_id` (nullable) and `is_custom` (same meaning as above), plus `subtopics` (JSONB array of strings).

### `school_resources`
School-side mirror of `master_resources`, plus `master_resource_id` and `is_custom`.

### `school_topic_progress` — where "taught" actually lives
This is the table that everything downstream (student unlocking, parent summaries, admin analytics) reads from.

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

*(Removed history: this table used to have `hod_remark`/`hod_remark_by`/`hod_remark_at` columns for a Head-of-Department review workflow. That whole feature — including a component called `HODSyllabus.tsx` — was removed; the columns were dropped via `ALTER TABLE ... DROP COLUMN IF EXISTS`.)*

### `class_subjects` — the "who teaches what" table
This table lives outside the syllabus schema block but is central to almost every access-control decision in this feature.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `class_id` | FK → classes, CASCADE delete | |
| `subject_name` | VARCHAR(100) | A plain string, not a foreign key to `school_subjects` — matched by name |
| `teacher_id` | FK → teachers, `ON DELETE SET NULL`, nullable | |
| `periods_per_week` | INTEGER, default 4 | |

Unique constraint: `(class_id, subject_name)` — this is what makes the `ON CONFLICT (class_id, subject_name) DO UPDATE` in the subscribe flow work (see [§6](#6-school-admin-subscribing-and-customizing)).

**Why this table matters so much:** it's the source of truth for "which subjects can this teacher see for this class" everywhere in the app — the teacher's Syllabus tab, the Digital Library, materials visibility. A subject can exist in `class_subjects` with **no corresponding `school_subjects` row at all** (e.g. Class Management assigned a teacher to "Biology" before anyone ever built out Biology's syllabus) — the syllabus GET route specifically handles this case by surfacing it as an empty, zero-chapter subject rather than silently hiding it (see [§4](#4-every-api-route-in-detail), `GET /api/syllabus`).

---

## 4. Every API route, in detail

### `GET /api/syllabus?school_id=&class_id=&subject=`
**The read endpoint every portal's syllabus screen calls.** Auth: `requireSyllabusAccess` (any logged-in school-scoped role, or platform admin).

- `school_id`, `class_id` required (400 if missing). `subject` optionally narrows to one subject.
- Looks up the class's `grade`, resolves `academic_year` (from query param, else the school's current active year).
- Joins `school_subjects → school_chapters → school_topics → school_topic_progress (scoped to class_id) → teachers (for covered_by_name)`, all as LEFT JOINs.
- **Why LEFT JOIN matters:** a subject with zero chapters, or a chapter with zero topics, still needs to show up in the response — otherwise a teacher assigned to a brand-new subject would see nothing at all with no path forward. The grouping code specifically handles null chapter/topic rows without counting them.
- **The `class_subjects` fallback:** after building the grouped response from `school_subjects`, the route runs a second query — `SELECT DISTINCT subject_name FROM class_subjects WHERE class_id = $1` — and adds any subject name found there but missing from the main result, as an empty `{ chapters: [] }` entry. This is what lets a teacher assigned via Class Management to a subject that has *no `school_subjects` row at all* still see that subject (empty) instead of hitting a dead end.
- Response: `{ subjects: [{ subject, board, total, covered, completion_pct, chapters: [{ chapter_name, chapter_order, semester, book_type, audience, book_name, total, covered, topics: [...] }] }] }`. `completion_pct` is topic-based here (not chapter-based — see [§13](#13-known-quirks-and-gaps) for why this differs from the admin analytics screen).

### `POST /api/syllabus`
Adds one or more custom topics. Auth: `requireSyllabusWriteAccess` (teacher, school_admin, principal, vice_principal, or platform_admin).

- Body is either one topic object, or `{ topics: [...] }` for several at once.
- Required per topic: `school_id, class_id, subject, chapter_name, topic_name`.
- **Find-or-create cascade:** if the named `school_subjects` row doesn't exist, it's created. If the named chapter doesn't exist under it, it's created too (`is_custom: TRUE`). Then the topic is inserted.
- `chapter_order`/`topic_order` are optional — if omitted, auto-assigned as `MAX(existing order) + 1`, scoped correctly (chapter order within the subject, topic order within the chapter). *This auto-numbering was a real bug fix — it previously defaulted to `0` for every new item regardless of what already existed, so new chapters/topics all collided at position 0.*
- Duplicate name in the same chapter → 409.

### `PATCH /api/syllabus/:id`
The **mark-taught / schedule / rename** endpoint, where `:id` is a `school_topics.id`. Auth: `requireSyllabusWriteAccess`.

Handles three independent kinds of update in one route, based on which body fields are present:
1. **Progress update** (`status`, `target_date`, and/or `delay_reason` present): requires `class_id`. Upserts `school_topic_progress` via `ON CONFLICT (class_id, school_topic_id) DO UPDATE`. Marking `status: 'covered'` sets `covered_date` to today **only if it wasn't already set** (so re-toggling doesn't lose the original date); any other status clears both `covered_date` and `covered_by`.
2. **Rename/reorder** (`topic_name` and/or `topic_order` present): **guardrail — a non-custom (board-mandated) topic cannot be renamed**, returns 403.
3. Neither present → 400 `'Nothing to update'`.

Response: `{ success: true, progress: <row or null>, topic: <row or null> }`.

### `DELETE /api/syllabus/:id`
Deletes a topic. Same board-mandated guardrail as PATCH (403 if `!is_custom`).

### `DELETE /api/syllabus?school_id=&class_id=&subject=&chapter_name=`
Deletes a whole chapter (and cascades to its topics). Same guardrail — 403 if the chapter isn't `is_custom`.

### `POST /api/syllabus/chapters`
**Creates an empty chapter shell** — no topic required. Auth: `requireSyllabusWriteAccess`.

This exists because `POST /api/syllabus` only ever creates a chapter as a *side effect* of adding a topic to it — there was no way to lay down an empty chapter first and fill it in later. Same find-or-create-subject logic as above; 409 if a chapter with that exact name already exists in the subject; auto-numbers `chapter_order` the same MAX+1 way if omitted.

### `GET /api/syllabus/analytics?school_id=&academic_year=`
The school-wide **admin dashboard** data source. Auth: `requireFeeAccess` (note: not a syllabus-specific guard — this is the same tenant check fee routes use).

**Coverage here is counted in whole CHAPTERS, not individual topics** — a chapter only counts as "covered" once every one of its topics is marked covered (and a chapter with zero topics never counts as covered). This intentionally matches the "Done" badge logic on the teacher's own chapter accordion, but it means a percentage shown here will not match the percentage shown on the teacher/student screens, which are topic-based. See [§13](#13-known-quirks-and-gaps).

Returns three breakdowns in one response:
- `by_class` — grouped by class, with a per-subject sub-breakdown.
- `by_teacher` — joins through `class_subjects` (the real "who teaches what" source of truth, not a timetable) so this reflects actual teaching assignments.
- `by_subject` — school-wide totals per subject name.

Each entry has `{ total, covered, pct }`; a class/teacher with zero chapters gets `pct: null` (shown as an em-dash in the UI) rather than `0`.

### `POST /api/school/syllabus/bulk-import`
The **teacher-facing** bulk import — paste JSON, get chapters+topics created. Auth: `requireSyllabusWriteAccess`.

- Body: `{ school_id, class_id, subject, json, book_type?, audience?, book_name? }`. `academic_year` (if you need to override the current one) comes from the **query string**, not the body.
- Parses `json` using the shared parser (see [§10](#10-the-bulk-import-json-format-in-full)) — any validation failure returns its exact error message at 400.
- Resolves the target subject by `(school_id, grade, subject_name, academic_year)` — **not** by `master_subject_id`, because this route exists specifically for subjects that may have no master-catalog backing at all.
- **Append-only by design** — there is no "replace" mode here, unlike the platform-admin version of this route. A teacher bootstrapping their own subject has nothing safe to "replace" yet, and giving this endpoint destructive power over a school's local content was judged too risky.
- Re-importing a chapter that already exists (matched by `book_type` + `book_name` + `chapter_name`, case/whitespace-insensitive) **updates it in place** — deletes its old topics and inserts the new ones — rather than creating a duplicate.
- Runs in a single database transaction; a mid-import failure rolls back everything.
- Response: `{ ok: true, chapters, chapters_created, chapters_updated, topics, sections_merged }`.

### `POST /api/school/syllabus/bootstrap-chapters`
**The "I don't have a PDF, I just know the chapter count" path.** Auth: `requireSyllabusWriteAccess`.

- Body: `{ school_id, class_id, subject, count }`. `count` must be a whole number from 1 to **50** (hard cap) — invalid input returns a 400 with a message stating that range explicitly (client-side, the same rule is enforced before the request is even sent, so the user sees the error instantly with zero network round-trip).
- Creates `count` empty placeholder chapters named `"Chapter 1"`, `"Chapter 2"`, etc. — numbered starting from **however many chapters already exist + 1**, specifically so bootstrapping the same subject twice never collides two different chapters both named "Chapter 1".
- These are meant to be renamed and filled in with real topics afterward, using the normal "+ Add Subtopic" flow per chapter.

### `POST /api/school/subjects/create-custom`
Creates a bare subject with **no** master-catalog link. Auth: `requireFeeAccess` (not a syllabus guard).

- Body: `{ school_id, grade, subject_name, academic_year? }`.
- 409 if a subject with that exact name already exists for that grade+year.
- Inserts with `master_subject_id: NULL`, `category: 'academic'` (hardcoded). **No chapters or topics are created here** — that's deliberately left to the teacher, via the bootstrap endpoints above, once Class Management has assigned someone to teach it.

### `GET /api/school/subjects/materials?school_id=&grade=&subject_name=&academic_year=`
Returns the textbook/handbook PDFs for one specific subject — the list shown inside the teacher/student syllabus screens (not the standalone Digital Library, which is a separate, broader feature). Auth: `requireSyllabusAccess`, **plus an extra check for teachers**: a teacher can only see materials for a `(subject, grade)` combination they're actually assigned to via `class_subjects` — otherwise 403.

Students and parents only ever get `material_type: 'textbook'` rows back; everyone else (teacher/admin) gets both types. Returns a bare array (not wrapped in an object). If the subject has no `master_subject_id` (a fully custom subject with no catalog origin), returns `[]` rather than an error.

### `GET /api/platform/subjects/gaps`
**The Missing-Content QA checklist**, platform-admin only (`requirePlatformAdmin`).

Two read-only queries against the master catalog: subjects with zero chapters, and chapters with zero topics. Returns `{ empty_subjects: [...], empty_chapters: [...] }`. This is a checklist, not an editor — fixing a gap means going to that subject's normal chapter-editing/bulk-import flow; there's a "Go fix" button that deep-links you there.

### `POST /api/platform/syllabus/bulk-import`
The **platform-admin** version of bulk import — same underlying JSON parser as the school-facing route, but with real differences:

- Requires `subject_id` (a `master_subjects.id`), not a `(school_id, grade, subject)` triple.
- Supports a **`mode: 'append' | 'replace'`** parameter. Replace mode deletes every existing chapter (and its topics) for the exact `(book_type, book_name)` being imported, before writing the new ones — other books on the same subject are untouched. The UI shows a detailed confirmation dialog before allowing this, since it's destructive.
- Has an `explicitAudience` concept the school route lacks: when updating an *existing* chapter during a re-import, only an audience value the pasted JSON itself declared should overwrite what's already set — a request-level "default audience" override is meant only to seed brand-new chapters, not silently clobber a hand-set value on an existing one.

### `POST /api/school/subscribe`
**The deep-copy engine.** Auth: `requireFeeAccess`. This is the single most consequential route in the whole feature — see [§6](#6-school-admin-subscribing-and-customizing) for the full step-by-step.

### Platform catalog CRUD (brief)
- `GET/POST/DELETE /api/platform/subjects` — list/create/delete master subjects. GET accepts `?include_details=true` to eagerly load the whole chapter→topic→resource→task tree in one response (used by the curriculum page's sidebar). **GET's auth is unusually permissive** — any logged-in session, not just platform admin, since the master catalog itself isn't school-scoped data.
- `GET/POST/DELETE /api/platform/subjects/:id/chapters` — chapter CRUD under one master subject. **`GET` here has no auth check at all** (see [§13](#13-known-quirks-and-gaps)). `DELETE` here removes a whole *book* (matched by `book_type`+`book_name`), not a single chapter.
- `GET/POST /api/platform/subjects/:id/materials` — textbook/handbook PDF metadata (the actual file upload goes through a separate presigned-URL flow to Cloudflare R2, not covered here since it's not syllabus-specific).

---

## 5. Platform Admin: building the master catalog

**Screen:** `/platform-admin/curriculum` (`app/platform-admin/curriculum/page.tsx`)

This is where the shared catalog every school draws from gets built. The page has three main things going on:

**1. The subject/chapter/topic browser.** A left sidebar lists subjects filtered by board+grade+category; selecting one shows its chapters (grouped by book, then by semester if applicable), each expandable to its topics. Chapters can be added/edited one at a time through a form, or in bulk (see next).

**2. Bulk import.** The headline feature for populating a subject quickly. A panel offers:
- **Paste JSON directly** — the teacher/admin already has the outline.
- **"Copy ChatGPT prompt"** — generates a ready-to-paste prompt (see [§10](#10-the-bulk-import-json-format-in-full) for the exact text) that asks ChatGPT to produce the JSON from its own knowledge of the official textbook, or from an attached PDF, then a "Ask ChatGPT" link opens chatgpt.com directly.
- **"Load example"** — fills the textarea with a working sample so you can see the exact expected shape.
- **"Select file…"** — reads a local `.json` file straight into the textarea instead of pasting.

Above the panel, three controls (**"Import as"**, **"For"**, **"Book name"**) set defaults used only when the pasted JSON doesn't declare its own `book_type`/`audience`/`book` — useful when a subject has more than one book and you need to tell them apart.

Two submit buttons: **Append** (add without touching existing chapters) and **Replace all** (destructive — deletes everything for the exact book being imported first; shows a detailed confirm dialog before proceeding).

**3. Missing Content tab.** A toggle button in the header (with a live count badge) switches the whole page to a QA checklist: every subject in the entire catalog with zero chapters, and every chapter with zero topics, in one flat read-only list. Each row has a "Go fix" button that jumps back to the normal editor for that exact subject. This exists because after a big bulk-import session it's easy to accidentally target the wrong subject ID or leave a chapter's topics empty — this tab makes those gaps visible in one place instead of discovering them one broken subject at a time.

---

## 6. School Admin: subscribing and customizing

**Screen:** the "Syllabus Customizer" tab in the school-admin sidebar (`app/school-admin/components/CurriculumCustomizer.tsx`)

### Subscribing to a master subject, step by step

1. School admin clicks **"Subscribe to Board Subject"**, opening a modal.
2. Filters by category (academic/extra), board, grade, and academic year; sees a list of master subjects matching those filters, with checkboxes.
3. Selects one or more class-sections to auto-assign teachers to (pre-filled with every section of the chosen grade).
4. Submits. For **each** selected master subject, `POST /api/school/subscribe` runs sequentially (not in parallel — so a partial failure only leaves the not-yet-processed subjects still selected, making a retry safe):
   - Checks the subject isn't already subscribed for that grade+year — 409 if it is.
   - Inserts one `school_subjects` row, copying `board`, `grade`, `category` from the master row.
   - Deep-copies every chapter (`master_chapters → school_chapters`, `is_custom: FALSE`), every topic within each chapter, every resource within each topic, and every task template within each chapter.
   - Builds a `topicIdMap` (old master topic ID → new school topic ID) along the way, so task references stay correct after the copy.
   - **Auto-assigns teachers:** for each selected class, looks at the school's active teaching staff, filters to those whose `teaches_grades` includes this class's grade (or who have no restriction set), then matches by subject name — and inserts/updates a `class_subjects` row (`ON CONFLICT (class_id, subject_name) DO UPDATE`) linking that teacher to the subject for that class. This is the moment a teacher becomes able to see the subject on their own Syllabus tab.
5. On success, the whole subscribe/copy/assign sequence for that one subject is a single database transaction — it either all happens or none of it does.

### "Add Custom Subject" — always available

A second button, **always visible regardless of subscription state** (not gated behind "you must subscribe to something first") — this was a deliberate product decision: a school might teach something the master catalog simply doesn't have (a locally-specific subject), and shouldn't need to wait on the platform catalog to add it.

The form only asks for a subject name and grade. It creates a bare `school_subjects` row with `master_subject_id: NULL` — no chapters, no topics. The success message explicitly tells the admin the next step: *"Assign it to a class in Class Management, then the teacher can build out chapters."* This hands off cleanly into the teacher's bootstrap flows (§7).

### Chapter-based Syllabus Tracking (Academic Analytics)

A separate sidebar tab, `app/school-admin/components/AcademicAnalytics.tsx`, reading from `GET /api/syllabus/analytics`. Three views (By Class / By Teacher / By Subject), each an expandable list of `{covered}/{total} chapters` with a colored progress bar (green ≥75%, amber ≥50%, red below). Four KPI cards at the top: Total Chapters, Chapters Covered, School Coverage %, and Classes Behind (any class under 50%).

**This screen counts chapters, not topics** — see [§13](#13-known-quirks-and-gaps) for exactly why that number can look different from what a teacher or student sees on their own screens for the same subject.

### Resyncing after the master catalog changes

Since subscribing is a one-time deep copy, a school's copy doesn't automatically pick up new content added to the master catalog afterward. A **"Resync"** button on each subscribed subject pulls in any *new* master chapters that weren't part of the original copy (existing school-side chapters are left alone — this only adds, never overwrites).

---

## 7. Teacher: the day-to-day workhorse screen

**Screens:** `app/teacher/components/TeacherSyllabus.tsx` (class picker wrapper) → `SyllabusTracking`, a large exported component inside `app/teacher/components/ClassView.tsx`.

This is described as "the main POC" for the whole feature — it's the screen teachers actually live in day to day, and it went through the heaviest redesign this session: stripped down to just what a teacher needs (Mark Complete), plus the two new ways to bootstrap a subject from nothing.

### Which classes and subjects a teacher sees

`TeacherSyllabus` fetches two things on load: every subject-assignment this teacher has via `class_subjects`, and every class in the school. A teacher's visible class list is the union of (a) the class they're the official class teacher of, and (b) every class they have a `class_subjects` row for. A pill row lets them switch between classes.

**Class teacher vs. subject teacher — an important distinction:** if this teacher is the official class teacher of the currently-selected class, they see **every subject** for that class, not just the ones formally assigned to them (they're the one responsible for the whole class's overall progress). Otherwise, they're strictly limited to the subjects `class_subjects` actually assigned them.

### The topic-by-topic screen (`SyllabusTracking`)

For the selected subject:
- A **subject tab row** (only shown when there's more than one subject) with each tab showing its completion percentage.
- A **book tab row** (only shown when the subject has more than one book) — e.g. switching between a Text Book and a Workbook.
- An overall progress card, a "Textbooks & Handbooks" card linking to the PDF materials for this subject (fetched from the per-subject materials endpoint, §4).
- A **chapter accordion** — each chapter shows a number badge (its position *within the currently-active book*, not the raw database order — since a subject can have multiple books each with their own numbering), a progress bar, and a "Done" badge once every topic in it is covered.
- Inside each expanded chapter, every topic is a row with exactly one primary action: **"Mark Complete"** (toggles to "Completed" and back). A completed topic's name gets a strikethrough. A pending topic also gets a **"Schedule"** button, opening an inline form for a target date and a delay reason — useful for a school admin later seeing *why* a class is behind.

*(What was deliberately removed from this row: a per-topic quiz-count pill, an "Add Homework" shortcut, and a "View Material" button — all judged as clutter that didn't belong on a screen meant purely for tracking completion status.)*

- A **"+ Add Subtopic"** control at the bottom of each chapter — the same underlying endpoint (`POST /api/syllabus`) the school-admin's custom-topic form uses, so a teacher can add topics to a chapter whether or not any others have been marked taught yet.
- A **"+ Add Chapter"** control at the subject level, for laying down an empty chapter shell to fill in later.

### The empty-subject bootstrap panel — the two new entry points

When the currently-selected subject has **zero chapters** (either freshly assigned via Class Management with no syllabus built yet, or a brand-new custom subject), the chapter accordion is replaced by a bootstrap panel offering two paths:

**Path 1 — "Import from ChatGPT / JSON".** Opens the same bulk-import panel used elsewhere in the app (paste JSON / load example / copy a tailored ChatGPT prompt / select a local file), posting to `POST /api/school/syllabus/bulk-import`. This is the fast path when the teacher can get a real chapter-by-chapter outline, either by asking ChatGPT or by typing it out themselves.

**Path 2 — "Enter chapter count".** For when there's no PDF and no time to type an outline — the teacher just knows their textbook has, say, 12 chapters. A single number input (validated 1–50, both client- and server-side) creates that many empty "Chapter 1".."Chapter N" placeholders, ready to be renamed and filled in one at a time via the normal "+ Add Subtopic" flow.

A small "Or add chapters one at a time" link bypasses both bootstrap paths and just opens the plain "+ Add Chapter" form directly.

Both paths funnel into the exact same tracking UI described above once content exists — they're one-time entry points, not separate ongoing screens.

---

## 8. Student: what a child sees

**Screen:** `app/student/components/StudentSyllabus.tsx`, titled **"My learning"**.

Same subject/book tab structure as the teacher screen, same overall progress card, and a "Textbook" materials card (student-scoped, so only `material_type: 'textbook'` files ever appear here — handbooks are invisible to students).

**The key difference from the teacher view: topics are gated.** A topic the teacher hasn't marked covered yet shows only a lock icon and its name — no content, no quiz, nothing clickable. Once covered, the row becomes a clickable link opening the full topic content (`TopicContentViewer`), plus, if the topic has any quiz questions in its question bank, a **"Take quiz"** button.

**How the quiz works today:** clicking "Take quiz" shuffles the topic's question bank and serves up to 3 questions for this attempt. Answering all of them and submitting scores it out of 10 and shows a flash message. *(This score is session-only — there's no backend endpoint to persist a quiz attempt against this student, so refreshing the page loses it. See [§13](#13-known-quirks-and-gaps).)*

An empty state ("No syllabus yet — your teacher hasn't mapped the syllabus for your class yet") is the fallback when the class has literally nothing.

---

## 9. Parent: the read-only summary

**Screen:** `app/parent/components/ParentSyllabus.tsx`, titled **"{Child's first name}'s progress"**.

This is a deliberately narrower view than the student's own screen — a parent doesn't need the "road ahead" (locked topics), just what's already happened. The subject list and progress card look the same, but **the chapter list only shows chapters that have at least one topic already marked covered** — nothing pending or locked is shown at all. Each taught topic shows a checkmark, its name, and *"Taught {date} · {teacher name}"*.

A visible **"avg score /10"** field currently always shows an em-dash placeholder — there's no backend data source for it yet (see [§13](#13-known-quirks-and-gaps)); the UI has a spot reserved for it once quiz-attempt persistence exists.

---

## 10. The bulk-import JSON format, in full

Shared parser: `lib/syllabus/bulk-import-schema.ts`, used identically by the platform, school-admin, and teacher bulk-import routes (only the destination table differs).

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
Shapes 1 and 2 can actually be **mixed in one paste** — the parser checks each top-level array item independently.

**3. Book-extraction shape** — for a PDF that was mechanically extracted into a flat "units" outline rather than hand-organized into chapters/topics:
```json
{ "book": "NCERT Physics Part 1", "book_type": "textbook", "units": [ ... ] }
```

A **topic** can be a plain string, or `{ "title": "...", "subtopics": [...] }`. A **subtopic** can be a plain string or `{ "title": "..." }`.

### Auto-repair for messy PDF extraction

When a chapter PDF gets extracted mechanically, sub-numbered sections (like "9.1", "9.2") sometimes end up as siblings of their parent chapter instead of nested under it. The parser detects heading patterns like `"Chapter 9"`, `"Unit 3"`, or a leading number, and **folds** any non-chapter-heading unit that either looks sub-numbered (`"9.1 ..."`) or has no content of its own into the *previous* chapter's subtopics — but only after confirming the book actually uses that "Chapter N" convention somewhere at all (a book that never numbers its chapters that way is left completely untouched, since there's no pattern to detect a break from). The number of folded sections is reported back in the API response as `sections_merged`, so you can see the repair actually did something.

### Validation errors you might see

The parser gives specific, actionable messages rather than a generic "invalid JSON" — e.g. `"That isn't valid JSON — Unexpected token..."`, `"The top level must be an array of chapters..."`, `"Chapter 3: needs a non-empty title."`, `"Chapter 2, topic 4 (\"...\"): 'subtopics' must be an array of strings."` — each naming exactly which chapter/topic/subtopic index failed.

### The "Copy ChatGPT prompt" text

Generated by `lib/syllabus/chatgpt-prompt.ts`, tailored to the exact board/grade/subject you're working on. The prompt explicitly tells ChatGPT: use the official textbook from its own knowledge if no PDF is attached (don't stop and ask for one), output *only* a JSON array with no explanation or markdown fences, follow one of the two exact shapes above depending on whether the subject splits by semester, and never generate quiz content — titles only.

---

## 11. Auth model — who can do what

Two tenant-scoped helper functions in `lib/auth.ts` do almost all the gatekeeping for this feature:

- **`requireSyllabusAccess(school_id)`** — read access. Admits platform admin (any school), or any logged-in teacher/student/parent/school-admin session **whose own school_id matches the one requested** (a cross-tenant attempt — someone passing a different school's ID — is silently rejected).
- **`requireSyllabusWriteAccess(school_id)`** — everything `requireSyllabusAccess` does, narrowed to roles that can actually mutate the syllabus: `teacher, school_admin, principal, vice_principal, platform_admin`. Students and parents can read but never write.

**Important inconsistency to know about:** not every route in this feature actually uses these two functions. `GET /api/syllabus/analytics`, `POST /api/school/subjects/create-custom`, and `POST /api/school/subscribe` all use `requireFeeAccess` instead (a different, older tenant-check helper with the same underlying tenant-matching logic, just not syllabus-specific by name). And `GET /api/platform/subjects/:id/chapters` currently has **no auth check at all**. None of this is a functional access-control hole for the write-side routes — `requireFeeAccess` still correctly blocks cross-tenant access — but it means "search for `requireSyllabusAccess`" won't find every route that touches syllabus data.

**Feature-flag gating, separately:** a school can have the `curriculum` feature toggled on/off at the plan-tier level (`plan_features` table) or overridden per-school (`school_feature_overrides`). `schoolHasFeature()` checks the per-school override first, then the school's subscription tier — and **tiers inherit downward**: a `premium` school automatically gets anything enabled at `basic` or `standard`, without needing it separately enabled at `premium` too. *(This inheritance was a real bug fix this session — the function used to check only the school's own literal tier, so a feature turned on for `basic` silently stayed invisible to `standard`/`premium` schools even though the platform-admin config screen showed it as "on".)*

---

## 12. End-to-end scenarios, step by step

### Scenario A: Platform Admin builds a new subject from scratch

1. Platform admin opens `/platform-admin/curriculum`, picks board=CBSE, grade=9, adds a new subject "Mathematics".
2. Clicks into it — sees zero chapters, the empty state.
3. Clicks "Copy ChatGPT prompt", pastes it into ChatGPT along with (optionally) a photo/PDF of the textbook's table of contents.
4. Pastes ChatGPT's JSON response into the bulk-import textarea, clicks "Append".
5. Chapters and topics appear, organized by semester if the response used that shape.
6. Checks the "Missing Content" tab — confirms no chapters or topics came back empty (a common failure mode if ChatGPT's response got truncated or malformed).

### Scenario B: A school subscribes and a teacher takes over

1. School admin opens Syllabus Customizer, clicks "Subscribe to Board Subject", picks CBSE/Grade 9/Mathematics, selects class 9-A, submits.
2. Behind the scenes: `school_subjects`, `school_chapters`, `school_topics` all get deep-copied; `class_subjects` gets a row linking whichever Mathematics teacher matches by subject name to class 9-A.
3. That teacher logs into the Teacher portal, opens Syllabus, sees Mathematics already fully populated (inherited from the master catalog) — no bootstrap needed, since it wasn't empty.
4. Teacher expands Chapter 1, marks the first topic "Mark Complete".
5. A student in 9-A opens their own Syllabus tab — that first topic is now unlocked and clickable; every other topic in the chapter is still shown locked.
6. A parent of that student opens their portal's Syllabus tab — sees exactly that one topic listed as taught, with the teacher's name and today's date. Nothing else appears (locked topics are invisible to parents by design).
7. School admin checks Academic Analytics — Mathematics for 9-A now shows some non-zero chapter-completion percentage once that chapter's *every* topic is eventually covered (not before — a chapter with even one pending topic still counts as 0% complete on this specific screen, even though the teacher's own view shows partial progress).

### Scenario C: A subject exists nowhere in the master catalog

1. School admin needs "Value Education" for Grade 6 — not in the platform catalog at all.
2. Clicks "Add Custom Subject" (available regardless of subscription state), types the name and grade, submits. A bare `school_subjects` row is created with no chapters.
3. Goes to Class Management, assigns a teacher to "Value Education" for the relevant class — this creates the `class_subjects` row.
4. That teacher opens their Syllabus tab. Thanks to the `class_subjects` fallback in `GET /api/syllabus`, "Value Education" appears as a subject tab even though it has zero chapters — not a dead end.
5. Teacher picks "Enter chapter count", types 8, gets 8 empty placeholder chapters.
6. Teacher expands each one, renames it (via the standard chapter-rename flow) and adds subtopics as they go through the term.

---

## 13. Known quirks and gaps

Documenting these here so they're not mistaken for bugs when someone notices them later — some are deliberate, some are acknowledged unfinished work.

- **Two different completion percentages exist for the same subject**, and this is intentional, not a bug: the teacher/student/parent screens (`GET /api/syllabus`) count individual topics, while the school-admin analytics screen (`GET /api/syllabus/analytics`) counts whole chapters (a chapter only "counts" once every topic in it is covered). A subject can legitimately show 60% on one screen and a different number on the other at the same moment.
- **No quiz-attempt persistence anywhere.** A student's quiz score exists only in that browser session's memory — there's no `student_topic_quiz_attempts` table or `/api/.../quiz-attempt` endpoint, so it disappears on refresh, and the parent portal's "avg score" field has nowhere to read from (hence the permanent em-dash placeholder there today).
- **No topic auto-unlock/lock schema.** The student-facing "locked until taught" behavior is enforced purely by `status !== 'covered'` in the UI — there's no dedicated locking column, ordering gate, or per-topic quiz-visibility gate in the database. Marking one topic taught never has any effect on any other topic's visibility.
- **`master_subject_materials.material_type` doesn't allow `'workbook'`**, even though `book_type` on chapters does. The platform-admin bulk folder-import feature silently downgrades an uploaded workbook to `'handbook'` when creating the materials-list entry — meaning a workbook can end up mislabeled "Hand Book" (and therefore hidden from students, since handbooks are staff-only) in the Digital Library UI.
- **`GET /api/platform/subjects/:id/chapters` has no authentication check at all.** Every other platform-admin write route in this feature correctly requires `requirePlatformAdmin`; this one GET route was missed.
- **Auth helper naming is inconsistent.** Several syllabus-adjacent routes (`syllabus/analytics`, `school/subjects/create-custom`, `school/subscribe`) use `requireFeeAccess` rather than `requireSyllabusAccess`/`requireSyllabusWriteAccess`, even though they're not fee-related — the underlying tenant-matching behavior is identical, so this isn't a security gap, just a naming trap if you go searching the codebase by function name.
- **The same handful of small helper functions are copy-pasted into four different files** rather than shared from one place: `computeBookGroups`, `audienceBadge` (renamed `majorityAudienceBadge` in one of the four), and the `BOOK_TYPE_LABELS`/`AUDIENCE_LABELS` constant objects all exist verbatim in `ClassView.tsx`, `StudentSyllabus.tsx`, `CurriculumCustomizer.tsx`, and the platform-admin curriculum page.
- **Two bulk-import routes' "does this chapter already exist" matching logic differs subtly in how they treat a `NULL` book name** — the platform route uses SQL's `IS NOT DISTINCT FROM` (treats two NULLs as equal), the school route uses `COALESCE(..., '') =` (treats NULL and empty string as equal). Same practical outcome in almost every real case, but worth knowing if a book-name edge case ever behaves unexpectedly in one route and not the other.
- **`DELETE /api/syllabus` doesn't filter by `academic_year`** when resolving which subject to delete a chapter from, unlike every sibling route that does. After a Year Rollover, if the same subject name exists in two different academic years for a school, this route could theoretically resolve the wrong one. Low practical risk today since Year Rollover doesn't currently duplicate subject rows across years in a way that's been observed to trigger this, but worth fixing if it ever does.

---

## 14. Quick-reference glossary

| Term | Meaning |
|---|---|
| **Master catalog** | The platform-wide, shared `master_subjects → master_chapters → master_topics` tree, built once by Platform Admin |
| **School copy** | A school's own independent deep-copy of some or all of the master catalog, made at subscribe time |
| **`is_custom`** | Flag on a school-side chapter/topic meaning it has no master-catalog origin — created directly at the school level. Controls whether it can be renamed/deleted (board-mandated content cannot be) |
| **Bootstrap** | Populating an otherwise-empty subject with chapters, via JSON import or by entering a chapter count |
| **Book** | A subject can have more than one — distinguished by `(book_type, book_name)`, e.g. a Text Book and a separate Workbook |
| **`book_type`** | `'textbook' \| 'handbook' \| 'workbook'` |
| **`audience`** | Who a book is meant for: `'teacher' \| 'student' \| 'both'` — a display label only, does not actually restrict visibility anywhere |
| **Progress / coverage** | Whether a topic has been marked taught for one specific class-section, tracked in `school_topic_progress` |
| **`class_subjects`** | The table recording which teacher teaches which subject to which class — the real source of truth for "can this teacher see this subject" everywhere in the feature |
| **Resync** | Pulling newly-added master-catalog chapters into a school's already-subscribed copy, without touching what's already there |
| **Missing Content** | The platform-admin QA tab listing every empty subject/chapter in the master catalog |
