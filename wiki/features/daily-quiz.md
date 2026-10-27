# Feature: Daily Quiz & Leaderboard

**Platform Admin feature key:** `daily-quiz`
**Portal:** School Admin / Teacher / Student / Parent
**Status:** Partial. The question bank (#432) and the daily quiz itself (#433) are built. Points, streaks and the leaderboard come in #434. The feature key is seeded OFF at every tier.
**Last updated:** 2026-10-27

---

## What it does

A 5-minute daily habit. Every working day in the season (1 July – 15 March by default), each student gets one MCQ per class subject on the topics their class just covered. They finish the whole quiz, see “Your quiz is completed”, and the right answers with explanations come out after the close (21:00 by default).

## Question bank (built, #432)

Platform Admin → **Question Bank**: pick board and grade, then a subject.

1. **Check what it will do:** imports questions already typed into Master Syllabus, optionally uploads the subject's textbook PDF to Anthropic, and shows how many topics need questions and the **maximum cost**.
2. **Start preparation:** one Claude (Opus 5.5) Message Batches request per chapter, in the background (usually under an hour, at most 24 hours), at about 12 questions per topic, grounded in the textbook when one was chosen.
3. **Automatic check:** Groq answers every question without seeing the key; only questions where both agree are saved. Malformed and duplicate questions are dropped and answer positions are spread evenly.
4. **Spot-check and publish:** the admin reads, edits or retires questions, then presses **Publish**. Only published subjects ever reach students.

- Collection runs while the screen is open and in a daily cron (`/api/cron/quiz-bank`), so closing the screen never loses work.
- Questions are in English, except Telugu and Hindi subjects, which are written in their own script.
- Teachers see the published questions for the subjects they teach (**Quiz Questions**, read-only in the pilot).
- Students can report a question; three reports pull it until Platform Admin restores (after fixing) or retires it.
- Needs `ANTHROPIC_API_KEY` (Claude) and `GROQ_API_KEY` (checker) on the server.

## The daily quiz (built, #433)

**When (Platform Admin → Daily Quiz):** one global setting with an optional override per school: season dates, open and close time (IST, default 15:30–21:00) and grades (default 3–10). Schools can't see or change it. Quizzes run only on working days (holidays and the weekly off from the school calendar have none). A posted quiz keeps its own times if the settings change later.

**What is asked (per class, per day):** one question for every subject in the class's Class Management list whose bank is published:
1. a topic the class covered in the last 5 working days, else
2. a topic planned (`target_date`) for those days, else
3. revision of an older covered topic (each student gets topics they got wrong first), else the subject is skipped.

Topics the teacher hid in Syllabus Setup are never asked. Each student draws their own question on those topics, unseen ones first.

**Posting:** the quiz exists from the open time: created by the first student or parent who opens it, or by `/api/cron/daily-quiz`, which runs after the open, after the reminder time and after the close.

**Taking it (student portal → Daily quiz, or parent portal → Daily Quiz for a child):**
- a big card on the home screen from the open time; one question at a time; answers can change until **Finish quiz**, which needs every question answered; then **“Your quiz is completed!”**
- the correct answers, explanations and score are sent only **after the close**; until then the server never sends them
- an unfinished attempt at the close is finished with the answers given (one with nothing answered is dropped, so the student can still take it late)
- **missed quizzes** can be taken late for 7 days; a late quiz shows its answers right after finishing
- students can report a question from the review screen

**Notices (bell + push, to the student and their parents):** “Today's quiz is ready” after the open; “Quiz closes soon” 2 hours before the close, only to students who haven't finished; “Quiz answers are out” after the close, to those who finished on time. Each goes once per quiz.

## Coming next

- **#434:** reward points (participation; accuracy once the answers are out; half points for late quizzes), working-day streaks, badges, the weekly leaderboard, and the parent view and weekly report.
- **#435:** after reading the explanation, “Ask WLYL AI”, then “Ask Teacher” (see [student-doubts.md](student-doubts.md)), and teacher WLYL Stars.

## Planned build

| Phase | Issue |
|---|---|
| Feature key (this doc) | #431 |
| Question bank (pilot grades) | #432 |
| Daily quiz (one question per subject), answers after the close, late for 7 days, notices | #433 |
| Reward points, streaks, leaderboard, weekly parent report | #434 |
| Insights (after the pilot) | #437 |

Epic: #430.

## Code evidence

<!-- AUTO:evidence:daily-quiz:start (generated by scripts/product-docs.mjs — do not edit by hand) -->
**Code evidence** — checked against the repository on every run of `node scripts/product-docs.mjs`.

Screens: `app/platform-admin/question-bank/page.tsx`, `app/platform-admin/daily-quiz/page.tsx`, `app/teacher/components/TeacherQuizBank.tsx`, `components/dailyQuiz/DailyQuiz.tsx`, `app/student/components/StudentDailyQuiz.tsx`, `app/parent/components/ParentDailyQuiz.tsx`

API routes these screens call (all exist):
- `POST` /api/parent/quiz/attempts
- `GET` /api/parent/quiz/today
- `GET` /api/platform/quiz-bank
- `POST` /api/platform/quiz-bank/advance
- `PATCH` /api/platform/quiz-bank/questions/{}
- `GET` /api/platform/quiz-bank/reports
- `GET` /api/platform/quiz-bank/subjects/{}
- `POST` /api/platform/quiz-bank/subjects/{}/estimate
- `POST` /api/platform/quiz-bank/subjects/{}/publish
- `POST` /api/platform/quiz-bank/subjects/{}/start
- `GET` /api/platform/quiz-bank/topics/{}/questions
- `GET/PUT` /api/platform/quiz-settings
- `GET/PUT` /api/platform/quiz-settings/schools/{}
- `POST` /api/student/quiz/attempts
- `POST` /api/student/quiz/questions/{}/report
- `GET` /api/student/quiz/today
- `GET` /api/teacher/quiz-bank

✅ Every API route the screens call exists.
<!-- AUTO:evidence:daily-quiz:end -->

## Related

- [student-doubts.md](student-doubts.md)
- [curriculum.md](curriculum.md): topic coverage is the quiz's source
- [calendar.md](calendar.md): working days

## Status history

| Date | Change | Issue |
|------|--------|-------|
| 2026-10-27 | Feature key registered (OFF at every tier); doc created as Planned | #431 |
| 2026-10-27 | Question bank: preparation (Claude + Groq check), review, publish, teacher view, student reports | #432 |
| 2026-10-27 | Daily quiz: posting, taking it (student and parent), answers after the close, late for 7 days, notices, Platform Admin settings | #433 |
