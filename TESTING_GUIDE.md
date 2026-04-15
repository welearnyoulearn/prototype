# Complete Testing Guide — WLYL School Management Platform

> **How to use:** Go module by module. For each flow, follow the steps exactly. Note the Expected Result — if what you see differs, it's a bug. "Hidden" means a condition-triggered behaviour that's easy to miss.

---

## ROLES & LOGIN CREDENTIALS

| Role | Login URL | Credentials |
|------|-----------|-------------|
| Platform Admin | `/login` | Email + password |
| School Admin | `/login` | School code + password |
| Teacher | `/teacher` | School code + Employee ID + password |
| Student | `/student` | School selector → class → student (no password) |
| Parent | `/parent` | Roll number + parent phone number |

**Default teacher password** = their Employee ID (first login forces change)

---

## MODULE 1 — PLATFORM ADMIN

### 1.1 Login & Dashboard
- [ ] Go to `/login` → login as platform admin
- [ ] Dashboard shows total schools count, active schools, subscriptions breakdown
- [ ] Sidebar has: Schools, Feature Plans, Audit Log

### 1.2 School Management
- [ ] Create a new school — name, type, city, country, school code (must be unique)
- [ ] Edit school details (name, phone, email, address, logo)
- [ ] View individual school → `/platform-admin/schools/[id]`
- [ ] Change school subscription tier: none → basic → standard → premium
- [ ] Reset school admin password from platform admin
- [ ] Deactivate a school — school admin should be blocked from login
- [ ] Search schools by name or code

**Hidden behaviours:**
- School code is used as login identifier for school admins — changing it breaks existing logins
- Tier change takes effect immediately on school admin's next page load (no restart needed)
- Schools with `none` tier get zero features

### 1.3 Feature Plan Configuration (`/platform-admin/features`)
- [ ] Open Feature Plans page
- [ ] All 38 features listed under 6 categories (Core, Academic, Analytics, Finance, Communication, Administration)
- [ ] Uncheck a feature for Basic only — Standard and Premium should still have it
- [ ] Check a feature for Premium only (Basic + Standard unchecked) — only premium schools see it
- [ ] Check a feature for Standard only — basic schools should NOT see it, standard + premium should
- [ ] Save → confirm "✓ Saved" message appears
- [ ] Login as a school admin of each tier and verify sidebar only shows enabled features
- [ ] Add a brand-new feature key that doesn't exist in DB yet — should default to enabled for all tiers

**Hidden behaviours:**
- Features not in `plan_features` table at all → default enabled for every tier
- Changes reflect immediately on school admin's next page load (no cache TTL)
- Badges show automatically: "Premium only", "Standard+", "Disabled"

### 1.4 Audit Log (`/platform-admin/audit`)
- [ ] Audit log loads with recent actions
- [ ] Actions recorded: school creation, tier change, password reset, feature config save
- [ ] Filter by action type

---

## MODULE 2 — SCHOOL ADMIN

### 2.1 Login & First Login Flow
- [ ] Login with school code + password
- [ ] First login: forced password change screen appears
- [ ] After password change → redirected to `/profile-setup`
- [ ] Profile setup: full name, phone, designation, bio → save
- [ ] After profile complete → lands on school admin dashboard

### 2.2 Overview Dashboard
- [ ] Shows today's stats: present count, absent count, leave requests pending
- [ ] Active classes count, teachers count, students count
- [ ] Quick links to each module
- [ ] Daily briefing widget (if feature enabled)
- [ ] School health score (if feature enabled)
- [ ] Fee collection summary (if fee-management feature enabled)

**Hidden behaviours:**
- Overview only shows widgets for features enabled in the school's plan
- If no timetable generated for any class → timetable widget shows warning
- If any teacher on leave today → emergency cover widget activates

### 2.3 Command Bar
- [ ] Press `Ctrl+K` (or `Cmd+K`) to open command bar
- [ ] Type a feature name → navigate directly
- [ ] Type a student name → jump to student record
- [ ] Type a teacher name → jump to teacher profile

---

## MODULE 3 — CLASS MANAGEMENT

### 3.1 Create Class
- [ ] Go to Class Management → Create new class
- [ ] Select grade (1–12), section (A/B/C...), assign class teacher
- [ ] On creation: subjects auto-assigned from CBSE curriculum for that grade
- [ ] Timetable auto-generated immediately after creation
- [ ] Card shows "Timetable ready" (green) or "No timetable" (amber)

**Hidden behaviours:**
- Curriculum type is looked up from `curriculum_assignments` table; defaults to CBSE if not configured
- Auto-generates subjects using `getSubjectsForGrade(curriculumType, grade)`
- Auto-matches teachers to subjects using `matchTeacher(subjectName, staff)`
- `subjects_assigned` count is returned in the class creation response

### 3.2 Edit Class
- [ ] Edit class teacher → save
- [ ] Edit section name → save
- [ ] Delete class → confirm prompt → class removed along with its timetable and subject assignments

### 3.3 Class Detail View (`/school-admin/class/[id]`)
- [ ] View list of students in class
- [ ] View class subjects and assigned teachers
- [ ] View class timetable

---

## MODULE 4 — TIMETABLE MANAGEMENT

### 4.1 Class Timetables Tab
**Sidebar health indicators — test each state:**
- [ ] Red dot + "X teacher conflicts" — class has same teacher in 2 slots at same time
- [ ] Amber dot + "X slots no teacher" — periods exist but no teacher assigned
- [ ] Orange dot + "X subjects unassigned" — subjects with no teacher match
- [ ] Green dot + "Ready to circulate" — all good, no conflicts
- [ ] Gray dot — no timetable generated yet

**View & Navigate:**
- [ ] Click any class in sidebar → timetable grid loads
- [ ] Today's column highlighted in blue
- [ ] Break rows (Morning Break, Lunch Break, Afternoon Break) shown in amber

### 4.2 Regenerate Timetable
- [ ] Click "Regenerate" button
- [ ] Confirm timetable is replaced with fresh auto-generated version
- [ ] Health indicators update after regeneration
- [ ] "Regenerate" is disabled when Edit Mode is ON

### 4.3 Edit Mode — 2-Click Swap
- [ ] Click "✏ Edit Timetable" button → Edit Mode ON banner appears
- [ ] Click any period → it turns yellow with "● Selected" label
- [ ] All compatible swap targets show green ring + "↔ Click to swap"
- [ ] Blocked targets (teacher busy in another class at that slot) show red tint
- [ ] Click a green target → swap happens instantly (optimistic UI)
- [ ] Click selected slot again → deselects (back to normal)
- [ ] Press `Esc` → deselects current selection
- [ ] After swap, health indicators in sidebar update

**Hidden behaviours:**
- busyMap is pre-loaded when you open a class (no server call on click)
- Swap is shown immediately; API saves in background
- On API failure: swap reverts visually + error message shown
- Conflict check is a pure `Set.has()` lookup — instant, zero latency

### 4.4 Assign / Change Teacher (click period in any mode)
- [ ] Click any period cell → Assign Teacher modal opens
- [ ] Shows: day, period label, subject, current teacher
- [ ] Teacher list grouped: "Available · Subject" (matched), "Available · Other", "Busy at this slot"
- [ ] Busy teachers are greyed out with their class shown (e.g. "Gr 5-A")
- [ ] Select a teacher → click Assign/Change → modal closes
- [ ] Timetable re-fetches immediately → conflict flags updated
- [ ] Checkbox "Apply to all [subject] periods" — assigns same teacher to every slot of that subject
- [ ] Select "— No teacher —" → removes teacher from slot

**Hidden behaviours:**
- After teacher assignment, full timetable is re-fetched (not optimistic) to get fresh `has_conflict` flags
- `loadHealth()` called → sidebar badges update immediately
- `refreshAllSlots()` called → busyMap cache updated for future swaps

### 4.5 Save & Circulate
- [ ] Click "Save" button → exits edit mode, no notification sent
- [ ] Click "Circulate" button → blocked if conflicts exist (button disabled with tooltip)
- [ ] Circulate → sends notification to all assigned teachers + all students of that class
- [ ] Success: "Timetable circulated — X staff and all students notified"
- [ ] After circulate: health badges in sidebar refresh

### 4.6 Schedule Template Tab (⚙️)
- [ ] Open Schedule Template tab
- [ ] Working Days: toggle Mon–Sun checkboxes; persists in localStorage
- [ ] Start Time / End Time fields
- [ ] Periods per Day with `−` / `+` buttons (range: 1–12)
- [ ] Period duration auto-calculated and displayed: "≈ X min each"
- [ ] Break settings: Morning Break, Lunch Break, Afternoon Break (after period N, duration M min)
- [ ] Live Preview grid updates as you change any setting
- [ ] "+" button at bottom of preview grid → adds a period (same as clicking + in Periods per Day)
- [ ] "+" button at rightmost column header → adds next available working day
- [ ] Hover a day column header → "×" button appears to remove that day
- [ ] Save Template → persists to DB via `/api/school-schedule`
- [ ] After save: go to Class Timetables → Regenerate a class → new schedule structure applies

**Hidden behaviours:**
- Working days are stored per-school in `localStorage` with key `wdays_${schoolId}` — they don't go to DB
- Period duration formula: `(end - start - all_breaks) / periods_per_day`, minimum 30 min
- Template save does NOT auto-regenerate existing class timetables — must do manually per class
- Break "after period N" is clamped to current `periods_per_day` to prevent invalid state

### 4.7 Teacher Schedules Tab
- [ ] Search teachers by name or subject
- [ ] Click a teacher → see their full weekly schedule grid
- [ ] Shows which class/subject/room for each period
- [ ] "Set Availability" toggle → click any period to mark teacher as unavailable
- [ ] Unavailable slots shown with different styling
- [ ] Toggle removes unavailability

---

## MODULE 5 — TEACHERS MANAGEMENT

### 5.1 View & Create
- [ ] List all teaching staff with search
- [ ] Filter by staff type (teaching / non-teaching)
- [ ] Create teacher: name, email, employee ID, subject, department, phone, staff type
- [ ] Default password = employee ID; teacher must change on first login
- [ ] Edit teacher details
- [ ] Deactivate teacher → they cannot login

### 5.2 Password Management
- [ ] School admin: Reset teacher password (sets back to employee ID)
- [ ] Teacher changes their own password after login

### 5.3 Subject & Grades
- [ ] `teaches_grades` field — which grades a teacher covers
- [ ] `subject` field — used for teacher-matching in timetable generation

---

## MODULE 6 — STUDENTS MANAGEMENT

### 6.1 View & Create
- [ ] List students with grade/section filter
- [ ] Create individual student: name, grade, section, roll number, parent name, parent phone
- [ ] Bulk create students via CSV upload
- [ ] Edit student details
- [ ] Deactivate student

### 6.2 Student Promotion (`/api/students/promote`)
- [ ] Select academic year
- [ ] Promote all students in Grade X to Grade X+1
- [ ] Grade 12 → graduated (removed from active)
- [ ] History saved in `student_class_history`

**Hidden behaviour:**
- Roll number format convention: `{grade}{section}{number}` e.g. "5A01"
- Promotion does NOT auto-update section assignments — admin must manually update

---

## MODULE 7 — ATTENDANCE

### 7.1 Mark Attendance
- [ ] Select class → date → mark each student: Present / Absent / Late
- [ ] Session: Morning / Afternoon (separate records)
- [ ] Save attendance
- [ ] Already-marked attendance shown with correct status on revisit

### 7.2 Offline Attendance (Hidden Feature)
- [ ] Turn off internet (or simulate with DevTools → Network → Offline)
- [ ] Try marking attendance → should still work (service worker queues it)
- [ ] A queued badge/count should appear indicating offline queue
- [ ] Turn internet back on → service worker auto-syncs queued records
- [ ] Verify attendance records appear in DB after sync

**Hidden behaviours:**
- Service worker at `/sw-attendance.js` intercepts `POST /api/attendance` calls
- Queued in IndexedDB (`wlyl_offline` database, `queue` object store)
- Returns HTTP 202 when queued offline
- Background Sync event `attendance-sync` triggers replay when online
- Fallback: sync attempted on every GET request if Background Sync API not available

### 7.3 Attendance Analytics
- [ ] View attendance % by class, by student, by date range
- [ ] Students with chronic absence highlighted
- [ ] Export attendance data (CSV)

---

## MODULE 8 — LEAVE REQUESTS

### 8.1 Teacher Leave Flow
- [ ] Teacher submits leave request: type, start date, end date, reason
- [ ] School admin sees pending leave in Leave Requests section
- [ ] Admin approves or rejects with comment
- [ ] Approved leave → triggers emergency cover assignment

### 8.2 Emergency Cover (Hidden Feature)
- [ ] When a teacher is on approved leave → their classes for that day appear in Emergency Cover
- [ ] Admin assigns a substitute teacher for each affected period
- [ ] Substitute teacher sees the assignment in their teacher portal
- [ ] `substitute_assignments` table records: original teacher, substitute, class, date, period

---

## MODULE 9 — EXAM SCHEDULE & MARKS

### 9.1 Create Exam
- [ ] Create exam: name, type (unit test / midterm / final), date
- [ ] Add subjects to exam with max marks and assigned teacher per subject
- [ ] Exam status: draft → published

### 9.2 Enter Marks
- [ ] Teacher enters marks per student per subject
- [ ] Mark absent students separately (is_absent flag)
- [ ] Submit marks → status changes to "submitted"
- [ ] Admin publishes results → students and parents can see

### 9.3 Parent Acknowledgement
- [ ] Parent views child's exam marks in parent portal
- [ ] Parent taps "Acknowledge" → `parent_mark_acks` record created
- [ ] Teacher/admin can see which parents have acknowledged

### 9.4 Report Cards (Hidden)
- [ ] `report_card_config` controls: show_attendance, show_rank, grading_scheme
- [ ] Class teacher can add remarks and conduct grade per student
- [ ] Export marks as CSV

**Hidden behaviours:**
- `passing_pct` field on exam — used to flag failing students
- Marks entering is per subject per teacher — only the assigned teacher can enter marks for their subject

---

## MODULE 10 — TASKS & SUBMISSIONS

### 10.1 Create Task (Teacher)
- [ ] Create task: title, subject, type (homework/assignment/project/quiz), instructions, due date, max marks
- [ ] Assign to: all students / specific students
- [ ] Task appears in student portal on due date

### 10.2 Submit Task (Student)
- [ ] Student sees task in their Tasks section
- [ ] Submit: text answer or file upload (gets signed URL)
- [ ] After submission: status = "submitted"

### 10.3 Review & Grade (Teacher)
- [ ] Teacher reviews submissions one by one
- [ ] Enter score + feedback
- [ ] Request resubmission (`resubmission_requested = true`)
- [ ] Student sees resubmission request → can submit again

### 10.4 Send Reminder (Teacher)
- [ ] Click "Remind" on a task → sends notification to students who haven't submitted yet
- [ ] `task_reminders` table records who sent reminder and when

---

## MODULE 11 — DOUBTS / Q&A

### 11.1 Student Raises Doubt
- [ ] Student goes to Doubts → Create doubt: subject, question text, optional task link
- [ ] Doubt gets an AI-generated answer immediately (`ai_answer` field)
- [ ] Doubt is visible to class teacher

### 11.2 Teacher Responds
- [ ] Teacher sees all doubts for their class
- [ ] Opens doubt → sees chat thread
- [ ] Sends message → student notified
- [ ] Teacher marks answer as final → `is_final_answer = true`
- [ ] Teacher can close doubt or mark it as FAQ

### 11.3 Upvotes & Peers
- [ ] Students can upvote doubts
- [ ] `class_faq` doubts visible to all students in the class
- [ ] `/api/doubts/peers` shows doubts from other students (filtered)

**Hidden behaviour:**
- `message_count` and `last_message_at` tracked for each doubt
- Closed doubts (`closed_by_teacher`) are read-only for students
- Doubts linked to a task via `task_id` show task context

---

## MODULE 12 — SYLLABUS MANAGEMENT

### 12.1 Track Syllabus
- [ ] Teacher adds syllabus topics: subject, chapter, topic
- [ ] Mark topic as covered with date
- [ ] Admin sees coverage % per subject per class

### 12.2 Syllabus Predictor (Premium Feature)
- [ ] Analytics based on coverage rate → predicts if syllabus will complete before exam
- [ ] Flags at-risk chapters

### 12.3 Syllabus Analytics
- [ ] `/api/syllabus/analytics` — coverage breakdown by subject, chapter, teacher
- [ ] Viewable in AcademicAnalytics component

---

## MODULE 13 — FEE MANAGEMENT (Finance Feature)

### 13.1 Setup
- [ ] Create fee categories: name, frequency (monthly/quarterly/annual/one_time)
- [ ] Create fee structures: category + grade + amount + due day + academic year

### 13.2 Generate Ledger
- [ ] Run "Generate Fees" for an academic year + grade(s)
- [ ] Creates `student_fee_ledger` rows for each student × each fee category
- [ ] Status: pending

### 13.3 Record Payment
- [ ] Select student → view their ledger
- [ ] Record payment: amount, mode (cash/cheque/DD/online/UPI), receipt number, date
- [ ] Ledger status updates: pending → partial → paid

### 13.4 Waivers
- [ ] Apply waiver: percentage / fixed amount / full
- [ ] Reason required
- [ ] Waived amount deducted from outstanding

### 13.5 Fee Stats
- [ ] School-level: total collected, total outstanding, overdue count
- [ ] Grade-wise breakdown

### 13.6 Parent Fee View
- [ ] Parent sees child's fee ledger in parent portal
- [ ] Outstanding amount, due date, payment history

**Hidden behaviours:**
- `pending_verification` status exists for online payments awaiting confirmation
- Multiple payments per ledger entry are summed to calculate `amount_paid`
- Fee generation is idempotent — running again won't create duplicates if ledger exists

---

## MODULE 14 — ANNOUNCEMENTS

### 14.1 Create Announcement
- [ ] Title, content, type (general/urgent/academic/administrative)
- [ ] Target audience: all / teachers / students / parents
- [ ] Priority: normal / high / critical
- [ ] Optional expiry date (`expires_at`)

### 14.2 View & Expiry
- [ ] Announcements appear in notification center for target audience
- [ ] Expired announcements (past `expires_at`) hidden automatically

**Hidden behaviour:**
- Announcements with `priority: critical` should show differently (highlighted/pinned)
- Audience targeting is server-side — parents only see announcements targeted to them

---

## MODULE 15 — NOTIFICATIONS

### 15.1 Types of Notifications Sent Automatically
| Trigger | Recipients |
|---------|-----------|
| Timetable circulated | All assigned teachers + all students in class |
| Task assigned | All students (or specific) |
| Task reminder | Non-submitted students |
| Exam marks published | Students + parents |
| Leave approved/rejected | The teacher |

### 15.2 Notification Center
- [ ] Bell icon shows unread count
- [ ] Click → list of notifications with timestamp
- [ ] Click notification → marks as read
- [ ] Unread notifications: `is_read = false`

---

## MODULE 16 — PARENT ENGAGEMENT

### 16.1 Parent Portal Login
- [ ] Go to `/parent`
- [ ] Enter child's roll number + parent phone number
- [ ] Successful lookup → shows child's dashboard

### 16.2 What Parent Can See
- [ ] Child's timetable (read-only)
- [ ] Attendance summary (present/absent/late count by month)
- [ ] Exam marks + ability to acknowledge
- [ ] Fee ledger + outstanding amount
- [ ] Activity log (portal sessions, tasks submitted, doubts raised)

### 16.3 Engagement Analytics (School Admin)
- [ ] Admin sees parent engagement rate per class
- [ ] Which parents have logged in, which haven't
- [ ] Acknowledgement rate for exam results

---

## MODULE 17 — ACADEMIC CALENDAR

### 17.1 Events
- [ ] Create calendar events: title, date, type, color
- [ ] Events visible on calendar view
- [ ] Event types: holiday, exam, event, deadline

### 17.2 View
- [ ] Monthly calendar grid
- [ ] Click a date → see events for that day
- [ ] Export calendar

---

## MODULE 18 — STUDENT LEADERBOARD

### 18.1 Points System
- [ ] Students earn points for: reading newspaper, completing tasks, submitting on time, attendance streaks
- [ ] Points stored in `student_points` table with `action_type`

### 18.2 Leaderboard
- [ ] Ranked by total points (school-wide or class-wise)
- [ ] Badges awarded at milestones
- [ ] Current streak and longest streak tracked

### 18.3 Hidden Gamification
- `student_streaks` — current_streak, longest_streak, last_activity_date
- `student_badges` — badge_type earned at specific milestones
- `weekly_tests` — AI-generated quizzes; student answers scored automatically

---

## MODULE 19 — DAILY NEWSPAPER (Student Feature)

- [ ] Daily newspaper appears in student portal
- [ ] Has: title, subtitle, content, fun fact, quiz question, topic
- [ ] Student reads → marks as read → earns points
- [ ] `student_newspaper_reads` tracks who read today's paper
- [ ] Points awarded only once per newspaper per student

**Hidden:** Admin creates newspaper content; if no newspaper for today, student sees "nothing yet" state

---

## MODULE 20 — EXPORT CENTER

### 20.1 Exports Available
- [ ] Attendance export: by class, date range → CSV
- [ ] Marks export: by exam, class → CSV
- [ ] Student list export

### 20.2 Download Flow
- [ ] Select parameters → click Export
- [ ] File downloads automatically
- [ ] Verify CSV has correct headers and data

---

## MODULE 21 — YEAR ROLLOVER

### 21.1 Flow
- [ ] Select target academic year
- [ ] Preview: which students will be promoted to which grade
- [ ] Grade 12 → graduates out
- [ ] Confirm → all students promoted
- [ ] New academic year set as current

### 21.2 Hidden Behaviours
- History preserved in `student_class_history` before promotion
- Fees for old year remain; new year fees must be generated separately
- Timetables remain unchanged — must be regenerated for new year

---

## MODULE 22 — YEAR-IN-REVIEW REPORT

- [ ] School admin views end-of-year summary
- [ ] Shows: attendance rate, exam averages, syllabus completion %, top students, fee collection rate
- [ ] Printable/exportable

---

## MODULE 23 — SCHOOL SETTINGS

- [ ] Update school name, logo, phone, email, address
- [ ] Configure curriculum type per grade (CBSE / ICSE / State Board)
- [ ] Manage academic years (create, set current)
- [ ] Configure report card display settings (show attendance, show rank, grading scheme)

---

## MODULE 24 — TEACHER PORTAL

### 24.1 Login & Navigation
- [ ] Login: school code + employee ID + password
- [ ] First login: default password = employee ID → forced to change
- [ ] Navigation: My Classes, Timetable, Tasks, Doubts, Leave, Syllabus, Profile

### 24.2 My Classes
- [ ] See all assigned classes (from timetable assignments)
- [ ] Click a class → class detail with students, attendance, tasks

### 24.3 Full Timetable
- [ ] Weekly grid showing all periods for this teacher
- [ ] Today highlighted
- [ ] Each cell shows class/subject/room

### 24.4 Smart Snapshot (Hidden)
- [ ] Quick overview widget on teacher dashboard
- [ ] Shows: today's classes, pending task reviews, unread doubts, leave balance
- [ ] Updates in real time

### 24.5 Exam Marks Entry
- [ ] Teacher sees exams where they are assigned a subject
- [ ] Enter marks per student → submit
- [ ] Cannot enter marks for subjects not assigned to them

### 24.6 Coming Soon (Marked in Code)
- Teacher performance analytics — `comingSoon: true` in nav — shows disabled state

---

## MODULE 25 — STUDENT PORTAL

### 25.1 Session Persistence (Hidden)
- [ ] Select school → class → student → portal opens
- [ ] Refresh page → session restored from localStorage (no re-login)
- [ ] `student_portal_sessions` tracks login/logout times

### 25.2 Student Dashboard
- [ ] Today's timetable (what periods now/next)
- [ ] Pending tasks due soon
- [ ] Unread doubts / teacher replies
- [ ] Points and streak widget

### 25.3 Daily Newspaper
- [ ] Shows today's newspaper
- [ ] Read it → earn points
- [ ] Quiz question at bottom → answer → score saved

### 25.4 Coming Soon
- Student performance analytics — `comingSoon: true` in nav

---

## MODULE 26 — DISPLAY / KIOSK MODE (`/display`)

- [ ] Generate a display token from school settings
- [ ] Navigate to `/display?token=XXX` (TV/monitor)
- [ ] Shows: today's schedule, announcements, weather, notices
- [ ] Auto-refreshes periodically
- [ ] Token stored in `display_tokens` table with `last_used_at`

---

## CROSS-CUTTING TESTS

### Authentication Edge Cases
- [ ] Expired session → redirected to login
- [ ] Wrong school code → error message
- [ ] Correct code, wrong password → error (not a 500)
- [ ] Password reset flow: request → email link → `/reset-password?token=XXX` → new password → login
- [ ] Token expiry: password reset tokens expire in 72 hours
- [ ] Multiple failed logins — check if any rate limiting

### Feature Flag Edge Cases
- [ ] School on "none" tier → sidebar should be completely empty (no features)
- [ ] Downgrade school from premium to basic → premium-only features disappear immediately
- [ ] Feature disabled mid-session → next page load should hide it (no session caching of features)

### Multi-School Isolation
- [ ] Login as admin of School A — cannot see School B's data
- [ ] Teacher in School A — cannot access School B's classes
- [ ] All API routes filter by `school_id` from session token

### Concurrent Editing
- [ ] Two admins open same class timetable → both make a swap → verify final state is consistent
- [ ] Teacher assigns marks → another teacher tries to submit same subject → verify conflict handling

### Data Validation
- [ ] Create student with duplicate roll number in same class → should fail with error
- [ ] Create class with same grade+section → should fail
- [ ] Create teacher with duplicate employee ID → should fail
- [ ] Fee payment amount > outstanding → check if allowed or blocked
- [ ] Exam max marks = 0 → check validation

---

## QUICK BUG HUNT CHECKLIST

| Area | What to Check |
|------|---------------|
| Timetable | Swap two periods with same subject — do teachers update correctly? |
| Timetable | Open class, swap a period, immediately re-open class — does new state persist? |
| Health badges | Assign a teacher to resolve conflict → does badge turn green without page refresh? |
| Fee | Generate fees twice for same year+grade — are duplicates created? |
| Attendance | Mark attendance offline → go online → does it sync and show in dashboard? |
| Parent | Acknowledge exam → login again → is acknowledgement still shown? |
| Circulate | Circulate timetable with 0 conflicts → check teacher/student notifications appear |
| Leaderboard | Read newspaper → check points increment in leaderboard immediately |
| Doubts | Student raises doubt → teacher replies → does student see reply without refresh? |
| Year Rollover | Roll over year → check old year data is not lost |
| Template | Change periods from 8 to 6, save → regenerate class → verify only 6 periods show |
| Export | Export attendance with 0 students in class — verify no crash |

---

*Total: 5 roles · 26 modules · 113+ API endpoints · 38 feature flags · 60+ DB tables*
