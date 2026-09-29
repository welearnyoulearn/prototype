# Student Attendance & Academic Calendar

How attendance works across every portal (issue #153, follow-up to #135). Code map, rules, API, data model, and how to test it.

## The flow in one paragraph

Any teacher can mark **any class**, **Morning** or **Afternoon**. The **first submit locks that session**: other teachers see *"Already marked by Ms. Rao at 9:12 AM"* and can view but not change it (they can *Report a mistake* to the admin). The teacher who marked can correct it **the same day**; the **school admin** can change anything at any time. The admin manages an **Academic Calendar**: a **holiday** (or a weekly-off weekday) closes attendance for those dates — the screen says why, and the server refuses too — and those dates drop out of every percentage. Admin, teacher, parent and student all show **the same numbers** because they all use one set of rules.

## The rules (`lib/attendanceRules.ts` — the only place they exist)

| Rule | Value |
|---|---|
| Statuses | Present, Absent, Late — **late counts as attended** |
| Sessions | Morning and Afternoon; **each marked session counts equally** |
| Attendance % | (present + late) ÷ marked sessions, whole number; `null` (shown "—") when nothing is marked |
| Bands | 90%+ green · 75–89% amber · below 75% red |
| Working day | not a holiday and not a weekly-off weekday |
| Holidays / weekly off | cannot be marked; anything recorded on them is ignored in every count |
| Unmarked working day | a gap to chase, **not** an absence; left out of the % |
| Joined mid-year | counted only from the join date |
| Day colour (calendar) | both present = green; any late = amber; one session absent = half; all absent = red |
| Who marks | any teacher, any class; a marked session is locked (`UNIQUE(class_id, date, session)`) |
| Marking window | teachers: today and the 2 days before; admin: any past day; nobody: the future |
| Corrections | the marking teacher, same day only; the school admin, any time; never another teacher |
| "Today" | India time (IST) whatever the server's timezone |

## Who sees what

| Portal | Screen | Source |
|---|---|---|
| Teacher | **Attendance**: **My class** dashboard (class teacher only) · class picker (each class shows Morning/Afternoon state and who marked) → mark sheet (review → submit) or read-only locked view; **History**; **School Calendar** | `/api/attendance/overview`, `/api/attendance?view=sheet`, `POST/PUT /api/attendance` |
| School admin | **Attendance → Overview** dashboard (school → class → student) · **Day register**: *Today* panel (classes marked / not marked with teacher to ask, holiday banner, "Mark today as a holiday", teachers' mistake reports), day/month/year dashboards, exports · **Academic Calendar**: month grid, add/edit/delete, audience, weekly-off days | `/api/attendance/analytics`, `/api/attendance/report`, `/api/school-calendar` |
| Parent | **Attendance** for the selected child only (month calendar, month + year %, six-month trend, upcoming holidays) · **School Calendar** | `/api/parent/attendance` |
| Student | **My Attendance** (same component) · **School Calendar** · dashboard ring | `/api/student/attendance` |

### The dashboards (what each role sees)

| Role | Question it answers | What is on screen |
|---|---|---|
| **School admin** — *Attendance → Overview* | "How is the school doing, and where do I need to act?" | Period switch (last 7 days / month / school year) · KPIs (school %, students below 75%, on track, school days) · today strip (classes marked, who has not, absentee CSV) · "mistake reports waiting" alert · trend chart · students-by-band bar · **class list** (lowest first, tap to open) · **students who need attention** · quick student search |
| **Admin or class teacher** — a class | "Which students in this class need help?" | Class %, need-attention count, absent today, trend chart, weekday pattern ("Mondays are the problem"), band bar, **student list** (filter: all / need attention / absent today, search, sort) — tap a student for their calendar |
| **Class teacher** — *Attendance → My class* | Same as above, for their own class only | Only classes where they are the class teacher; subject teachers do not get this tab (they mark and look back) |
| **Parent** | "How is my child doing?" | Month / year %, days absent, full-days-in-a-row streak, colour calendar (tap a day), trend chart, upcoming holidays, plain-language message |
| **Student** | Same, for themself | Same screen as the parent's |

Reading rules used by every dashboard: **90%+ green, 75–89% amber, below 75% red**. A student needs **4 marked sessions** before a band is shown ("too early to tell" until then), so one absence on day one is not called an emergency. *Need attention* = below 75% (with enough sessions) **or** absent 3+ school days in a row.

Data: `GET /api/attendance/dashboard?scope=school|class|my-classes|find` (`lib/attendanceDashboard.ts`). School view = school admin only; class view = school admin or *that class's* class teacher; everything is school-scoped.

Parent and student use the same `AttendanceCalendar` component; teacher, student and parent share the read-only `SchoolCalendarView`.

## Student profile (school admin)

`GET /api/students/:id/profile[?year=<academic_year_id>]` (`lib/studentProfile.ts`) feeds the *Student 360* panel. Attendance uses the same shared rules as every other screen; fees use the fee screens' balance formula (due − waiver − paid). Admin only, school-scoped. Tested in `e2e/workflow-student-profile.spec.ts` (needs `E2E_DATABASE_URL` to plant marks/fees; skipped otherwise).

## Academic Calendar

Controlled by the platform feature **Academic Calendar** (Platform admin → plan features). It governs the admin's *Academic Calendar* screen **and** the read-only *School Calendar* tab in the teacher, student and parent portals. (Holidays already saved keep closing attendance even if the feature is later switched off.)

Entries: **holiday, exam, event, meeting, other**. A date or a from–to range (max 366 days). *Audience*: **everyone** or **staff only** (admin + teachers) — holidays are always for everyone. Only the school admin creates/edits/deletes; everyone in the school reads (students and parents never see staff-only entries). Adding a holiday over days that **already have attendance** asks the admin to confirm ("N sessions are already marked… they will be ignored while this holiday exists"); deleting it makes those records count again. **Weekly off** defaults to Sunday (change under Academic Calendar → Weekly off).

## Security model

Identity always comes from the signed login, never from the request. Students and parents cannot read class-level attendance or write any attendance. A parent can read only children linked to them; a student only themself. Every route is scoped to the caller's school. Input is validated with Zod (dates, sessions, statuses, roster). The calendar and the briefing/overview/export routes previously had **no** authentication or school check — fixed here.

## API

| Route | Who | Purpose |
|---|---|---|
| `GET /api/attendance/overview?date=` | teacher, admin | every class's Morning/Afternoon state + holiday + can-mark |
| `GET /api/attendance?view=sheet&class_id&date&session` | teacher, admin | roster, lock, holiday, permissions in one call |
| `POST /api/attendance` | teacher, admin | claim + save a session → `201`; `409 ALREADY_MARKED / HOLIDAY / WEEKLY_OFF`; `403 TOO_OLD`; `400 FUTURE / INVALID_RECORDS` |
| `PUT /api/attendance` | marking teacher (same day), admin | correct a session; `403 LOCKED` otherwise |
| `GET /api/attendance?view=student&student_id` · `?view=class-month` | teacher, admin | the shared numbers (identical to parent/student apps) |
| `POST /api/attendance/report` · `GET/PATCH` | teacher · admin | "report a mistake" and resolve |
| `GET /api/attendance/dashboard?scope=…&range=week\|month\|year` | admin (school, class, find) · class teacher (own class) | the dashboards above |
| `GET /api/attendance/analytics` | admin | older rolling / month / year analytics (kept for reports) |
| `GET /api/parent/attendance?student_id&month` | parent (own child) | month calendar + summaries |
| `GET /api/student/attendance?month` | student (self) | same shape |
| `GET/POST /api/school-calendar`, `PATCH/DELETE /api/school-calendar/[id]`, `PUT /api/school-calendar/settings` | read: all roles · write: admin | Academic Calendar |
| `GET /api/export/attendance` (`?class_id&from&to` or `?mode=absentees&date`) | admin | CSV register / day's absentee list |

## Data model (migration in `runIncrementalMigrations()`, schema version 33)

- `attendance_sessions` — one row per class + date + session: who marked, when, edit count. Its unique key **is** the lock. Existing data was backfilled.
- `attendance_issue_reports` — teachers' "report a mistake" notes.
- `school_calendar` — + `audience`, `created_by_name`, `updated_at`, range and audience checks.
- `schools.weekly_off_days` — weekdays (0 = Sunday) that are never school days.
- `attendance` — unchanged rows; a `status IN (present, absent, late)` check added.

## Files

`lib/attendanceRules.ts` (rules, pure) · `lib/attendance.ts` (calendar/roster/lock queries) · `lib/attendanceAuth.ts` (who is calling) · `lib/attendanceMarking.ts` (claim/save/edit) · `lib/attendanceStudentView.ts` (one student's numbers) · `lib/attendanceNotify.ts` (absence emails) · `lib/calendarSchemas.ts` · `app/api/attendance/*`, `app/api/school-calendar/*`, `app/api/parent|student/attendance` · `app/teacher/components/attendance/*` · `app/school-admin/components/{AcademicCalendar,AttendanceTodayPanel}.tsx` · `app/components/{AttendanceCalendar,SchoolCalendarView}.tsx`.

## Testing

- `e2e/attendance-rules.spec.ts` — the rules (percentages, holidays, dates). No server needed.
- `e2e/workflow-attendance.spec.ts` — the whole feature end to end, 34 tests: permissions and isolation, locking incl. a simultaneous-submit race, corrections, reports, calendar security, holidays/weekly off, identical numbers in all four portals, exports, and real-browser checks for teacher, admin, parent and student (phone width too), and the dashboards: access rules, that class rows add up to the school figure, and that per-student numbers equal what the parent and student see (34 tests).

That spec creates a school, teachers, students, parents and a second school, and deletes them at the end. **Run it against a throwaway database, not a shared one.** Recommended setup:

```bash
# 1. a disposable Postgres (real one), UTF-8:  npm i embedded-postgres in a scratch folder, then
#    new EmbeddedPostgres({ databaseDir, user, password, port: 54329, persistent: false,
#                           initdbFlags: ['--encoding=UTF8', '--locale=C'] })  → createDatabase('wlyl_e2e')
# 2. the app against it (PGHOST must be set EMPTY so DATABASE_URL is used):
PGHOST= DATABASE_URL=postgres://postgres:<pw>@localhost:54329/wlyl_e2e SETUP_SECRET=<x> npx next dev --webpack -p 3135
# 3. a platform admin in that fresh database:
curl -X POST localhost:3135/api/auth/setup-admin -H 'Content-Type: application/json' -d '{"email":"e2e@x.test","password":"…","secret":"<x>"}'
# 4. the tests (the plan feature flag is only for a brand-new database):
PLAYWRIGHT_BASE_URL=http://localhost:3135 E2E_ENABLE_PLAN_FEATURES=1 \
E2E_PLATFORM_ADMIN_EMAIL=e2e@x.test E2E_PLATFORM_ADMIN_PASSWORD=… \
npx playwright test e2e/workflow-attendance.spec.ts --project=workflow
```

## Known limits

- **LEAP (AP govt attendance app):** no public API or bulk import was found, so there is no direct integration. The admin's **daily absentee list** (`/api/export/attendance?mode=absentees&date=`) is the manual route — LEAP marks everyone present by default, so only absentees need keying in.
- Holidays are whole-school (no class/grade-specific closures) and whole-day (no half-days).
- Absence emails go through the normal email sender (Resend) and only for today's attendance; WhatsApp alerts are not built.
- Parent and student "Attendance" tabs appear only when the school's plan includes the **attendance** feature, and the calendar screens only when it includes **Academic Calendar** (both platform-admin settings).
