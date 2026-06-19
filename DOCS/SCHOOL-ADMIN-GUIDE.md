# WLYL School Admin — User Guide
**Version 1 · June 2026**

> Share this document with the school's principal or fee admin before the visit. It covers every screen they will see.

---

## Table of Contents

1. [First Login](#1-first-login)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Staff Management](#3-staff-management)
4. [Student Management](#4-student-management)
5. [Class Management](#5-class-management)
6. [Fee Management — Full Guide](#6-fee-management--full-guide)
   - 6.1 Overview Tab
   - 6.2 Fee Plan Setup Tab
   - 6.3 Applicability Tab
   - 6.4 Ledger Tab
   - 6.5 Collect Tab
   - 6.6 Pending Tab
   - 6.7 Student Passbook Tab
   - 6.8 Reports Tab
   - 6.9 Year-End Tab
7. [Timetable Management](#7-timetable-management)
8. [Attendance](#8-attendance)
9. [Leave Requests](#9-leave-requests)
10. [Emergency Cover](#10-emergency-cover)
11. [Exam Schedule](#11-exam-schedule)
12. [Announcements](#12-announcements)
13. [Export & Reports](#13-export--reports)
14. [School Settings](#14-school-settings)
15. [Year Rollover](#15-year-rollover)
16. [Common Questions & Troubleshooting](#16-common-questions--troubleshooting)

---

## 1. First Login

### How to Log In

1. Open the school portal URL shared by your WLYL representative.
2. Enter your **School Code** (e.g., `SCH-001`) and the **Temporary Password** provided.
3. On first login you will be asked to set a new password. Choose something strong (8+ characters, mix of letters, numbers, symbols).
4. After saving your password you will land on the main dashboard.

> **Note:** Your School Code is your permanent login ID. Do not change it.

### What You See After Login

- A left sidebar with all navigation sections.
- A top bar showing your school name, subscription tier (Basic / Standard / Premium), and a notification bell.
- The main area shows the Overview dashboard.

---

## 2. Dashboard Overview

The Overview is your daily command centre. It shows everything that needs your attention right now.

### Summary Cards (top row)

| Card | What it means |
|------|---------------|
| Teachers | Total active staff on record |
| Students | Total enrolled students |
| Classes | Active grade + section combinations |
| Academic Year | The current academic year label (e.g., 2025-26) |

### Sections Below the Cards

**Attendance Summary** — how many classes marked attendance today, percentage present/absent.

**Timetable Health** — number of timetable conflicts, unassigned subjects, and uncovered periods right now.

**Uncovered Periods** — live list of periods where a teacher is absent and no cover has been arranged. Act on this immediately.

**Pending Leave Requests** — count of staff leave applications waiting for your approval.

**Upcoming Exams** — next scheduled exams by date and class.

**Fee Status** — total outstanding amount and count of overdue bills. Click to go to Fee Management.

**Action Alerts banner** — appears at the top in amber if anything needs urgent attention (high overdue count, conflicts, pending leaves, uncovered periods).

> **Tip:** Check the Overview every morning. If the alert banner is showing, resolve those items before the school day starts.

---

## 3. Staff Management

**Location:** Left sidebar → People → Staff

### 3.1 Staff Directory

Shows a table of all staff with Name, Email, Phone, Department, Designation, Hire Date, and Status.

**What you can do:**
- Search by name or department.
- Click any row to view the full staff profile.
- Edit contact details, designation, or department.
- Mark a staff member as Inactive (they lose login access).
- Export the staff list to Excel.

### 3.2 Onboard New Staff

Click **+ Add Staff** to open the onboarding form.

**Required fields:** Full Name, Email, Phone, Department, Designation, Hire Date.

After submitting:
- The staff member appears immediately in the directory.
- A temporary password is auto-generated and shown on screen — copy it and share with the new staff member.
- On their first login they must set a new password.

> **Important:** Each staff member's email must be unique. Duplicate emails will be rejected.

---

## 4. Student Management

**Location:** Left sidebar → People → Students

### 4.1 Student List

Shows all enrolled students with Name, Roll Number, Grade, Section, Parent Name, and Phone.

**What you can do:**
- Search by name, roll number, or class.
- Filter by Grade or Section.
- Click a student to view their full profile.
- Edit contact information.
- Mark a student as Left or Graduated (they leave the active list but data is retained forever).
- Export the roster to Excel.

### 4.2 Onboard New Student

Click **+ Enroll Student** to open the enrollment form.

**Required fields:** Name, Date of Birth, Roll Number, Grade, Section, Parent Name, Parent Phone.

After submitting:
- Student appears immediately in all lists.
- If fee bills have already been generated for their grade, their bills are included automatically.
- Student's attendance slot is created in the timetable.

> **School Roll Number vs Roll Number:** There are two roll number fields. School Roll Number is the school's permanent sequential number. Roll Number is the class roll (resets each year).

---

## 5. Class Management

**Location:** Left sidebar → People → Class Management

Classes are the core unit — every student, timetable, and fee bill is linked to a class.

### Creating a Class

Click **+ New Class**. Enter:
- Grade (1–12 or custom)
- Section (A, B, C, etc.)
- Class Teacher (optional at creation)
- Maximum students (optional)

### What You Can Do

- Assign a class teacher to a class.
- View all students in a class (click the class card).
- Enable or disable a class (disabled classes are hidden from timetable and attendance).
- Bulk-assign subjects to multiple classes at once.

> **Warning:** Do not delete a class that has active students. Mark it inactive instead.

---

## 6. Fee Management — Full Guide

**Location:** Left sidebar → Management → Fee Management

This is the most important module. It has 9 visible tabs across the top. Work through them in order the first time.

---

### 6.1 Overview Tab

A live summary of the school's fee collection health.

**Four stat cards at the top:**

| Card | What it shows |
|------|---------------|
| Total Billed | Total fee amount generated for all students this year |
| Collected | Amount received so far and what % it is of total |
| Outstanding | Remaining unpaid amount and how many bills are overdue |
| Zero Payers | Students who have made no payment at all this year |

**Class-wise Collection Table** — shows each class with Billed, Collected, Outstanding, and a Collection % progress bar. Classes with low collection % need follow-up.

**Top 5 Defaulters** — students with the highest outstanding amount. Use this list for parent contact.

**Recent Payments** — last 10 payments recorded across all students.

**Payment Mode Breakdown** — how much was collected via Cash, Cheque, Bank Transfer, Online, etc.

> **Tip:** The "Needs Attention" banner at the top of this tab will appear red if there are more than 20 overdue bills. Investigate immediately.

---

### 6.2 Fee Plan Setup Tab

**Do this first, at the start of every academic year.**

There are 4 steps to complete:

```
Step 1 → Add Fee Heads
Step 2 → Set Fixed Amounts per Grade
Step 3 → Generate Bills for All Students
Step 4 → Lock the Plan
```

A progress strip at the top of the tab shows which steps are done.

#### Step 1 — Add Fee Heads

A fee head is a type of fee (Tuition, Transport, Exam Fee, etc.).

Click **+ Add Fee Head**. A 4-step wizard opens:

1. **Choose fee name** — pick from suggestions (Tuition Fee, Exam Fee, Transport Fee, Library Fee, Hostel Fee, etc.) or type a custom name.
2. **Select frequency:**
   - **Monthly** — 12 bills per year (April to March)
   - **Quarterly** — 4 bills per year
   - **Half Yearly** — 2 bills per year (April and October)
   - **Annual** — 1 bill per year
   - **One Time** — 1 bill ever, does not repeat next year
3. **Select type:**
   - **Fixed** — same amount for all students in a grade
   - **Variable** — different amount per student (e.g., transport based on distance)
4. **Add a description** (optional).

Repeat for each fee head the school charges.

#### Step 2 — Set Amounts per Grade

For each **Fixed** fee head, click its card → the **Manage** panel expands.

Enter the amount for each grade (Grade 1, 2, 3 … 12). You can set different amounts per grade. Also set the **Due Day** (e.g., 10 means the 10th of each month).

> **For Variable fees:** Amounts are set per student in the Applicability tab (Section 6.3). Skip amount-setting for variable fee heads here.

#### Step 3 — Generate Bills

Once all fixed fee amounts are entered, click **Generate All Bills**.

This creates one bill entry for every student × fee type × billing period. For example, Monthly Tuition for 100 students creates 1,200 entries (100 × 12 months).

> **Important:** You can generate bills multiple times safely — it skips students who already have bills (it will not create duplicates).

**Due Day warning before generating:** A confirmation modal will show each fee head and its due day. If any show "(default)" in amber, it means no due day was set — go back and set it before generating.

#### Step 4 — Lock the Plan

Click **Lock Fee Plan**. This prevents accidental changes.

After locking:
- Fee amounts can only be changed through **Amendments** (formal change with reason and audit trail).
- Bills can still be generated for newly-enrolled students using **Generate for New (N)** button.
- The lock shows who locked it and when.

**To amend a locked amount:**
1. Click the fee head card.
2. Click **Amend Amount**.
3. Enter the new amount and a reason.
4. Save — the change applies to future bills only.

**Amendments are permanent audit records** — all changes are tracked.

**To unlock** (if you need to restructure):
- Click the red **Unlock** button and confirm. This allows full editing again. Use carefully.

#### UPI Configuration

Before enabling online payments, enter your school's UPI ID at the top of the Setup tab. Click **Save UPI ID**. A green badge will confirm it is saved.

---

### 6.3 Applicability Tab

Use this tab to set **variable fee amounts** for individual students.

**How to use:**
1. Select the **Grade** and **Section**.
2. Click **Load**.
3. A grid appears: rows are students, columns are variable fee categories.
4. Type the amount for each student in the relevant cell.
5. Changed cells turn amber to confirm they are modified.
6. Click **Save All** to commit.

> **Example:** If Transport Fee is variable, some students might pay ₹500/month (short route) and others ₹800/month (long route). Set each student's amount here.

---

### 6.4 Ledger Tab

The Ledger is the complete record of every bill for every student. It is read-only for audit purposes but you can apply waivers and edits here.

**Columns:** Student Name, Roll #, Grade, Section, Fee Category, Period, Amount Due, Amount Paid, Balance, Waiver, Due Date, Status.

**Status values:**

| Status | Meaning |
|--------|---------|
| Pending | Bill generated, not yet due or not yet paid |
| Overdue | Past due date, not fully paid |
| Partial | Some amount paid, balance remaining |
| Paid | Fully paid |
| Waived | Written off — no payment required |

**Filters available:**
- By Status (Overdue, Pending, Partial, Paid, Waived)
- By Grade and Section
- By Fee Category
- By Due Date range
- Search by student name or roll number

**Actions on a ledger entry:**
- **Record Payment** — shortcut to Collect tab for this student.
- **Apply Waiver** — reduce or cancel a bill (requires reason).
- **Edit Amount** — correct the bill amount (requires reason, logged permanently).
- **View Payment History** — see all payments made against this entry.

**Applying a Waiver:**

1. Click the row → select **Apply Waiver**.
2. Choose waiver type:
   - **Full** — cancels entire remaining balance.
   - **Percentage** — e.g., 50% of remaining balance.
   - **Fixed Amount** — e.g., ₹500 off.
3. Enter the reason (required).
4. Save.

The waiver is recorded permanently. Revoking a waiver is possible but also permanently logged.

---

### 6.5 Collect Tab

Record a payment received from a student.

**Steps:**
1. Search for the student by name or roll number.
2. Select the fee entries to pay. The system shows Amount Due, Already Paid, and Balance.
3. Enter the amount being paid now.
4. Select **Payment Mode**: Cash, Cheque, Bank Transfer, Online, Other.
5. Enter **Transaction Reference** if available (cheque number, UPI reference, etc.).
6. Click **Save Payment**.

**What happens immediately:**
- A receipt number is generated (format: RCP-XXX-2025-000001).
- The ledger entry updates to show the new amount paid and status.
- A receipt appears on screen that you can print or download.

**Multi-entry payment (Pay Multiple Bills at Once):**
- Select multiple ledger entries for the same student.
- Enter a single total amount.
- The system allocates the amount to bills in oldest-first order (FIFO).
- One receipt covers all allocations.

**Day Close:**
- At end of day, use Day Close to reconcile cash and cheque received today.
- Shows totals by payment mode for the day.

---

### 6.6 Pending Tab

Online payments submitted by parents appear here as "Pending Verification" until a staff member verifies them.

**For each pending payment you will see:**
- Student name and amount
- Transaction reference number from the gateway/parent
- Date submitted

**To verify:**
1. Check your bank account or payment gateway dashboard for the transaction reference.
2. If found and matching: click **Approve**. The ledger updates to Paid.
3. If not found or mismatched: click **Reject** and enter a reason. The parent's payment entry is reversed.

> **Never approve a payment without verifying it in your bank or gateway dashboard first.**

---

### 6.7 Student Passbook Tab

View the complete fee history for a single student. Useful when a parent asks "How much have we paid this year?"

**How to use:**
1. Search for the student.
2. The passbook shows:
   - Fee Balance Summary (Total Billed, Total Waived, Net Demand, Total Paid, Balance Due).
   - All fee entries with status.
   - Full payment history with receipt numbers.
   - Any waivers applied.
3. Click **Print Passbook** to generate a printable, parent-friendly version.

---

### 6.8 Reports Tab

Generate fee reports for accounts, management, or parent communication.

**Available report types:**

| Report | What it shows |
|--------|---------------|
| Balance Report | Summary + by-category + by-class + by-student breakdown |
| Category-wise | Collection per fee type |
| Grade-wise | Class performance with paid/unpaid student counts |
| Defaulter Report | Students with outstanding dues, sorted by amount |
| Payment Mode Analysis | Cash vs Cheque vs Online breakdown |
| Amendment Log | All fee structure changes made this year |
| Monthly Trend | Month-by-month collections chart |

**All reports can be:**
- Filtered by Academic Year, Grade, Section, Date Range.
- Exported to PDF or Excel.
- Printed directly.

---

### 6.9 Year-End Tab

Use this at the end of the academic year to close the books.

**Workflow — do these steps in order:**

#### Step 1 — Review

View the final reconciliation:
- Total billed, total collected, total waived, total still unpaid.
- List of students with unpaid dues.

#### Step 2 — Decide Each Student's Unpaid Dues

For each student with outstanding amount, choose one of three actions:

| Decision | What it does |
|----------|-------------|
| **Carry Forward** | Moves the unpaid balance to next year as a "Previous Year Dues" bill |
| **Write Off** | Cancels the unpaid amount permanently (requires a reason — logged in audit) |
| **Leave Open** | Does nothing — the bill stays in the current year unresolved |

You can bulk-set all visible students at once using the buttons:
- "All → Carry Forward"
- "All → Write Off"
- "All → Leave Open"

> **Note:** Students who are leaving the school (Grade 12 graduates or students who have been marked as Left) cannot be set to Carry Forward. Choose Write Off or Leave Open for them.

#### Step 3 — Apply Decisions

Click **Apply Decisions**. This processes all your carry/write-off choices.

After applying, a confirmation shows how many were carried (and total amount) and how many were written off.

#### Step 4 — Print Statement & Close the Year

1. Click **Print Statement** — generates a final year-end financial statement. Print and file for records.
2. Click **Export Ledger CSV** — saves the complete ledger for archiving.
3. Click **Close Financial Year** — permanently locks the year. No more payments can be recorded for this year after closing (unless reopened with a specific reason).

> **After closing:** A prompt will ask whether to go to Fee Setup to generate bills for the new year. Click Yes and set up the new year's fee structure.

**Reopening a closed year** is possible (click Reopen) but requires a reason, is permanently logged, and should only be used for corrections.

---

## 7. Timetable Management

**Location:** Left sidebar → Scheduling → Timetable

### What You Can Do

- View the timetable for any class as a grid (Periods × Days).
- Assign a teacher to each period.
- Detect conflicts (same teacher in two classes at the same time).
- Print and export timetables.

### Creating a Timetable

1. Select the class (Grade + Section).
2. Click on a period cell.
3. Select the subject and the teacher.
4. Save.

### Conflicts

A red badge appears on timetable entries where the same teacher is assigned to two classes at the same time. Resolve by reassigning one of the periods to another teacher.

> **Conflicts appear in the Overview alert banner.** A clean timetable means no conflicts.

---

## 8. Attendance

**Location:** Left sidebar → Scheduling → Attendance

### Marking Attendance

1. Select the class and date.
2. The student list appears.
3. Mark each student Present, Absent, or Late.
4. Save — the attendance is locked for that date.

To correct a mistake after saving: re-open the attendance for that date, make changes, and save again. All edits are logged.

### Viewing Reports

- Filter by class, date range, or student.
- Export attendance report to Excel.
- Overall attendance percentage shown per student.

> **Best practice:** Attendance should be marked before the first period ends. The Overview will alert you if attendance is unmarked by mid-day.

---

## 9. Leave Requests

**Location:** Left sidebar → Scheduling → Leave Requests

Staff submit leave requests through their portal. This inbox shows all requests.

### Approving or Rejecting

1. Click a leave request.
2. Review details (type, dates, reason).
3. Check if a substitute is available for the affected periods.
4. Click **Approve** or **Reject** (enter a reason if rejecting).

After approval, the teacher's leave is reflected in the timetable as an uncovered period until you assign Emergency Cover.

---

## 10. Emergency Cover

**Location:** Left sidebar → Scheduling → Emergency Cover

Shows all periods that are uncovered because a teacher is absent.

**For each uncovered period:**
- Class, Period number, Subject, Teacher who is absent.
- Assign a substitute: select from available staff.
- Or mark as "Self-Managed" (principal/HOD covering).
- Or mark as "Cancelled" (period skipped today).

> **This appears in the Overview alert banner if any periods are uncovered.** Resolve all uncovered periods before the school day ends.

---

## 11. Exam Schedule

**Location:** Left sidebar → Scheduling → Exam Schedule

### Creating an Exam

1. Click **+ Schedule Exam**.
2. Enter: Exam name, Exam type (Unit Test, Term 1, Midterm, Final), Date and time, Grade and Section.
3. Assign a hall (optional).
4. Save.

The exam appears in the calendar view and is visible to students and parents through their portals.

### Conflict Detection

If two exams are scheduled for the same class at the same time, a red conflict badge appears. Resolve by changing one exam's date or time.

---

## 12. Announcements

**Location:** Left sidebar → Communication → Announcements

### Creating an Announcement

1. Click **+ New Announcement**.
2. Enter title and body (rich text editor — supports bold, lists, links).
3. Choose audience: All, Teachers Only, Parents Only, Specific Class.
4. Choose to publish now or schedule for a future date.
5. Click **Publish**.

Published announcements appear in the teacher and student/parent portals immediately.

### Managing Announcements

- Edit an announcement that hasn't been published yet.
- Archive old announcements (they stay in history but don't show to users).
- View read receipts — how many recipients have viewed it.

---

## 13. Export & Reports

**Location:** Left sidebar → Tools → Export & Reports

Generate bulk exports for any module:

| Export | Contents |
|--------|----------|
| Attendance Report | By class or student, for a date range |
| Student Roster | All students with contact details |
| Staff List | All staff with roles |
| Fee Ledger | Complete billing record |
| Timetable | Class-wise or teacher-wise schedule |
| Exam Schedule | Full exam calendar |

**Formats:** PDF, Excel (XLSX), CSV.

---

## 14. School Settings

**Location:** Left sidebar → Tools → School Settings

### What You Can Configure

- **School Info:** Name, type, city, country, phone, email.
- **Academic Calendar:** Current year label, start/end dates.
- **Holidays:** Add school holidays and events.
- **Grading System:** Percentage-based or grade-letter system.
- **Admin Users:** Add more admin staff with login access.
- **Notification Templates:** Customise email/SMS messages.

> **Only principals or senior admins should access this section.** Changes apply immediately.

---

## 15. Year Rollover

**Location:** Left sidebar → Tools → Year Rollover

Do this once per year, at the end of the academic year, **after completing Year-End in Fee Management.**

### What Rollover Does

1. Takes a permanent snapshot of all student records for this year.
2. Promotes every active student to the next grade.
3. Students in Grade 12 are marked as Graduated (status = Left).
4. Creates the new academic year.
5. Resets class assignments for the new year.

### Steps

1. Review the pre-rollover checklist (all boxes must be checked: exams done, fees closed, etc.).
2. Select the target academic year (e.g., 2026-27).
3. Review the promotion preview — which students go where.
4. Manually override any promotions (e.g., a student being retained in the same grade).
5. Click **Execute Rollover**.

> **This is a one-way operation. It cannot be undone.** Ensure all year-end work is complete before rolling over.

After rollover:
- The previous year becomes read-only.
- A new academic year is active.
- You must set up the new year's fee structure from scratch in Fee Management.

---

## 16. Common Questions & Troubleshooting

### "The fee setup tab says a step is missing. What do I do?"

The setup progress strip tells you exactly which step is incomplete. Work through the steps in order: (1) Add fee heads → (2) Set amounts for each grade → (3) Generate bills → (4) Lock. Do not skip steps.

### "A student was enrolled after I generated bills. Will they get bills?"

Yes. Go to Fee Setup tab and click **Generate for New (N)**. It will generate bills for any student enrolled after the last generate run. It will not duplicate existing bills.

### "A parent says they paid online but their status still shows Pending."

Go to the **Pending tab** in Fee Management. Find the payment, verify the transaction reference in your bank or gateway, then click Approve. The status will update to Paid.

### "A fee amount was set incorrectly after the plan was locked. How do I fix it?"

Use the **Amendment** process. Click the fee head card, choose Amend Amount, enter the correct amount and a reason. The amendment is permanent and audited.

### "A teacher is absent today and their periods show as uncovered."

Go to **Emergency Cover**. Assign a substitute teacher for each uncovered period. This clears the alert from the Overview.

### "I want to change the due date for a fee head."

The Due Day field on each fee head card is always editable (even when the plan is locked). Click the field, type the new day (1–28), and click away — it saves automatically. This affects only future bills generated after the change.

### "I need to reverse a payment that was recorded by mistake."

Go to the **Ledger tab**, find the payment entry, view Payment History, and click **Cancel Payment**. You must enter a reason. The ledger entry reverts to its previous status. This is permanently logged.

### "The Overview shows very high outstanding but I know most students have paid."

This usually means online payments are in Pending status and have not been verified. Go to the **Pending tab** and approve them. The outstanding amount will drop immediately.

---

*Document prepared by WLYL for school onboarding visits. For support contact your WLYL representative.*
