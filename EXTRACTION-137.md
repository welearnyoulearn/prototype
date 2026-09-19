# Extraction Plan — Ask a Doubt (`doubts`, issue #137)

Purpose: this file lists exactly what a human should remove from `dev` to
extract the Ask-a-Doubt (Gemini-backed) feature. This branch
(`feature/137-remove-ask-a-doubt`) is the **preservation copy** — no code is
removed here, only this plan and a wiki note are added.

## 1. `lib/features.ts`
- Remove the `doubts` entry from `ALL_FEATURES` (line 21).
- Not in `OVERRIDABLE_FEATURE_KEYS` or `PORTAL_NAV_KEY_ALIASES` — nothing else to remove there.

## 2. `lib/gemini.ts`
- Remove `generateDoubtAnswer(...)` (starts line 83) — the Gemini prompt/call
  that auto-answers a student's doubt. Check for shared helpers (API client
  setup, prompt-building utils) used by *other* Gemini features (e.g. Daily
  Briefing, Syllabus translate) before deleting the whole file — only remove
  the doubt-specific function and any doubt-only helper it alone uses.

## 3. `lib/db.ts`
- `doubts` table + indexes (`idx_doubts_class`, `idx_doubts_student`, `idx_doubts_status`) — lines ~482-500.
- `doubt_messages` table + index — lines ~524-536.
- Later `ALTER TABLE doubts ...` migrations: `last_message_at`, `resolved_at`, `resolved_by`, `message_count` (536-539), `doubt_messages.is_final_answer` + `doubts.closed_by_teacher` (542-543), `doubts.is_class_faq`/`faq_set_by` (546-547), `doubts.upvote_count` + `doubt_upvotes` table + index (550-559).
- `plan_features` seed row `('doubts', ...)` at line 2152.
- Leave `student_activity_log`'s `doubt_ask` action-type comment (line 1037) — it's a free-text column, not an enum; no schema change needed.

## 4. API routes — delete entirely
- `app/api/doubts/route.ts` (imports `generateDoubtAnswer` from `lib/gemini.ts`)
- `app/api/doubts/[id]/route.ts`
- `app/api/doubts/[id]/messages/route.ts`
- `app/api/doubts/[id]/upvote/route.ts`
- `app/api/doubts/peers/route.ts`

## 5. UI components
- `app/student/components/StudentDoubts.tsx` — delete.
- `app/teacher/components/DoubtsCenter.tsx` — delete (check for importers first; not found wired into `app/teacher/page.tsx` at the time of this audit — may be orphaned already, confirm before deleting).
- `app/teacher/components/ClassDoubts.tsx` — delete; also remove `import ClassDoubts from './ClassDoubts'` and its render block (`<ClassDoubts ... />`, ~line 3276) plus the `'Doubts'` tab from `CLASS_TEACHER_TABS`/`SUBJECT_TEACHER_TABS` and `onGoToDoubts` wiring in `app/teacher/components/ClassView.tsx`.
- `app/components/FloatingAIChat.tsx` — **orphaned**: no file in the repo imports it (verified via repo-wide grep). Safe to delete outright as part of this feature (it's the Gemini doubt-chat widget), but flagging since it's currently dead code rather than actively wired UI — worth a sanity check in case it's meant to be re-attached rather than deleted.
- `app/student/page.tsx` — remove the `StudentDoubts` dynamic import, the `{ key: 'doubts', label: 'Ask a Doubt', icon: '💬' }` nav entry, `'doubts'` from `RESTRICTABLE_NAV_KEYS`, the `{ key: 'doubts', ... }` quick-link, and the `visitedNav.has('doubts')` render block.
- `app/student/components/StudentRewards.tsx`, `app/student/components/StudentDashboard.tsx`: check for `doubt_ask`/doubts-count copy and remove if present (not confirmed present at time of audit — only `homework`'s `hasHomework` gate was confirmed there; do a targeted grep for "doubt" before touching).

## 6. Related but NOT part of this feature — keep
- `app/api/weekly-test/route.ts`, `app/api/cron/weekly-test/route.ts`, `app/student/components/WeeklyTest.tsx` matched "doubts" only incidentally (via shared analytics/activity-log code) — verify with a targeted diff before touching; do not delete these files.
- `app/school-admin/components/YearReview.tsx`, `ClassAnalytics.tsx`, `app/teacher/components/SmartSnapshot.tsx`, `ClassPerformance.tsx` reference doubts counts as analytics inputs — remove only the doubts-specific metric/line, keep the rest of the component.

## Summary
Ask a Doubt has a clean core (feature flag, 2 DB tables + upvotes, 5 API
routes, `generateDoubtAnswer` in `lib/gemini.ts`, `StudentDoubts.tsx`/`ClassDoubts.tsx`)
plus one confirmed dead component (`FloatingAIChat.tsx`, unreferenced anywhere).
Several analytics/dashboard files (Daily Briefing, Class Analytics, Smart
Snapshot) surface doubts *counts* as one metric among many — those need
surgical line removal, not file deletion.
