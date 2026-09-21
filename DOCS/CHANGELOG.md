# Changelog

All notable changes to the WLYL School prototype are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/).

<!-- 
## [version] - YYYY-MM-DD

### Added
- **Student 360 profile** (school admin): click a student's name in Class Management or Student Management (or "Full profile" from the attendance dashboard) to open one page with parent contacts, automatic talking points for the parent meeting, attendance, marks (exam-wise, subject-wise, class average, teacher remarks), fees (due/paid/balance, overdue, payments) and learning activity — for any academic year the student was enrolled in. (#158)
- New feature description (#issue-number)

### Fixed
- Bug fix description (#issue-number)

### Changed
- School-admin Attendance page: the separate Month / Year / Insights tabs are replaced by **Overview** (with a period switch) and **Day register**; their old 85%/70% colour thresholds are gone in favour of the shared 90%/75%. (#153)
- Change description (#issue-number)

### Changed
- **Watchline** is now switched per school only (Platform Admin → school → Watchline). It is no longer a row in the plan feature-config matrix, where it controlled nothing. (#195)

### Removed
- **All timetable** taken off `dev` (admin, teacher, student and parent screens; class-management tab; overview stats; substitutes panel; `/api/class-timetable`, `/api/timetable`, `/api/parent/timetable`, `/api/substitutes`; the `timetable` feature key). The complete, secured workflow is on `feature/175-timetable-full-workflow` (draft PR #177). Tables are untouched. (#176)
- Removed feature description (#issue-number)
-->

## [Unreleased]
- **Admin Student Leaderboard** deleted, and the unauthenticated `GET /api/students/{id}/rewards` route with it (#180). **Year-in-Review**, **Parent Engagement** and **Class Analytics** (with the Student Management performance tab) taken out of `dev` and preserved on their own feature branches (#181, #182, #183). The feature keys `leaderboard`, `year-review`, `parent-engagement` and `class-analytics` are gone from the Platform Admin feature config. Tables untouched.
- **Daily Briefing** (screen and `GET /api/admin/briefing`), **Student-Teacher Analysis** and the **Notification Center** page taken out of `dev` and preserved on their own branches (#188, #189, #190): none was linked from any menu. Feature keys `briefing`, `analysis`, `notifications` removed from the Platform Admin config. The header notification bell is unchanged.

### Removed
- **Display / TV kiosk** (`/display`) deleted permanently — its backend routes no longer existed. (#163)
- Taken out of `dev` and preserved on their own feature branches (each unreachable from any menu, calling API routes that do not exist): **Student Learning Hub & Daily Knowledge** (#164), **Rewards Marketplace** for students, parents and admin (#165), **Teacher Lesson Planner** (#166), **Teacher Class Performance** (#167), **Weekly Test** with its student and teacher screens and the weekly cron (#168). Their database tables are left as they are. `DOCS/openapi.json` no longer lists `/api/weekly-test` and `/api/cron/weekly-test`.

### Added
- **Export Data** (#206): "Export & Reports" is rebuilt as one tab with 24 exports grouped as People, Academics, Attendance, Fees, Expenses, Calendar & notices and Backup — student / staff / parent lists, class rolls, classes and subjects, exam schedule and full results, syllabus progress, class history, attendance register / absentees / monthly summary / low-attendance, fee structure / ledger / defaulters / payments / day collection / waivers, expenses and summaries, holidays, announcement history, and a full-school backup workbook. Excel or CSV, filters per export, only the modules the school's plan includes, formula-safe cells, and a "Recent exports" log of who downloaded what. Report cards still print from their own tab.
- **Day register → Absentees** (#208): school admins see every student absent in the Morning (or Afternoon) on one page, class by class — with roll number, parent and phone, a Whole day / one-session tag, the classes that have not marked yet, and print / CSV. New `GET /api/attendance/absentees`.
- **Announcement Board workflow** (#205): festival, holiday and school templates that open as animated greeting cards for teachers, students and parents (Pongal, Diwali, Eid, Christmas, Republic Day and more) with a live preview before sending; target whole grades or single sections with a live "reaches N people" count; drafts and scheduling; pinning; acknowledgement ("I have read this"); optional Telugu / Hindi text; "seen by N of M" with the list of who has not; archive and deleted tabs with a full audit history. Readers get a notice centre (NEW marks, search, filters, pop-up for unseen greetings / urgent / action-needed notices). In-app only.
- **Year Rollover exceptions** (#201): before running the rollover, mark individual students to repeat the year or to be promoted into a different section. The class history records each student's outcome (promoted / repeated / moved / graduated). Bad exceptions are refused before anything changes.
- **Academic Calendar** (school admin): a month calendar with holidays, exams, events and meetings (date or range, "everyone" or "staff only"), weekly-off days, and clear warnings. Teachers, students and parents get a read-only **School Calendar** tab. A **holiday closes attendance** for its dates — the screens say why, the server refuses, and those dates are left out of every percentage. (#153)
- **Attendance session locking**: any teacher can mark any class, Morning or Afternoon; the first submit locks the session and other teachers see "Already marked by <name> at <time>" (no overwriting, including when two submit at the same moment). The marking teacher can correct it the same day; the school admin any time; teachers can "Report a mistake" to the admin. (#153)
- Admin Attendance page: **Today** panel (classes marked / not marked with the teacher to ask, holiday banner, "Mark today as a holiday", mistake reports); daily absentee list export. (#153)
- Parent and student apps: a colour-coded **attendance calendar** with month and year percentages, six-month trend and upcoming holidays (a parent sees only their own children, a student only themself). (#153)
- **Attendance dashboards for every role**: school admin *Overview* (KPIs, trend, class ranking, students needing attention, student search, drill-down school → class → student); class-teacher *My class* dashboard (student list with filters, weekday pattern, absent today); richer parent/student view (streak, chart). One colour/threshold rule everywhere (90% / 75%). (#153)
- `docs/ATTENDANCE.md`: the whole flow, rules, API, data model and how to test it.

### Fixed
- **Announcement Board security** (#203): publishing, editing and deleting notices required no login and no school check — anyone could post to or delete any school's notices. Now only that school's own admin / principal / vice principal can (or a platform admin). The author name comes from the signed-in user, and input is validated (lengths, dates, enums).
- Announcement expiry is judged in India time (a notice expiring today stays up until midnight IST). The board can now edit a notice and remove its expiry, and asks before deleting.
- **Security:** any logged-in user (students and parents included) could read every class's attendance and write attendance for any class as any teacher; a parent could read any child's records; the calendar, admin briefing, overview and export routes had no login or school check; one attendance route was open to SQL injection. Identity now comes only from the signed login and every route is scoped to the caller's school. (#153)
- Admin, teacher, parent and student screens each computed attendance % differently (morning only, late counted as absent, late as half…). They now share one rule, so the same child shows the same numbers everywhere. (#153)
- Admin "today" used UTC, showing yesterday between 00:00 and 05:30 IST. (#153)
- Offline attendance replays that the server refuses (already marked, holiday) are shown with the reason instead of retrying forever. (#153)
- Absence emails now go through the standard sender, after the response, with names HTML-escaped. (#153)

### Changed
- **Year Rollover is now the one central place** to move the whole school to the next academic year (#199). It is blocked until Fee Management → Year-End is closed (popup on screen, `409 FEES_NOT_CLOSED` on the server; schools without Fee Management are not gated). Fee Year-End no longer creates academic years or has its own "Start Year Rollover" action (`POST /api/fees/year-rollover` removed), and a fee year cannot be reopened once rolled over. After a school's first year, the active year can only change through Year Rollover; creating or switching years now needs a school-admin login.
- Year Rollover keeps class roll numbers (it used to fail on the unique roll-number index when, for example, grade 9 roll 1 moved into grade 10 roll 1). The old roll number is stored in the class history; graduated students' roll numbers are cleared; students whose number is already taken in the new class are reported.
- Attendance percentage everywhere = (present + late) ÷ marked sessions; holidays and weekly-off days are excluded; unmarked days are gaps, not absences. (#153)
- Schools now have a weekly-off setting (default Sunday). (#153)

### Changed
- School staff (school admin, principal, vice principal) now sign in with **their own email + password**. The School ID is no longer a login credential; `POST /api/auth/login` takes `{ email, password }`. Every school must be created with an admin email, and older owner accounts without one are backfilled from the school's contact email. (#145)
- School staff sessions are now tracked server-side (`user_sessions`): logout, deactivation, password reset and logging in as someone else in the same browser all end the session immediately on the server, not just in the browser. Sessions end after 20 minutes without activity or 12 hours in total, and the cookie is dropped when the browser closes (was a 7-day cookie). (#145)
- Adding a staff member now emails a one-time set-password link valid for 48 hours instead of a temporary password; "Resend Credentials" became "Resend Invite Link" and voids earlier links. (#145)
- The login page no longer offers "You're still signed in as ... / Continue to Dashboard". It always requires a password and instead shows the **last-used account** (name + email) on that browser; clicking it asks only for the password. Authenticated school-admin pages are sent with `Cache-Control: no-store`. (#145)
- Platform "Reset Password" for a school now resets only the school's owner account (the onboarding admin) instead of every `school_admin` in the school, so other admins added later keep their own passwords. (#145)
- `DOCS/openapi.json` regenerated from the route handlers: all 247 paths and 362 operations, grouped into 9 sections and 43 subcategories, each with parameters, request body, responses, accepted sessions, in-handler checks, server-side feature flag and source file. (#131)
- `/api-docs` now uses Scalar instead of Swagger UI: a sidebar of 9 sections and 43 subcategories, coloured badges showing who can call each route, Inter and JetBrains Mono fonts, and a Test Request panel. Scalar telemetry, Ask AI and MCP export are turned off. (#131)
- `GET /api/openapi` and `/api-docs` stay public (no sign-in), by product decision. The wildcard `Access-Control-Allow-Origin: *` header was removed, so other sites can't read the spec from a browser. (#131)

### Fixed
- `GET /api/openapi` read `docs/openapi.json` at runtime while the file lives in `DOCS/`, so it failed on Vercel's case-sensitive filesystem. The spec is now imported at build time. (#131)
- `/api-docs` rendered a blank page: Swagger's StandaloneLayout was used without the DownloadUrl plugin and threw before the spec was fetched. Replaced by the Scalar viewer above. (#131)

### Added
- Daily Supabase → Cloudflare R2 backup: Vercel Cron (`02:30 UTC`) → `POST /api/cron/backup` streams every public table row-by-row through gzip into an R2 multipart upload (`db/supabase-<ts>.jsonl.gz` + `db/latest.json`) so memory stays flat regardless of DB size; retains the newest 14 backups (paginated listing + batched deletes). (#NN)
- Non-destructive restore: `POST /api/restore` re-inserts only rows missing from the live DB (matched by primary key) via `INSERT ... ON CONFLICT DO NOTHING`; supports `dryRun`; never updates/deletes/truncates. Tables without a primary key are skipped and reported. (#NN)
