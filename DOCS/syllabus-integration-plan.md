# Ulearn prototype → welearnyoulearn integration plan

**Goal:** fold the syllabus / quiz UX proven in the `Ulearn` prototype
(scratchpad + hosted artifact) into the real `projects/prototype`
(welearnyoulearn) Next.js app, without reinventing what already exists.

**Prepared:** 2026-07-15 · author: Claude (for review before starting)

---

## 0. TL;DR — the key realisation

This is **not a greenfield port.** The `origin/Syllabus` branch already
implements ~80% of the prototype against a real Postgres model:

| Prototype concept | Already exists on `origin/Syllabus` |
|---|---|
| Platform master library (board→grade→subject→chapter→topic) | `api/platform/{subjects,chapters,topics,tasks}` → `master_*` tables |
| School import + overlay/customise | `api/school/custom/*`, `api/school/subscribe`, `school_subscriptions` |
| Per-class syllabus + coverage analytics | `api/syllabus`, `api/syllabus/analytics`, `syllabus_topics` |
| Teacher "mark taught" + class view | `teacher/components/HODSyllabus.tsx`, `ClassView.tsx` |
| Student syllabus view | `student/components/StudentSyllabus.tsx` |
| Quizzes / tests | `api/weekly-test`, `weekly_tests`, `lib/gemini.ts generateWeeklyTest` |
| Textbook grounding (RAG) | `api/textbooks` (chunking), `textbook_uploads/` |

**So the work is:** (a) adopt the prototype's cleaner flows/wording, and
(b) build the genuinely-new pieces the prototype introduced that the branch
lacks (below). Build **on `origin/Syllabus`**, not on a blank slate.

---

## 1. Gaps the prototype introduced (the actual new work)

Ranked by value:

1. **Bulk JSON import** (chapters + topics + quizzes in one paste) — the
   prototype's headline feature. Branch only creates rows via individual
   POST routes. → new `POST /api/platform/syllabus/bulk-import` (+ school variant).
2. **"Copy ChatGPT prompt" helper** — lets a curator generate the import JSON
   from a chapter PDF. Branch instead auto-generates via Gemini server-side.
   *Reconcile:* keep both — Gemini auto-gen **and** manual JSON paste. The
   prompt builder is pure UI/util (portable as-is).
3. **Per-topic approved quiz bank + curator approval pipeline** — prototype
   treats quizzes as a reviewed, per-topic bank grounded in the textbook.
   **Storage already exists: `master_topics.questions` (JSONB).** Gap is only
   the *review/approve UI* + letting `weekly_tests` (Gemini) *draw from* this
   approved bank instead of generating from scratch.
4. **Mark-taught → unlock next topic + open its quiz to students** — the
   sequential gating. Confirm whether `syllabus_topics` already models this;
   if not, add `status` (locked/unlocked/taught) semantics (or derive it, as
   the prototype now does — see §3).
5. **School-admin read-only quiz preview** — modal to view a topic's approved
   questions. Small, additive.
6. **Parent view of quiz scores** — parent portal shows child's per-topic
   scores. Wire to quiz submissions.

---

## 2. Data model — mostly already there

**Confirmed against `lib/db.ts` on `origin/Syllabus`** (all ids are `SERIAL`
integers, not uuid):

- `master_subjects (id, board, grade, subject_name)`
- `master_chapters (id, subject_id→master_subjects, chapter_name, chapter_order, description)`
- `master_topics (id, chapter_id→master_chapters, topic_name, topic_order, content_text, content_pdf_url, questions JSONB DEFAULT '[]')`
- `syllabus_topics` (per-class coverage, `covered_by`), `weekly_tests`,
  `school_subscriptions`, `school custom_*` tables.

**The per-topic approved quiz bank already exists as `master_topics.questions`
(JSONB array).** The prototype's `quizBank[topicId]` maps 1:1 to it — store
`[{ q, options, correct, source }]`. So **no new bank table is needed.**

Only genuinely-new table: quiz **attempts** (for teacher/parent score views),
if `weekly_tests` isn't reused:

```sql
CREATE TABLE IF NOT EXISTS topic_quiz_attempts (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id    INTEGER NOT NULL REFERENCES master_topics(id) ON DELETE CASCADE,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  score       SMALLINT NOT NULL,          -- 0..10
  answers     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

RLS: enable on any new table + grants (shared Supabase DB — see shared-RLS
memory). For teaching status, reuse `syllabus_topics` (`covered_by`); derive
unlocked/locked from it (see §3) rather than storing lock state.

---

## 3. Reusable pieces portable verbatim from the prototype

These are pure logic and drop in with only a TS-types pass (no DB):

- **Bulk-import validation** (`bulkImportSyllabus` / `parseQuizArray`): the
  exact validation — array shape, `options` length ≥2, `correct` in range,
  string topics vs `{title, quiz}` objects. Ported to
  `lib/syllabus/bulk-import-schema.ts` (see the branch scaffold).
- **ChatGPT prompt builders** (`SYLLABUS_PROMPT`, `QUIZ_PROMPT`) → ported to
  `lib/syllabus/chatgpt-prompt.ts` (already handles the "no PDF attached / use
  your knowledge" wording that unblocked ChatGPT).
- **Derived unlock/lock gating** — the prototype now *derives* a topic's
  unlocked/locked state ("unlocked once all earlier topics are taught")
  instead of storing it. Recommended for the app too: store only `taught`,
  derive the rest → robust to bulk imports and reordering.
- **Randomised per-attempt quiz subset** (shuffle → take N → freeze in state).

---

## 4. UI mapping (which existing files get the prototype's flows)

| Prototype view | Target in app | Change |
|---|---|---|
| Platform admin syllabus + Bulk upload + Copy prompt | `platform-admin/curriculum/page.tsx` | add BulkImport panel + prompt buttons |
| Platform admin Quizzes tab + approval pipeline | new `platform-admin/curriculum` sub-tab | approve/reject/import questions |
| School admin class→subject→chapter + quiz preview | `school-admin/components/CurriculumCustomizer.tsx` | add read-only quiz modal |
| Teacher mark-taught → unlock | `teacher/components/HODSyllabus.tsx` / `ClassView.tsx` | ensure unlock-next + "quiz open" |
| Student sees taught topics + take quiz | `student/components/StudentSyllabus.tsx` | quiz-taking from approved bank |
| Parent scores | `parent/...` | per-topic scores table |

Keep the prototype's palette (Ink/Teal/Gold/Cream) only if it matches the
app's existing design system — otherwise use the app's shadcn/Tailwind tokens
(the "match existing theme" rule wins over the prototype's inline styles).

---

## 5. Standards checklist (non-negotiables from CLAUDE.md)

- [ ] **GitHub issue first** — one per shippable unit (bulk-import, quiz-bank,
      parent-scores). Branch name `feature/{issue}-syllabus-bulk-import`.
      *(NOTE: the local gh token can't create issues — the user must open them
      and we rename the branch to include the number.)*
- [ ] **TS strict, no `any`** — the ported utils are fully typed.
- [ ] **`data-testid`** on every interactive element (bulk-import textarea,
      Append/Replace, Copy-prompt, approve/reject, Take-quiz, Submit).
- [ ] **Supabase = DB only** (custom auth via `users`/`user_profiles`).
- [ ] **pnpm**, Tailwind + shadcn/ui.
- [ ] **RLS enabled** on `topic_quiz_questions`, `topic_quiz_attempts` + grants.
- [ ] Playwright tests for: bulk import (valid + invalid), mark-taught→student
      sees quiz→submit→parent sees score.
- [ ] Update `docs/CHANGELOG.md`, `docs/DECISIONS.md`, and the wiki feature doc.

---

## 6. Suggested sequencing (small, reviewable PRs)

1. **PR 1 — foundations:** merge/rebase current work onto `origin/Syllabus`;
   add `lib/syllabus/bulk-import-schema.ts` + `chatgpt-prompt.ts` + tests. (No
   UI, no DB — safe.)
2. **PR 2 — bulk import (platform):** `POST /api/platform/syllabus/bulk-import`
   writing `master_chapters/master_topics`; BulkImport panel + Copy-prompt in
   `platform-admin/curriculum`. Playwright.
3. **PR 3 — quiz bank + approval:** `topic_quiz_questions` table + CRUD +
   approval UI; bulk import of questions (inline `quiz` arrays).
4. **PR 4 — teaching gating + student quiz:** derive unlock; student takes
   quiz from approved bank; `topic_quiz_attempts`.
5. **PR 5 — school preview + parent scores.**

---

## 7. Open questions for the team

- Keep **Gemini auto-gen** weekly tests, the **per-topic approved bank**, or
  both? (Recommend: bank is the source of truth; Gemini drafts into it.)
- Is `origin/Syllabus` the intended base, or should it merge to `dev` first?
- Board scope: prototype shows CBSE/ICSE/TS/AP; `lib/curricula.ts` already has
  CBSE + APSSC — confirm the board list.
