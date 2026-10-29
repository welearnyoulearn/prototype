# Feature: Daily Quiz & Leaderboard

**Platform Admin feature key:** `daily-quiz`
**Portal:** School Admin / Teacher / Student / Parent
**Status:** Built for the pilot: the question bank (#432, made automatically at syllabus import since #444), the daily quiz (#433), points, streaks, the leaderboard and the weekly parent report (#434), and Ask WLYL AI / Ask Teacher (#435, see [student-doubts.md](student-doubts.md)). The feature key is seeded OFF at every tier.
**Last updated:** 2026-10-29

---

## What it does

A 5-minute daily habit. Every working day in the season (1 July – 15 March by default), each student gets one MCQ per class subject on the topics their class just covered. They finish the whole quiz, see “Your quiz is completed”, and the right answers with explanations come out after the close (21:00 by default).

## Question bank (built, #432; made at import since #444)

**Questions are made once, when the syllabus is imported.** Importing or adding topics in Master Syllabus starts preparation for those topics automatically. Nobody has to press anything.

1. **Questions typed into Master Syllabus** are imported first.
2. **Claude (Opus 5.5) writes the rest:** one Message Batches request per chapter, in the background (usually under an hour), **8 per topic**, grounded in the subject's newest textbook when one is uploaded.
3. **Groq answers every question without seeing the key;** only questions where both agree are saved. Malformed and duplicate questions are dropped and answer positions are spread evenly.
4. **Published automatically** once checked. If Platform Admin takes a subject offline, it stays offline until they publish it again.

- **Retries:** topics added while a preparation runs are prepared right after it. Topics still under **5** questions are retried automatically (up to 3 times, 6 hours apart).
- **Progress** moves on its own: from the open Question Bank screen, the students' quiz pages and the daily-quiz cron, so nothing waits for the once-a-day job.
- **Platform Admin → Question Bank** is now a status board: topics ready per subject, edit or retire any question, **set each subject's language** (English / Telugu / Hindi; when unset it is guessed from the name), and prepare older subjects by hand (with the cost shown first).
- **A school's own topics** (custom subjects, chapters or topics, or a teacher's own syllabus import) get their own questions automatically, with the same Claude + Groq check, used only by that school and only when it has the daily-quiz feature. Platform Admin → Question Bank → **Schools' own topics** shows their progress.
- Teachers see the published questions for the subjects they teach (**Quiz Questions**, read-only in the pilot).
- Students can report a question; three reports pull it until Platform Admin restores (after fixing) or retires it.
- Needs `ANTHROPIC_API_KEY` (Claude) and `GROQ_API_KEY` (checker) on the server.

## The daily quiz (built, #433)

**When (Platform Admin → Daily Quiz):** one global setting with an optional override per school: season dates, open and close time (IST, default 15:30–21:00) and grades (default 3–10). Schools can't see or change it. Quizzes run only on working days (holidays and the weekly off from the school calendar have none). A posted quiz keeps its own times if the settings change later.

**What is asked (per class, per day, #444):** one question for every subject in the class's Class Management list (master-backed or the school's own) that has a completed topic with questions:
1. **a topic the teacher marked completed since the last quiz** (completed in the last 14 days and not yet asked as a new topic in this class). Newest first, then syllabus order; if several were marked, the others follow on the next days.
2. **nothing new → revision** of every completed topic. Each student gets the topics they got wrong first, then the ones they were asked least recently.
3. **nothing ever completed** in that subject → it is skipped that day.

Only completed topics are used; a topic that is merely planned is never asked. Topics the teacher hid in Syllabus Setup are never asked. Each student draws their own question, unseen ones first.

**Posting:** the quiz exists from the open time: created by the first student or parent who opens it, or by `/api/cron/daily-quiz`, which runs after the open, after the reminder time and after the close.

**Taking it (student portal → Daily quiz, or parent portal → Daily Quiz for a child):**
- a big card on the home screen from the open time; one question at a time; answers can change until **Finish quiz**, which needs every question answered; then **“Your quiz is completed!”**
- the correct answers, explanations and score are sent only **after the close**; until then the server never sends them
- an unfinished attempt at the close is finished with the answers given (one with nothing answered is dropped, so the student can still take it late)
- **missed quizzes** can be taken late for 7 days; a late quiz shows its answers right after finishing
- students can report a question from the review screen

**Notices (bell + push, to the student and their parents):** “Today's quiz is ready” after the open; “Quiz closes soon” 2 hours before the close, only to students who haven't finished; “Quiz answers are out” after the close, to those who finished on time. Each goes once per quiz.

## Points, streaks and the leaderboard (built, #434)

**Reward points** go into `student_points`, which is a ledger: one row per award, the balance is the sum, and a future marketplace can spend points with negative rows. Every quiz award is unique per (student, action, reference), so nothing is ever paid twice.

| When | Points |
|---|---|
| Finishing on time | +5 |
| Finishing late (within 7 days) | +3, and nothing for accuracy |
| Once the answers are out (on time only) | +2 per correct answer (max +10), +5 for a perfect quiz (3+ questions) |
| Streak of 5 / 20 / 60 school days in a row | +10 / +30 / +75 |
| Accuracy up 10 points or more on last week (3+ quizzes each week) | +10, on Saturday |

- **Streak:** counts the class's quizzes in a row the student finished (on time or late). Holidays and weekly offs have no quiz, so they never break it; today's quiz doesn't break it while it is still open.
- **Badges:** Quiz Starter, 5-, 20- and 60-Day Streak, Sharp Shooter (10 perfect quizzes).
- **Leaderboard:** this week's points in the class from on-time quiz work (late catch-ups don't count). Students see the top 10 and their place, plus Most Improved; parents see their child's place, the class average and the top 3 only.
- **Class goal:** 80% of students finish each quiz on time.
- **Weekly parent report** (Saturday evening, once): quizzes finished, % correct, points and class rank, strongest subject, the one needing practice, and a dinner-table question the child got wrong.
- **School Admin → Daily Quiz:** this week per class (participation against the goal, accuracy, top students, most improved) and accuracy per subject. Read-only.

## Coming next

- **Parent mobile app** (wlyl-parent-mobile#11): the quiz, pushes and the weekly report in the app.
- **After the pilot:** escalation of overdue doubts (#436) and learning insights (#437).

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

Screens: `app/platform-admin/question-bank/page.tsx`, `app/platform-admin/daily-quiz/page.tsx`, `app/teacher/components/TeacherQuizBank.tsx`, `components/dailyQuiz/DailyQuiz.tsx`, `components/dailyQuiz/Doubts.tsx`, `components/dailyQuiz/QuizProgress.tsx`, `app/student/components/StudentDailyQuiz.tsx`, `app/parent/components/ParentDailyQuiz.tsx`, `app/school-admin/components/SchoolDailyQuiz.tsx`

API routes these screens call (all exist):
- `GET` /api/parent/doubts
- `POST` /api/parent/quiz/attempts
- `GET` /api/parent/quiz/progress
- `GET` /api/parent/quiz/today
- `GET` /api/platform/quiz-bank
- `POST` /api/platform/quiz-bank/advance
- `PATCH` /api/platform/quiz-bank/questions/{}
- `GET` /api/platform/quiz-bank/reports
- `GET` /api/platform/quiz-bank/school-topics
- `GET/PATCH` /api/platform/quiz-bank/subjects/{}
- `POST` /api/platform/quiz-bank/subjects/{}/estimate
- `POST` /api/platform/quiz-bank/subjects/{}/publish
- `POST` /api/platform/quiz-bank/subjects/{}/start
- `GET` /api/platform/quiz-bank/topics/{}/questions
- `GET/PUT` /api/platform/quiz-settings
- `GET/PUT` /api/platform/quiz-settings/schools/{}
- `GET` /api/school/quiz-report
- `GET/POST` /api/student/doubts
- `POST` /api/student/doubts/ai
- `POST` /api/student/doubts/{}/confirm
- `POST` /api/student/doubts/{}/proof
- `POST` /api/student/doubts/{}/proof/answer
- `POST` /api/student/doubts/{}/reopen
- `POST` /api/student/quiz/attempts
- `GET` /api/student/quiz/progress
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
| 2026-10-27 | Reward points ledger, working-day streak, badges, weekly leaderboard, parent view and weekly report, School Admin report | #434 |
| 2026-10-29 | Questions made automatically at syllabus import (8 per topic, auto-published), subject language setting, schools' own topics, daily topic = completed since the last quiz else revision | #444 |
