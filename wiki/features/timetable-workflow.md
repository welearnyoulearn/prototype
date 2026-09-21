# Feature: Timetable — full end-to-end workflow

**Platform Admin feature key:** `timetable`
**Portal:** School Admin (build & publish) · Teacher / Student / Parent (view)
**Status:** Built on branch `feature/175-timetable-full-workflow` (NOT on `dev` — see issue #176)
**Last verified:** 2026-09-21 (11 end-to-end tests, `e2e/workflow-timetable.spec.ts`)

## What it does
The school builds its weekly timetable and publishes it to teachers, students and parents.

## The workflow
1. **Schedule** — the admin sets the shape of the school day (periods, start/end, breaks, lunch) under *Schedule Template*; named templates can be saved (`/api/school-schedule`, `/api/schedule-templates`).
2. **Availability** — the admin (or a teacher, for themselves only) blocks periods a teacher cannot teach (`/api/teacher-availability`).
3. **Check load** — *Teacher Load Analysis* shows over-committed teachers before generating (`/api/class-timetable/teacher-load`, `/validate`).
4. **Generate** — one class or all classes, from each class's subjects, periods per week and teachers; nobody is in two classes at once and blocked periods are avoided (`/api/class-timetable/generate`).
5. **Fix** — conflicts and health per class (`/conflicts`, `/health`), reassign a teacher, swap two periods (`/swap`), or edit a slot by hand (`PUT /api/class-timetable`).
6. **Publish** — *Publish* / *Publish All* stamps the class and notifies its teachers (`/api/class-timetable/circulate`).
7. **View** — teachers see their own week, students the class timetable, parents "Today's schedule" and the week.

## Security (added on this branch)
The 18 restored routes had **no sign-in check** and trusted any `school_id`. They now use `lib/timetableAuth.ts`: school-admin login required (a teacher only for their own availability), `school_id` must match the login, and every class/teacher/slot/template/version id must belong to the school. `PUT/PATCH/DELETE /api/class-timetable` are now school-staff only (students and parents could edit slots before).

## Restored from history
Backend routes removed in commit `046992f` ("stripped for production") and the admin screen flows removed in `37ea9fb` / `8dfac0b` (swap, publish, teacher load, schedule templates).
