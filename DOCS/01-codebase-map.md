# WLYL Platform — Codebase Map

> **Project:** VLearnULearn (WLYL)  
> **Type:** Multi-tenant School Management + EdTech Platform  
> **Framework:** Next.js 16.1.7 (App Router, TypeScript, Tailwind CSS 4)  
> **Database:** PostgreSQL (pg pool)  
> **Hosting:** Vercel (admin branch, deployed directly — do NOT merge to main)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.1.7, React 19.2.3, Tailwind CSS 4 |
| Backend | Next.js API Routes (serverless functions on Vercel) |
| Database | PostgreSQL via `pg` pool |
| Auth | JWT (httpOnly cookies), bcryptjs for hashing |
| Email | Nodemailer (Zoho/Gmail SMTP) |
| File Storage | Cloudinary (signed uploads) |
| PDF Export | jsPDF + html2canvas |
| Deployment | Vercel (`npx vercel --prod` from `admin` branch) |

---

## Full Directory Structure

```
d:\wlyl\prototype/
│
├── app/                                  Next.js App Router root
│   │
│   ├── api/                              All API routes (130+ endpoints)
│   │   ├── init/route.ts                 DB initialization trigger
│   │   ├── schools/
│   │   │   ├── route.ts                  GET list, POST create school
│   │   │   ├── [id]/route.ts             GET, PUT school details
│   │   │   ├── [id]/subscription/route.ts GET/POST subscription tier
│   │   │   └── subject-templates/route.ts GET/POST subject templates
│   │   ├── teachers/
│   │   │   ├── route.ts                  GET list, POST create
│   │   │   ├── [id]/route.ts             GET, PUT teacher
│   │   │   ├── [id]/reset-password/route.ts Admin resets teacher pw
│   │   │   ├── [id]/change-password/route.ts Teacher changes own pw
│   │   │   └── bulk/route.ts             POST bulk import CSV
│   │   ├── students/
│   │   │   ├── route.ts                  GET list, POST create
│   │   │   ├── [id]/route.ts             GET, PUT student
│   │   │   ├── [id]/change-password/route.ts
│   │   │   ├── [id]/exams/route.ts       Student's exam history
│   │   │   ├── [id]/rewards/route.ts     Points, badges, streaks
│   │   │   ├── [id]/submissions/route.ts All task submissions
│   │   │   ├── bulk/route.ts             POST bulk import CSV
│   │   │   └── promote/route.ts          POST year rollover promote
│   │   ├── classes/
│   │   │   ├── route.ts                  GET list, POST create
│   │   │   ├── [id]/route.ts             GET class details
│   │   │   ├── [id]/subjects/route.ts    GET/POST subjects for class
│   │   │   ├── [id]/health/route.ts      Timetable conflict health check
│   │   │   ├── [id]/performance/route.ts Academic performance analytics
│   │   │   └── sync/route.ts             Auto-create classes from students
│   │   ├── class-timetable/
│   │   │   ├── route.ts                  GET class timetable
│   │   │   ├── generate/route.ts         POST generate timetable
│   │   │   ├── swap/route.ts             POST swap two periods
│   │   │   ├── circulate/route.ts        POST publish timetable
│   │   │   ├── validate/route.ts         POST check conflicts
│   │   │   ├── health/route.ts           GET school-wide health
│   │   │   └── sync/route.ts             POST sync to teacher view
│   │   ├── timetable/route.ts            GET teacher's weekly timetable
│   │   ├── timetable-modes/route.ts      GET/PUT class timetable mode
│   │   ├── timetable-versions/
│   │   │   ├── route.ts                  GET list versions
│   │   │   └── [id]/
│   │   │       ├── route.ts              GET version
│   │   │       ├── circulate/route.ts    POST publish version
│   │   │       └── conflicts/route.ts    GET version conflicts
│   │   ├── schedule-templates/route.ts   GET/POST named templates
│   │   ├── attendance/
│   │   │   ├── route.ts                  GET/POST attendance
│   │   │   └── analytics/route.ts        GET monthly/yearly trends
│   │   ├── leave-requests/
│   │   │   ├── route.ts                  GET list, POST request
│   │   │   └── [id]/route.ts             GET, PUT approve/reject
│   │   ├── substitutes/route.ts          GET list, POST assign
│   │   ├── teacher-availability/route.ts GET free slots for substitute
│   │   ├── tasks/
│   │   │   ├── route.ts                  GET list, POST create
│   │   │   ├── [id]/route.ts             GET, PUT, DELETE task
│   │   │   ├── [id]/remind/route.ts      POST send reminders
│   │   │   └── [id]/submissions/
│   │   │       ├── route.ts              GET all, POST submit
│   │   │       └── [sid]/route.ts        GET one, PUT grade
│   │   ├── exams/
│   │   │   ├── route.ts                  GET list, POST create
│   │   │   ├── [id]/route.ts             GET exam details
│   │   │   ├── [id]/subjects/route.ts    GET/POST exam subjects
│   │   │   ├── [id]/marks/route.ts       GET/POST marks entry
│   │   │   ├── [id]/publish/route.ts     POST publish marks
│   │   │   ├── [id]/acknowledge/route.ts POST parent acknowledges
│   │   │   ├── calendar/route.ts         GET exam calendar
│   │   │   └── schedule/route.ts         GET exam schedule by class
│   │   ├── doubts/
│   │   │   ├── route.ts                  GET list, POST ask doubt
│   │   │   ├── [id]/route.ts             GET, PUT doubt status
│   │   │   ├── [id]/messages/route.ts    GET/POST chat messages
│   │   │   ├── [id]/upvote/route.ts      POST upvote doubt
│   │   │   └── peers/route.ts            GET anonymised class FAQs
│   │   ├── syllabus/
│   │   │   ├── route.ts                  GET list, POST create from template
│   │   │   ├── [id]/route.ts             PUT mark topic covered
│   │   │   └── analytics/route.ts        GET coverage % per subject
│   │   ├── curriculum/route.ts           GET CBSE/APSSC syllabi
│   │   ├── fees/
│   │   │   ├── categories/route.ts       GET/POST fee categories
│   │   │   ├── structures/route.ts       GET/POST fee structures by grade
│   │   │   ├── ledger/route.ts           GET student fee ledger
│   │   │   ├── generate/route.ts         POST generate ledger entries
│   │   │   ├── payments/route.ts         GET/POST payment records
│   │   │   ├── waivers/route.ts          POST grant waiver
│   │   │   └── stats/route.ts            GET collection statistics
│   │   ├── announcements/
│   │   │   ├── route.ts                  GET list (filtered by audience), POST create
│   │   │   └── [id]/route.ts             GET, PUT, DELETE
│   │   ├── notifications/route.ts        GET paginated, POST mark read
│   │   ├── newspapers/
│   │   │   ├── today/route.ts            GET today's newspaper
│   │   │   └── [id]/read/route.ts        POST mark as read + award points
│   │   ├── leaderboard/route.ts          GET student rankings
│   │   ├── parent/
│   │   │   ├── child-summary/route.ts    GET full summary for parent
│   │   │   ├── timetable/route.ts        GET child's timetable
│   │   │   ├── attendance/route.ts       GET child's attendance
│   │   │   ├── fees/route.ts             GET child's fee ledger
│   │   │   ├── activity/route.ts         GET child's learning activity
│   │   │   ├── engagement/route.ts       GET engagement metrics
│   │   │   └── lookup/route.ts           GET find child by phone/roll
│   │   ├── academic-years/
│   │   │   ├── route.ts                  GET/POST academic years
│   │   │   └── rollover/route.ts         POST year rollover
│   │   ├── school-calendar/
│   │   │   ├── route.ts                  GET/POST calendar events
│   │   │   └── [id]/route.ts             PUT, DELETE event
│   │   ├── school-schedule/route.ts      GET/PUT schedule settings (periods, breaks)
│   │   ├── admin/
│   │   │   ├── briefing/route.ts         GET daily briefing data
│   │   │   └── overview/route.ts         GET batched dashboard overview
│   │   ├── auth/
│   │   │   ├── login/route.ts            POST school admin / platform admin login
│   │   │   ├── logout/route.ts           POST clear cookie
│   │   │   ├── me/route.ts               GET current session
│   │   │   ├── profile/route.ts          POST update profile
│   │   │   ├── change-password/route.ts  POST change password
│   │   │   ├── forgot-password/route.ts  POST request reset link
│   │   │   ├── reset-password/route.ts   POST reset with token
│   │   │   └── setup-admin/route.ts      POST initial platform admin setup
│   │   ├── teacher-auth/
│   │   │   ├── login/route.ts            POST teacher login (employee_id)
│   │   │   ├── logout/route.ts           POST clear teacher cookie
│   │   │   └── me/route.ts               GET teacher session
│   │   ├── platform/
│   │   │   ├── stats/route.ts            GET platform-wide counts
│   │   │   ├── audit/route.ts            GET audit log
│   │   │   ├── features/route.ts         GET/PUT feature matrix per tier
│   │   │   └── schools/reset-password/route.ts POST reset school admin pw
│   │   ├── upload/sign/route.ts          POST Cloudinary signed upload URL
│   │   ├── export/
│   │   │   ├── marks/route.ts            POST export marks PDF/Excel
│   │   │   └── attendance/route.ts       POST export attendance PDF/Excel
│   │   ├── display-token/route.ts        POST generate kiosk token
│   │   ├── display-data/route.ts         GET kiosk/TV display data
│   │   └── year-review/route.ts          GET year-in-review report
│   │
│   ├── school-admin/                     School Admin Portal
│   │   ├── page.tsx                      Main page (sidebar navigation, lazy-loads all components)
│   │   ├── features-context.tsx          React context for feature flags per subscription tier
│   │   ├── hooks/
│   │   │   └── useOfflineAttendance.ts   Service-worker hook for offline attendance marking
│   │   └── components/
│   │       ├── Overview.tsx              Dashboard: stats cards, health, pending actions
│   │       ├── DailyBriefing.tsx         Morning briefing: uncovered periods, leave alerts
│   │       ├── AttendanceDashboard.tsx   School-wide attendance: view all classes, mark per session
│   │       ├── LeaveRequests.tsx         Teacher leave approval workflow
│   │       ├── EmergencyCover.tsx        Assign substitute teachers for absent staff
│   │       ├── StaffOnboarding.tsx       Add teachers individually or bulk CSV
│   │       ├── StudentOnboarding.tsx     Add students individually or bulk CSV
│   │       ├── ClassManagement.tsx       Create classes, assign teachers, manage subjects
│   │       ├── TimetableManagement.tsx   Generate, view, edit, publish class timetables
│   │       ├── ExamSchedule.tsx          Create exams, assign subjects/teachers, enter marks
│   │       ├── TeachersManagement.tsx    Full teacher directory (search, filter, soft-delete)
│   │       ├── StudentsManagement.tsx    Full student directory (search, filter, promote)
│   │       ├── ClassAnalytics.tsx        Per-class performance metrics
│   │       ├── AcademicAnalytics.tsx     School-wide academic trends
│   │       ├── AnnouncementBoard.tsx     Create announcements with audience targeting
│   │       ├── AcademicCalendar.tsx      School holidays, events, meetings
│   │       ├── StudentLeaderboard.tsx    Points/badges/streaks leaderboard
│   │       ├── NotificationCenter.tsx    Notification history
│   │       ├── ParentEngagement.tsx      Parent portal activity metrics
│   │       ├── FeeManagement.tsx         Fee structures, collection tracking, waivers
│   │       ├── YearRollover.tsx          Promote students, archive, start new academic year
│   │       ├── YearReview.tsx            Year-in-review report with all metrics
│   │       ├── SchoolSettings.tsx        School profile, schedule config, grading scheme
│   │       ├── StudentTeacherAnalysis.tsx Cross-analysis of student vs teacher performance
│   │       ├── CommandBar.tsx            Command palette for quick navigation
│   │       └── ExportCenter.tsx          Export marks and attendance to PDF/Excel
│   │
│   ├── teacher/                          Teacher Portal
│   │   ├── page.tsx                      Main page (localStorage session restore, grouped nav)
│   │   └── components/
│   │       ├── SmartSnapshot.tsx         Dashboard: today's classes, pending tasks, doubts
│   │       ├── MyClasses.tsx             List of assigned classes with student counts
│   │       ├── MyStudents.tsx            All students across assigned classes
│   │       ├── ClassView.tsx             Detailed class view: students, attendance, tasks
│   │       ├── Attendance.tsx            Mark attendance per class per session (offline-capable)
│   │       ├── FullTimetable.tsx         Teacher's full weekly schedule
│   │       ├── Tasks.tsx                 Create and manage tasks
│   │       ├── TasksPage.tsx             All tasks with filters (draft/published)
│   │       ├── TaskReview.tsx            Grade submissions, request resubmission
│   │       ├── ExamMarks.tsx             Enter exam marks for assigned subjects
│   │       ├── DoubtsCenter.tsx          View and answer student doubts (live chat)
│   │       ├── ClassDoubts.tsx           Doubts for specific class, FAQ management
│   │       ├── ClassPerformance.tsx      Class-level analytics (marks, attendance, tasks)
│   │       ├── TeacherSyllabus.tsx       Mark syllabus topics as covered
│   │       ├── TeacherLeave.tsx          Request and track leave approvals
│   │       └── TeacherProfile.tsx        Profile edit and password change
│   │
│   ├── student/                          Student Portal
│   │   ├── page.tsx                      Main page (grouped nav, localStorage session restore)
│   │   └── components/
│   │       ├── StudentDashboard.tsx      Dashboard: tasks, marks, doubts, announcements
│   │       ├── StudentTasks.tsx          View assigned tasks, submit work (text or file)
│   │       ├── StudentDoubts.tsx         Ask questions, live chat with teacher, peer FAQs
│   │       ├── StudentNewspaper.tsx      Read daily curated article, earn points for quiz
│   │       ├── StudentRewards.tsx        Points total, earned badges, streak tracker
│   │       ├── StudentSyllabus.tsx       View chapter/topic coverage progress
│   │       ├── StudentMarks.tsx          Exam marks with pass/fail status
│   │       ├── StudentTimetable.tsx      Weekly class schedule with times and teachers
│   │       └── StudentProfile.tsx        Profile info and password change
│   │
│   ├── parent/
│   │   └── page.tsx                      Parent portal: child summary, attendance, fees, activity
│   │
│   ├── platform-admin/                   Platform Admin Portal
│   │   ├── page.tsx                      School list, create school, stats, subscription management
│   │   ├── audit/page.tsx                Full audit log with filtering
│   │   ├── features/page.tsx             Feature enablement matrix per tier
│   │   └── schools/[id]/page.tsx         Edit school, manage subscription, view school stats
│   │
│   ├── components/                       Shared across portals
│   │   ├── NotificationBell.tsx          Bell icon with unread count dropdown
│   │   └── TestCalendar.tsx              Weekly test/exam calendar widget
│   │
│   ├── login/page.tsx                    School admin and platform admin login
│   ├── change-password/page.tsx          Forced password change on first login
│   ├── forgot-password/page.tsx          Request password reset link by email
│   ├── reset-password/page.tsx           Reset password using emailed token
│   ├── profile-setup/page.tsx            Complete profile after first login
│   ├── setup/page.tsx                    Initial platform admin setup (if no users exist)
│   ├── display/page.tsx                  Kiosk/TV display (timetable, announcements, fullscreen)
│   ├── layout.tsx                        Root layout (html, body, fonts)
│   ├── page.tsx                          Landing page with portal links
│   └── globals.css                       Global Tailwind CSS base styles
│
├── lib/                                  Shared server-side utilities
│   ├── db.ts                             PostgreSQL pool + full schema initialization (50+ tables)
│   ├── auth.ts                           JWT sign/verify, password hashing, cookie helpers, guards
│   ├── email.ts                          Nodemailer transporter + onboarding/reset/subscription emails
│   ├── features.ts                       35+ feature definitions with keys, labels, categories
│   ├── rewards.ts                        Student gamification: points, badges, streaks logic
│   ├── schedule.ts                       Timetable slot constants, break schedule builder
│   ├── curricula.ts                      CBSE and APSSC syllabi data (Grades 1-10)
│   ├── matchTeacher.ts                   Subject-to-teacher matching algorithm (3-level fallback)
│   ├── parseCSV.ts                       RFC 4180-compliant CSV parser for bulk imports
│   ├── notifyTimetable.ts                Insert notifications for timetable changes
│   └── responseCache.ts                  In-memory TTL cache for API responses
│
├── public/
│   └── sw-attendance.js                  Service worker for offline attendance marking
│
├── DOCS/                                 Project documentation (this folder)
│   ├── 01-codebase-map.md               ← This file
│   ├── 02-api-reference.md              All API endpoints
│   └── 03-database-schema.md            All database tables and relationships
│
├── TESTING_GUIDE.md                      Testing guide and test scenarios
├── package.json                          Dependencies and scripts
├── next.config.ts                        Next.js configuration
├── tsconfig.json                         TypeScript configuration
├── postcss.config.mjs                    PostCSS (Tailwind CSS 4)
├── eslint.config.mjs                     ESLint config
├── instrumentation.ts                    Next.js instrumentation hooks
├── use-local-db.bat                      Switch to local PostgreSQL connection
└── use-supabase-db.bat                   Switch to Supabase connection
```

---

## Key Architectural Patterns

### Multi-tenant Architecture
Every table has `school_id` as a foreign key. All API routes filter by `school_id` from the query params. Schools are completely isolated — no data bleeds between schools.

### Feature Flags
Features are controlled by subscription tier (`none / basic / standard / premium`). The `plan_features` table stores `{ feature_key, tier, enabled }`. On school admin load, `FeaturesProvider` fetches the school's tier and enabled features, then makes them available via React context. The sidebar only shows enabled features.

### Authentication Flow
- **Platform Admin:** Email + password → JWT cookie (`wlyl_auth`) → role: `platform_admin`
- **School Admin:** school_code + password → JWT cookie (`wlyl_auth`) → role: `school_admin`  
- **Teacher:** employee_id + password → JWT cookie (`wlyl_teacher_auth`) → role: `teacher`
- **Student/Parent:** No login — select from dropdown in the portal (demo mode)

### Timetable Generation Algorithm
1. Load class subjects + `periods_per_week` per subject
2. Load teacher availability (blocked slots from `teacher_unavailability`)
3. For each academic slot (Mon–Sat, 8 periods): assign subject using round-robin weighted by remaining periods needed
4. Prefer morning slots for core subjects (Math, Science, English)
5. Auto-assign teacher using `matchTeacher()` algorithm
6. Save to `class_timetable`, then sync to `timetable` (teacher view)

### Session Persistence
Teacher and student portals save last selection to `localStorage`:
- Teacher: `wlyl_teacher_session` → `{ schoolId, teacherId }`
- Student: `wlyl_student_session` → `{ schoolId, classId, studentId }`
On next visit, the cascade (school → teachers/classes → teacher/student) restores automatically.

### Batched API for Dashboard
`/api/admin/overview` runs 7 PostgreSQL queries in parallel (`Promise.all`) and returns all dashboard data in one HTTP call — replacing what was 9+ individual fetches.

### Performance: Lazy Component Loading
All 24 school-admin components are loaded with `next/dynamic()` on first navigation to that tab. Only `Overview` and `CommandBar` are eagerly loaded. Each uses inline options (`{ loading: () => <ModuleSkeleton /> }`) — required by Turbopack.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (admin + school admin) |
| `EMAIL_HOST` | SMTP host (smtp.zoho.in or smtp.gmail.com) |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password |
| `EMAIL_FROM` | From address shown in emails |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for file uploads |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

---

## Scripts

```bash
npm run dev       # Start dev server (webpack mode — NOT Turbopack)
npm run build     # Production build (Turbopack)
npm run start     # Start production server
npm run lint      # ESLint check

npx vercel --prod # Deploy directly from current branch to Vercel production
```

> **Note:** `npm run dev` uses `--webpack` flag. Turbopack is only active in production builds on Vercel. This means some issues (like next/dynamic inline options) only surface in the Vercel build, not locally.
