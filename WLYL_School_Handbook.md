# WLYL Platform — School Handbook
### Complete Feature Guide for Schools
**Version: wlylV1 · June 2026**

---

## Table of Contents

1. [Introduction](#introduction)
2. [How to Login](#how-to-login)
3. [School Admin Portal](#school-admin-portal)
   - Overview Dashboard
   - Daily Briefing
   - Teacher Management
   - Student Management
   - Class Management
   - Timetable Management
   - Attendance
   - Leave Requests & Emergency Cover
   - Exam Management
   - Fee Management *(detailed)*
   - Announcements
   - Academic Calendar
   - Student Leaderboard
   - Parent Engagement
   - Year Rollover
   - Export Center
   - School Settings
4. [Teacher Portal](#teacher-portal)
5. [Student Portal](#student-portal)
6. [Parent Portal](#parent-portal)
7. [Quick Reference — Login Credentials](#quick-reference)

---

## 1. Introduction

**WLYL (We Learn, You Lead)** is a complete school management platform that connects school administrators, teachers, students, and parents in one place.

**What it replaces:**
- Manual attendance registers
- Paper-based fee receipts
- WhatsApp group announcements
- Excel marksheets
- Physical notice boards

**Four portals, one platform:**
| Portal | Who Uses It | URL |
|---|---|---|
| School Admin | Principal / Accounts / Admin staff | `/school-admin` |
| Teacher | All teaching staff | `/teacher` |
| Student | All enrolled students | `/student` |
| Parent | Parents / Guardians | `/parent` |

---

## 2. How to Login

### School Admin Login
1. Go to your school's admin URL
2. Enter your **School Code** (format: `wlyl-schl-schoolname-ID`)
3. Enter your **Password**
4. Click **Sign In**

> First-time login: You will receive a temporary password by email. You will be asked to set a new password immediately.

### Teacher Login
1. Go to the Teacher Portal
2. Enter your **School Code**
3. Enter your **Employee ID**
4. Enter your **Password** (first time: your employee ID is your password)
5. Click **Sign In** — you will be asked to change your password on first login

### Student Login
1. Go to the Student Portal
2. Select your **School → Grade → Section → Name**
3. Enter your **Password** (first time: provided by your school)

### Parent Login
1. Go to the Parent Portal
2. Enter your **Email address**
3. Enter your **Password** (provided by the school)
4. Click **Sign In**

> Forgot password? Use the "Forgot Password" link on any login page — a reset link will be sent to your registered email.

---

## 3. School Admin Portal

After logging in, you see the **main dashboard** with a sidebar on the left. Click any menu item to switch sections.

---

### 3.1 Overview Dashboard

**What it shows:** A real-time snapshot of your school's health.

| Card | What it means |
|---|---|
| Total Teachers | Active staff count |
| Total Students | Enrolled students |
| Classes | Active classes |
| Today's Attendance % | Morning session attendance |
| Timetable Health | % of periods with assigned teachers |
| Upcoming Exams | Exams in next 7 days |
| Fee Collection | Outstanding vs collected |

**How to use:**
1. Log in → you land on Overview automatically
2. Numbers update in real time — refresh the page to get latest data
3. Red numbers = needs attention; green = healthy

---

### 3.2 Daily Briefing

**What it shows:** A prioritized morning checklist of urgent items.

**Items shown:**
- **Attendance alert** — if morning attendance is below 70%
- **Pending leave requests** — teachers waiting for approval
- **Uncovered periods** — approved leaves with no substitute assigned
- **Today's exams** — exams scheduled for today
- **Overdue tasks** — tasks past their due date
- **Chronic absentees** — students absent 3+ times in last 30 days
- **Low syllabus coverage** — classes below 50% coverage
- **Active announcements** — current notices

**How to use:**
1. Check Daily Briefing every morning before 8 AM
2. Items are color-coded: 🔴 Critical → 🟡 Warning → 🔵 Info
3. Click any item to jump directly to that section

---

### 3.3 Teacher Management

**What you can do:** Add, view, edit, and remove teaching staff.

#### Add a Single Teacher
1. Go to **People → Teachers**
2. Click **+ Add Teacher**
3. Fill in: Name, Employee ID, Email, Department, Subject, Staff Type (Teaching / Non-Teaching)
4. Click **Save** — an email with login credentials is sent automatically

#### Bulk Import Teachers (CSV)
1. Go to **People → Teachers → Staff Onboarding tab**
2. Download the CSV template
3. Fill in teacher details (Name, Employee ID, Email, Department, Subject)
4. Upload the CSV file
5. Review the preview → click **Import**

#### Assign HOD (Head of Department)
1. Go to **People → Teachers**
2. Find the teacher → click their name
3. In their profile, assign **Department** and tick **HOD**
4. HODs can see syllabus coverage across all classes in their department

#### Reset a Teacher's Password
1. Go to **People → Teachers**
2. Find the teacher → click **Reset Password**
3. A new temporary password is sent to their email

#### Remove a Teacher
1. Find the teacher → click **Remove**
2. The teacher is **soft-deleted** (data preserved, they cannot log in)
3. Their classes are not affected — reassign subjects separately

---

### 3.4 Student Management

**What you can do:** Add, edit, view, and manage student records.

#### Add a Single Student
1. Go to **People → Students**
2. Click **+ Add Student**
3. Fill in: Name, Roll Number, Grade, Section, Parent Name, Parent Phone, Parent Email
4. Click **Save**

#### Bulk Import Students (CSV)
1. Go to **People → Students → Student Onboarding tab**
2. Download the CSV template
3. Fill in student details
4. Upload → Review → **Import**

#### View Student Details
- Click any student name to see: attendance %, exam marks history, submitted tasks, points/badges

#### Edit Student
- Click student name → **Edit** → change grade, section, parent contact → **Save**

---

### 3.5 Class Management

**What you can do:** Create classes, assign subjects and teachers, set class teachers.

#### Create a Class
1. Go to **People → Classes**
2. Click **+ Add Class**
3. Select: Grade, Section (A/B/C…)
4. Assign a **Class Teacher** from the teacher list
5. Click **Save**

#### Add Subjects to a Class
1. Click the class name to open it
2. Go to **Subjects tab**
3. Click **+ Add Subject**
4. Enter: Subject Name, Assign Teacher, Periods per Week (e.g. 5)
5. Click **Add**

> Periods per week controls how many timetable slots are allocated to this subject during auto-generation.

#### Edit a Subject
1. Click the **✎ Edit** button on any subject chip
2. Change name, teacher, or periods per week
3. Click **Save**

---

### 3.6 Timetable Management

**What you can do:** Auto-generate or manually build class timetables.

#### Auto-Generate Timetable
1. Go to **Scheduling → Timetable**
2. Select the class
3. Click **Auto-Generate**
4. The system solves for: no teacher clashes, correct periods per week, balanced daily load
5. Review the generated grid → click **Save**

#### Manual Edit
1. Click any empty slot in the timetable
2. Select: Subject, Teacher, Room
3. Click **Save**
4. To clear a slot: click it → **Delete**

#### Check for Conflicts
- Click **Validate** — shows any teacher double-bookings or missing periods

#### Timetable Versions
1. Once finalized, click **Save Version** (takes a named snapshot)
2. Click **Circulate** to push it to teachers and students

#### Sync Modes (for schools with multiple sections sharing teachers)
- **Master** — this class's timetable controls teacher allocation
- **Slave** — follows another class (useful for parallel sections)
- **Independent** — standalone

---

### 3.7 Attendance

**What you can do:** View daily attendance, analyze trends, manage sessions.

> **Note:** Teachers mark attendance from their portal. Admin views and analyzes.

#### View Today's Attendance
1. Go to **Scheduling → Attendance**
2. Select: Date, Session (Morning / Afternoon), Class
3. See each student: Present / Absent / Late

#### View Trends
- Attendance tab → **Analytics** view
- Shows: weekly/monthly attendance %, chronic absentees, class-wise comparison

#### Mark Attendance (Admin can also do this)
1. Select Class + Date + Session
2. Mark each student: P (Present), A (Absent), L (Late)
3. Click **Submit**

---

### 3.8 Leave Requests & Emergency Cover

**Two-step process:** Approve leave → Assign substitute

#### Step 1: Approve/Reject Leave
1. Go to **Scheduling → Leave Requests**
2. See all pending requests with dates and reason
3. Click **Approve** or **Reject**
4. Approved leaves appear as warnings in Daily Briefing

#### Step 2: Assign Emergency Cover
1. Go to **Scheduling → Emergency Cover**
2. See all uncovered periods (approved leaves with no substitute yet)
3. For each period, the system suggests available teachers
4. Click a teacher → **Assign as Substitute**
5. The substitute teacher sees their duty in their portal

---

### 3.9 Exam Management

**Full lifecycle:** Create → Assign → Marks → Publish → Parent views

#### Create an Exam
1. Go to **Scheduling → Exams**
2. Click **+ New Exam**
3. Enter: Name, Type (Unit Test / Mid Term / Final / Practical), Class, Date
4. Click **Create**

#### Assign Subjects to Teachers
1. Open the exam → click **+ Add Subject**
2. Select: Subject name, Teacher, Maximum Marks, Passing %
3. Save — the teacher now sees this exam in their portal

#### Enter / View Marks
1. Open the exam → **Marks** tab
2. See all students with their marks per subject
3. Admin can view; teachers enter from their portal

#### Publish Results
1. Once all subjects are submitted → click **Publish**
2. Results become visible to students and parents immediately
3. Parents can acknowledge results (confirms they've seen the marks)

#### Class Analytics
- Go to **Analysis → Class Analytics**
- See: average marks by subject, top/bottom 5 students, exam-wise trend

---

### 3.10 Fee Management

This is the most detailed module. Follow the steps in order.

---

#### STEP 1 — Create Fee Categories

A fee category defines a type of fee (Tuition, Transport, Exam, etc.)

1. Go to **Management → Fee Management → Fee Setup tab**
2. Click **+ Add Category**
3. **Step 1 — Quick pick:** Click a suggestion chip (e.g. "Transport Fee") — this auto-fills name, frequency, and type
   - OR type a custom name
4. **Frequency:** How often this fee is charged
   - Monthly — every month (12 entries per year)
   - Quarterly — 4 times a year
   - Annual — once per year, repeats next year
   - One Time — charged only once ever (e.g. Admission Fee)
5. **Type:**
   - **Fixed** — same amount for all students in a grade (e.g. Tuition ₹2000 for Grade 8)
   - **Variable** — different amount per student (e.g. Transport depends on route)
6. Click **Add Category**

---

#### STEP 2 — Set Fee Amounts (Fee Setup Grid)

For **Fixed** categories:

1. In Fee Setup tab, the grid shows: rows = categories, columns = Grade 1 to Grade 12
2. Enter the amount for each grade (e.g. Tuition: Grade 8 = ₹2000, Grade 9 = ₹2500)
3. Set the **Due Day** (e.g. 10 = fees due on 10th of every month)
4. For Variable categories, the cell shows "per student" — set amounts in Applicability tab (see Step 3)
5. Click **Save Structure**

**Lock the structure** (once finalized):
- Click **Lock Structure** — amounts can no longer be changed freely
- After lock, changes require an Amendment with a reason (tracked in audit log)

---

#### STEP 3 — Set Variable Amounts (Applicability Tab)

*Only needed for Variable categories like Transport.*

1. Go to **Applicability tab**
2. Select **Grade** → click **Load**
3. See all students in that grade × variable categories grid
4. Enter each student's amount (leave blank = not applicable, that student won't be billed)
5. Click **Save & Update Ledger**

> Example: Ishita Rao takes Bus Route A → ₹1200/month. Tejas Kumar takes Route B → ₹4000/month.

**View change history:** Click the **⟳** button next to any amount to see who changed it and when.

---

#### STEP 4 — Generate the Ledger

This creates individual fee entries for every student for the entire year.

1. In Fee Setup tab → click **Generate Ledger**
2. The system creates:
   - Monthly fees: 12 entries per student (Apr to Mar)
   - Quarterly: 4 entries
   - Annual/One-Time: 1 entry
3. Entries are created for all active students in all grades
4. Already-existing entries are skipped (safe to run again)

---

#### STEP 5 — View the Ledger

Go to **Ledger tab**

**Filters available:**
- Grade filter
- Status filter: Pending / Partial / Overdue / Paid / Waived
- Search by student name or roll number

**Each row shows:**
- Student name + Grade/Section/Roll
- Fee category + Period (e.g. "Tuition · Jul 2025")
- Amount Due / Amount Paid / Balance
- Due Date + Days overdue (if applicable)
- Status badge

**Actions per row:**
- **Collect →** — record a payment for this entry
- **Edit** — correct the amount (requires reason, tracked in audit)
- **Pmts** — view full payment history for this entry
- **Delete** — only if ₹0 paid and not yet paid

**Export:** Click **Export CSV** to download the full ledger

---

#### STEP 6 — Collect a Payment (Collect Tab)

1. Go to **Collect tab**
2. Search student by name or roll number
3. Click on the fee entry you want to collect
4. Fill in:
   - **Amount** (partial payment allowed)
   - **Payment Mode:** Cash / Cheque / Demand Draft / UPI / Online Transfer
   - **Payment Date**
   - **Collected By** (staff name)
   - **Transaction Ref** (for non-cash modes)
   - **Notes** (optional)
5. Click **Record Payment of ₹X**
6. A receipt screen appears with the **Receipt Number**
7. Click **Print Receipt** to print a formal invoice

**Receipt contains:** School name, student details, category, period, amount, mode, date, receipt number.

---

#### STEP 7 — Grant a Waiver

A waiver reduces or cancels a fee for a specific student (scholarship, hardship, etc.)

1. Go to **Collect tab** → find the student's entry
2. Click **Grant Waiver** tab
3. Select waiver type:
   - **Percentage** — e.g. 50% off
   - **Fixed Amount** — e.g. ₹500 off
   - **Full Waiver** — cancels the entire amount
4. Enter **Reason** (required — e.g. "Merit scholarship", "Financial hardship")
5. Enter **Approved By** name
6. Click **Grant Waiver**

---

#### STEP 8 — Verify Online Payments (Pending Tab)

When parents pay through the parent portal (UPI/online), payments need admin verification.

1. Go to **Pending tab** — shows a red dot if payments are waiting
2. For each payment: see student name, receipt number, amount, transaction reference, date
3. Click **✓ Approve** if payment received in your account
4. OR click **✗ Reject** → enter reason (e.g. "UTR not found", "Amount mismatch")
5. On approval: parent receives an email confirmation automatically
6. On rejection: parent receives an email with your rejection reason

---

#### Fee Reports

Go to **Reports tab** for:

- **Balance Sheet** — Total billed / collected / outstanding / waived for the year
- **Grade-wise collection** — progress bars per grade
- **Category-wise summary** — how much collected per fee head
- **Payment mode breakdown** — cash vs UPI vs cheque
- **Full defaulters list** — all students with outstanding balance, with parent phone numbers

**Export:**
- Click **Export Payments CSV** — all completed payments
- Click **Export Ledger CSV** — full ledger with all statuses
- Click **Export Defaulters** — only overdue/pending entries

---

#### Year-End Fee Closure

At end of academic year, handle unpaid fees:

1. Go to **Year-End tab**
2. See all unpaid/partial entries
3. Select entries using checkboxes
4. Choose action:
   - **Write Off** — marks entries as waived (fee forgiven, history preserved)
   - **Carry Forward** — creates new entry in next year's ledger for the balance
5. Enter **Reason** and target year (for carry forward)
6. Click **Write Off / Carry Forward (N)**

---

#### Category History & Audit

Every change to fee amounts is tracked:

- **Hist button** on each category row — shows every amount change (who changed, old→new, when)
- **Log button** — shows config changes (name renamed, Fixed→Variable toggle, deactivation)
- **⟳ button** on Applicability cells — shows variable amount history per student

---

### 3.11 Announcements

**What you can do:** Create notices for specific audiences.

#### Create an Announcement
1. Go to **Communication → Announcements**
2. Click **+ New Announcement**
3. Enter:
   - **Title** (short headline)
   - **Content** (full message)
   - **Audience:** All / Teachers only / Students only / Parents only / Custom grades
   - **Expiry Date** (auto-hides after this date)
4. Click **Publish**

Announcements appear in the relevant portals immediately.

---

### 3.12 Academic Calendar

**What you can do:** Add holidays, events, and meetings.

1. Go to **Tools → Academic Calendar**
2. Click any date on the calendar
3. Select event type: Holiday / Exam / Meeting / Event / Sports
4. Enter title and description
5. Click **Save**

Events appear color-coded:
- 🔴 Holiday
- 🔵 Exam
- 🟢 Event/Sports
- 🟡 Meeting

---

### 3.13 Student Leaderboard

Shows top students by points, badges, and streaks across the school.

- Go to **Communication → Student Leaderboard**
- Filter by: All School / Specific Grade / Specific Class
- Each student shows: Points total, Badge count, Current streak

---

### 3.14 Parent Engagement

**What you can do:** Send bulk messages to parents.

1. Go to **Management → Parent Engagement**
2. Select message type: Fee Reminder / Marks Update / General Notice
3. Select target: All parents / Specific grade / Defaulters only
4. Write message → click **Send**

Engagement metrics show: how many parents viewed, last login times.

---

### 3.15 Year Rollover

At the end of the academic year, promote all students to the next grade.

1. Go to **Management → Year Rollover**
2. Review students by class
3. Mark any students as: Promoted / Held Back / Transferred / Graduated
4. Click **Execute Rollover**
5. Students move to their new grade/class for next year

---

### 3.16 Export Center

1. Go to **Tools → Export**
2. Select export type:
   - Student List (with parent contacts)
   - Teacher List
   - Monthly Attendance
   - Exam Marks
3. Apply filters (grade, date range)
4. Click **Export CSV** — file downloads to your computer

---

### 3.17 School Settings

1. Go to **Tools → Settings**
2. Sections:
   - **Branding** — Upload school logo
   - **Grading Scheme** — Set grade boundaries (A1 ≥ 91%, etc.)
   - **Schedule** — Set school timings, number of periods per day, break times
   - **UPI ID** — Set your school's UPI ID for online fee payments (very important — parents pay to this account)

---

## 4. Teacher Portal

Teachers log in at the Teacher Portal with their School Code + Employee ID.

---

### 4.1 Smart Snapshot (Home)

Shows at a glance:
- Today's class schedule (with current period highlighted)
- Pending tasks to review
- Open student doubts
- Any substitute duties today

---

### 4.2 My Classes

- See all classes you teach + any class you are class teacher of
- Click a class to open **Class View** (tabbed interface)

---

### 4.3 Class View — Tabs

#### Timetable Tab
- See the class weekly schedule
- Your periods are highlighted

#### Students Tab
- Full student roster for this class
- Click a student to see their attendance and marks

#### Tasks Tab
**Create a Task:**
1. Click **+ New Task**
2. Enter: Title, Subject, Type (Homework / Practice / Test), Due Date, Max Marks
3. Click **Publish** — students see it immediately

**Review Submissions:**
1. Click any published task
2. See each student's submission (text + attached file if any)
3. Enter **Score** and **Feedback**
4. Click **Grade** — student sees the feedback
5. Optionally click **Request Resubmission** if the work needs improvement

#### Doubts Tab
- See all doubts raised by students in this class
- Each doubt already has an **AI-generated answer** (shown in blue)
- Click a doubt to open the **live chat thread**
- Type your reply → press Enter → student sees it in real time
- Click **Mark as Final Answer** when resolved
- Tick **Class FAQ** to pin it for all students to see

#### Marks Tab
- See exams assigned to you for this class
- Click an exam → enter marks per student per subject
- Click **Submit Marks** when done → admin can then publish

#### Attendance Tab
1. Select: Date, Session (Morning / Afternoon)
2. Mark each student: **P** (Present), **A** (Absent), **L** (Late)
3. Click **Submit Attendance**

#### Performance Tab
- Class average per subject, top 5 and bottom 5 students

#### Weekly Tests Tab
- AI-generated MCQ results for the current week
- See per-student scores and wrong-answer analysis

---

### 4.4 Attendance (Full View)

1. Go to **Attendance** in teacher sidebar
2. Select: Grade, Section, Date, Session
3. Mark students → Submit

---

### 4.5 Full Timetable

- See your personal weekly timetable
- Current period is highlighted with a countdown timer
- Substitute duties shown in orange

---

### 4.6 Doubts Center

- All doubts from all your classes in one place
- Filter by: Subject / Status (Open, In Progress, Resolved) / Class
- Respond, resolve, mark FAQ

---

### 4.7 Leave Request

1. Go to **Leave** in teacher sidebar
2. Click **+ Request Leave**
3. Enter: Leave Type (Sick / Personal / Official), Start Date, End Date, Reason
4. Click **Submit**
5. Admin approves/rejects — you get notified

---

### 4.8 HOD Syllabus (HODs Only)

Available only for teachers assigned as Head of Department.

1. Go to **HOD Syllabus**
2. Select: Department, Class, Subject
3. See all chapters and topics with coverage status
4. Mark topics as **Covered** with the date
5. Add remarks for delays (e.g. "School holiday caused 2-week delay")
6. See cross-class comparison: which classes are ahead/behind

---

## 5. Student Portal

Students log in by selecting School → Grade → Section → Name.

---

### 5.1 Dashboard

Shows:
- **Engagement Score** — how active you are on the platform
- **Pending Tasks** — tasks with upcoming deadlines
- **Recent Doubts** — your open doubts
- **Weekly Test Status** — this week's test (taken or not)
- **Points & Streak** — your learning streak

---

### 5.2 My Tasks

**View and submit assigned tasks:**
1. Go to **Tasks**
2. See all tasks: title, subject, due date, status
3. Click a task → read the instructions
4. Type your answer in the text box
5. Optionally attach a file (photos, PDFs, documents)
6. Click **Submit**

**After teacher reviews:**
- You'll see your **Score** and **Feedback**
- If teacher requests resubmission → improve and submit again

---

### 5.3 My Marks (Exams)

1. Go to **Results**
2. See all published exams
3. Click any exam to see:
   - Subject-wise marks (e.g. Maths: 85/100, Science: 72/100)
   - Grade earned (A1, A2, B1, etc.)
   - Pass / Fail status
4. Click **Acknowledge** to confirm your parents have seen the results

---

### 5.4 Weekly Tests (AI MCQ)

Every week, an AI generates a test based on what you studied that week.

1. Go to **Weekly Tests**
2. Click **Start Test**
3. Answer all multiple-choice questions
4. Click **Submit**
5. See your score + explanation of wrong answers
6. Score ≥ 80%: earn bonus points!

---

### 5.5 Doubts

**Ask a doubt:**
1. Go to **Doubts**
2. Click **+ Ask a Doubt**
3. Select Subject → type your question
4. Click **Submit**
5. You immediately get an **AI-generated answer**
6. Your teacher will also reply with a final answer

**Browse class doubts:**
- See doubts raised by classmates (names hidden)
- Click **Upvote** if you have the same question
- Most-upvoted doubts get priority attention from teachers

**Class FAQs:**
- Teacher-pinned answers to the most common questions

---

### 5.6 My Timetable

- See your weekly class schedule
- Current period is highlighted with a countdown

---

### 5.7 Syllabus Progress

- See chapter and topic coverage per subject
- Green = covered by teacher, Grey = pending

---

### 5.8 Daily Newspaper

- Every day, a knowledge article is published
- Read it → earn points
- Articles cover: current events, science, history, culture

---

### 5.9 Rewards & Leaderboard

**Points earned for:**
- Submitting tasks — points
- Getting doubts resolved — points
- Reading the daily newspaper — points
- Scoring ≥ 80% in weekly test — bonus points
- Maintaining learning streaks — streak points

**Badges awarded for:**
- 7-day learning streak
- 30-day streak
- Perfect test score
- Most doubts resolved
- And more…

**Leaderboard:**
- Ranks all students in your school by total points
- Updated in real time

---

## 6. Parent Portal

Parents log in with their email and password.

---

### 6.1 Overview

After login, select your **child's name** (if you have multiple children).

The overview shows:
- Upcoming exams
- Latest results
- Attendance percentage
- Pending tasks
- Recent activity

---

### 6.2 Today's Schedule

- See your child's complete timetable for today
- Know which subject period is happening right now

---

### 6.3 Attendance

- Full month-wise attendance record
- Calendar view: green = present, red = absent, yellow = late
- Monthly summary: total days, present, absent, attendance %

---

### 6.4 Fees

**View Fee Summary:**
- **Total Due** — all fees for the year
- **Paid** — what has been paid
- **Waived** — any concessions granted
- **Outstanding** — amount still pending

**View Ledger:**
- Each fee entry: category, period, amount due, balance, status
- Overdue entries highlighted in red

**Pay Online (UPI):**
1. Select one or more fee entries (tick checkboxes)
2. Click **Pay** or **Pay All Pending**
3. Scan the **UPI QR code** with any payment app (Google Pay, PhonePe, Paytm)
4. Pay the amount shown
5. Enter the **Transaction Reference (UTR)** number
6. Click **I've Paid** — payment goes for admin verification
7. Once admin approves, you get a **confirmation email**

**Download Receipt:**
- For any confirmed payment, click **Download Receipt**
- A printable invoice with school name, student details, amount, receipt number

**View Waivers:**
- If any fee was waived/discounted, it appears as a purple section
- Shows: category, amount waived, reason

**Rejected Payment:**
- If a payment is rejected, you'll see the reason in red
- Re-submit a new payment after resolving the issue

---

### 6.5 Exam Calendar

- See all upcoming exams: name, type, date, subjects
- Exams within 3 days shown in red (urgent)
- Exams within 7 days shown in amber

---

### 6.6 Results

- See published exam results for your child
- Subject-wise marks and grades
- Click **Acknowledge** to confirm you've seen the report card

---

### 6.7 Syllabus

- See what chapters and topics have been covered in each subject
- Track progress per subject

---

---

## 7. Quick Reference — Login Credentials

| Role | Login Page | Username | Password |
|---|---|---|---|
| School Admin | `/school-admin` | School Code + Admin Email | Set by admin (temporary on first login) |
| Teacher | `/teacher` | School Code + Employee ID | Employee ID (first time), then own password |
| Student | `/student` | Dropdown selection | Provided by school |
| Parent | `/parent` | Registered Email | Provided by school |

---

## Common Questions

**Q: A teacher forgot their password. What do I do?**
A: Go to School Admin → Teachers → find the teacher → click Reset Password. They get a new temporary password by email.

**Q: A parent says their payment is stuck as "Pending Verification".**
A: Go to Fee Management → Pending tab. Find their payment and approve it after checking your bank/UPI account.

**Q: A student was promoted to the wrong grade.**
A: Go to Students → find the student → Edit → change the Grade/Section → Save.

**Q: Timetable shows a conflict.**
A: Go to Timetable → select the class → click Validate → fix the conflicting slot by reassigning a different teacher or time.

**Q: How do I add a school holiday to the calendar?**
A: Go to Academic Calendar → click the date → select "Holiday" → enter the name → Save. All portals will show this as a holiday.

**Q: A parent says they can't see their child's marks.**
A: Check if the exam is published. Go to Exams → find the exam → if status is "Draft" or "Collecting", click Publish.

---

*For technical support, contact: support@wlyl.com*
*WLYL Platform · We Learn, You Lead*
