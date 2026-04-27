# WLYL Platform — API Reference

> **Base URL (Production):** `https://prototype-sunny3005s-projects.vercel.app`  
> **Base URL (Local dev):** `http://localhost:3000`  
> All API routes live under `/api/`

---

## Authentication

All protected routes check JWT cookies server-side. No Bearer tokens needed — cookies are set on login and automatically sent with every request.

| Cookie | Set by | Used by |
|---|---|---|
| `wlyl_auth` | `/api/auth/login` | School admin, Platform admin routes |
| `wlyl_teacher_auth` | `/api/teacher-auth/login` | Teacher routes |

---

## 1. Auth Routes

### `POST /api/auth/login`
Login for school admin or platform admin.

**Request body:**
```json
{ "email": "admin@school.com", "password": "xxx" }
// OR
{ "school_code": "wlyl-schl-abc-1", "password": "xxx" }
```

**Response:**
```json
{ "ok": true, "role": "school_admin", "schoolId": 1, "firstLogin": false }
```
Sets `wlyl_auth` httpOnly cookie.

---

### `POST /api/auth/logout`
Clears `wlyl_auth` cookie. No body required.

---

### `GET /api/auth/me`
Returns current session from cookie.

**Response:**
```json
{ "userId": 1, "role": "school_admin", "schoolId": 1, "firstLogin": false, "profileCompleted": true }
```

---

### `POST /api/auth/profile`
Update logged-in user's profile.

**Request body:**
```json
{ "full_name": "Ravi Kumar", "phone": "9876543210", "designation": "Principal", "bio": "..." }
```

---

### `POST /api/auth/change-password`
Change password for logged-in admin.

**Request body:**
```json
{ "current_password": "old", "new_password": "new" }
```

---

### `POST /api/auth/forgot-password`
Request a password reset email.

**Request body:**
```json
{ "email": "admin@school.com" }
```

---

### `POST /api/auth/reset-password`
Reset password using the token from email.

**Request body:**
```json
{ "token": "abc123...", "new_password": "newpass" }
```

---

### `POST /api/auth/setup-admin`
Initial one-time setup: create platform admin account. Only works if no users exist.

**Request body:**
```json
{ "email": "platform@wlyl.com", "password": "strong_pass" }
```

---

### `POST /api/teacher-auth/login`
Teacher login using employee_id.

**Request body:**
```json
{ "employee_id": "TCH001", "school_id": 1, "password": "xxx" }
```

**Response:**
```json
{ "ok": true, "teacherId": 5, "name": "Priya Sharma", "passwordChanged": true }
```
Sets `wlyl_teacher_auth` cookie.

---

### `POST /api/teacher-auth/logout`
Clears teacher cookie.

---

### `GET /api/teacher-auth/me`
Returns current teacher session.

---

## 2. Schools

### `GET /api/schools`
List all schools.

**Query params:**
- `scope` — `active` (default) | `inactive` | `deleted` | `all`
- `q` — search by name, city, code

**Response:** Array of `{ id, name, type, city, country, status, school_code, teacher_count, student_count, tier }`

---

### `POST /api/schools`
Create a new school.

**Request body:**
```json
{
  "name": "ABC School",
  "type": "Private",
  "city": "Hyderabad",
  "country": "India",
  "phone": "040-12345678",
  "email": "info@abcschool.com",
  "address": "123 Main St"
}
```

**Response:** `{ id, school_code, temp_password }` — also sends onboarding email.

---

### `GET /api/schools/[id]`
Get full school details.

---

### `PUT /api/schools/[id]`
Update school info (name, type, city, contact, logo_url, status).

---

### `GET /api/schools/[id]/subscription`
Get subscription tier and dates.

**Response:** `{ tier, plan_start_date, plan_end_date, plan_amount }`

---

### `POST /api/schools/[id]/subscription`
Update subscription.

**Request body:**
```json
{ "tier": "premium", "plan_start_date": "2025-01-01", "plan_end_date": "2025-12-31", "plan_amount": 50000 }
```

---

## 3. Teachers

### `GET /api/teachers`
List teachers for a school.

**Query params:**
- `school_id` (required)
- `staff_type` — `teaching` | `support`
- `department` — filter by department name

**Response:** Array of `{ id, name, email, subject, phone, employee_id, staff_type, department, qualification, date_of_joining, status, teaches_grades }`

---

### `POST /api/teachers`
Create a single teacher.

**Request body:**
```json
{
  "school_id": 1,
  "name": "Priya Sharma",
  "email": "priya@school.com",
  "subject": "Mathematics",
  "phone": "9876543210",
  "employee_id": "TCH001",
  "staff_type": "teaching",
  "department": "Science",
  "qualification": "M.Sc Mathematics",
  "date_of_joining": "2024-06-01"
}
```

---

### `POST /api/teachers/bulk`
Bulk create from CSV.

**Request body:**
```json
{ "school_id": 1, "csv_data": "name,email,subject,phone,employee_id\nPriya,priya@x.com,Math,9876,TCH001" }
```

---

### `GET /api/teachers/[id]`
Get teacher details.

---

### `PUT /api/teachers/[id]`
Update teacher fields. Same body as POST but all fields optional.

---

### `POST /api/teachers/[id]/reset-password`
Admin resets teacher password to a generated temp password.

**Response:** `{ temp_password: "abc123" }`

---

### `POST /api/teachers/[id]/change-password`
Teacher changes own password.

**Request body:** `{ "current_password": "old", "new_password": "new" }`

---

### `GET /api/teacher-availability`
Get a teacher's free slots (useful for assigning substitutes).

**Query params:** `teacher_id`, `school_id`

**Response:** Array of `{ day_of_week, period_number, time_from, time_to }` (free slots only)

---

## 4. Students

### `GET /api/students`
List students.

**Query params:** `school_id` (required), `grade`, `section`

**Response:** Array of `{ id, name, email, grade, section, roll_number, parent_name, parent_phone, status }`

---

### `POST /api/students`
Create single student.

**Request body:**
```json
{
  "school_id": 1,
  "name": "Arjun Kumar",
  "grade": "7",
  "section": "A",
  "roll_number": "wlyl-stu-abc-001",
  "email": "arjun@school.com",
  "parent_name": "Ramesh Kumar",
  "parent_phone": "9876543210",
  "parent_email": "ramesh@gmail.com"
}
```

---

### `POST /api/students/bulk`
Bulk create from CSV.

**Request body:** `{ "school_id": 1, "csv_data": "name,grade,section,parent_name,parent_phone\n..." }`

---

### `GET /api/students/[id]`
Get student profile.

---

### `PUT /api/students/[id]`
Update student fields.

---

### `POST /api/students/[id]/change-password`
Student changes own portal password.

---

### `GET /api/students/[id]/exams`
Get all exam marks for this student.

**Response:** Array of `{ exam_name, exam_type, exam_date, status, subjects: [{ subject_name, marks_obtained, max_marks, is_absent }] }`

---

### `GET /api/students/[id]/rewards`
Get student's points, badges, streak.

**Response:** `{ total_points, current_streak, longest_streak, badges: [{ badge_type, earned_at }], recent_points: [...] }`

---

### `GET /api/students/[id]/submissions`
All task submissions by this student.

---

### `POST /api/students/promote`
Year rollover: promote students one grade up.

**Request body:**
```json
{ "school_id": 1, "academic_year_id": 3, "promotions": [{ "student_id": 10, "new_grade": "8", "new_section": "A" }] }
```

---

## 5. Classes

### `GET /api/classes`
List classes for a school.

**Query params:** `school_id` (required), `grade`, `section`

**Response:** Array of `{ id, grade, section, class_teacher_id, class_teacher_name, student_count, timetable_generated_at }`

---

### `POST /api/classes`
Create a class.

**Request body:** `{ "school_id": 1, "grade": "7", "section": "A", "class_teacher_id": 5 }`

---

### `GET /api/classes/[id]`
Get class with subjects and teacher assignments.

---

### `GET /api/classes/[id]/subjects`
Get all subjects for a class.

**Response:** Array of `{ id, subject_name, teacher_id, teacher_name, periods_per_week }`

---

### `POST /api/classes/[id]/subjects`
Add or update a subject in a class.

**Request body:** `{ "subject_name": "Mathematics", "teacher_id": 5, "periods_per_week": 5 }`

---

### `POST /api/classes/sync`
Auto-create classes based on distinct grade+section combinations in students table.

**Request body:** `{ "school_id": 1 }`

---

### `GET /api/classes/[id]/health`
Timetable health check for one class.

**Response:** `{ conflicts: [...], uncovered_periods: [...], teacher_overlaps: [...] }`

---

### `GET /api/classes/[id]/performance`
Academic performance analytics for a class.

**Response:** `{ avg_marks, attendance_pct, task_submission_rate, top_students: [...] }`

---

## 6. Timetable

### `POST /api/class-timetable/generate`
Generate timetable for one or all classes.

**Request body:**
```json
{
  "school_id": 1,
  "class_id": 5,
  "force_replace": false,
  "schedule_settings": {
    "periods_per_day": 8,
    "start_time": "08:30",
    "end_time": "17:00",
    "morning_break_after_period": 3,
    "morning_break_duration": 15,
    "lunch_after_period": 5,
    "lunch_duration": 45
  }
}
```

---

### `GET /api/class-timetable`
Get class timetable.

**Query params:** `class_id` (required), `school_id`

**Response:** Array of `{ day_of_week, period_number, time_from, time_to, subject_name, teacher_id, teacher_name, room, is_break, break_label }`

---

### `POST /api/class-timetable/swap`
Swap two periods in a class timetable.

**Request body:**
```json
{
  "class_id": 5,
  "school_id": 1,
  "slot_a": { "day_of_week": "Monday", "period_number": 1 },
  "slot_b": { "day_of_week": "Monday", "period_number": 2 }
}
```

---

### `POST /api/class-timetable/circulate`
Publish timetable (sets `timetable_circulated_at`, notifies teachers and students).

**Request body:** `{ "class_id": 5, "school_id": 1 }`

---

### `POST /api/class-timetable/validate`
Check for conflicts before publishing.

**Request body:** `{ "school_id": 1, "class_id": 5 }`

**Response:** `{ valid: true/false, conflicts: [...], warnings: [...] }`

---

### `GET /api/class-timetable/health`
School-wide timetable health.

**Query params:** `school_id`

**Response:** `{ total_classes, classes_with_timetable, uncovered_classes, teacher_conflicts: [...] }`

---

### `POST /api/class-timetable/sync`
Sync class timetable to teacher view (`timetable` table).

---

### `GET /api/timetable`
Teacher's personal timetable view.

**Query params:** `teacher_id`, `school_id`

**Response:** Array of `{ day_of_week, period_number, time_from, time_to, subject, grade, section, room }`

---

### `GET /api/timetable-modes`
Get class timetable mode (slave/master/independent).

---

### `GET /api/schedule-templates`
List named schedule templates for a school.

**Query params:** `school_id`

---

### `POST /api/schedule-templates`
Save a schedule as a named template.

**Request body:** `{ "school_id": 1, "name": "Full Day", "settings": { ...schedule_settings } }`

---

### `GET /api/timetable-versions`
List all timetable versions.

---

### `POST /api/timetable-versions/[id]/circulate`
Publish a specific timetable version.

---

## 7. Attendance

### `GET /api/attendance`
Flexible attendance query — 6 modes:

| Mode | Query params | Returns |
|---|---|---|
| Single day | `class_id`, `date`, `session` | Per-student status for that session |
| Full month | `class_id`, `month` (YYYY-MM) | All days, both sessions |
| Previous date | `class_id`, `previous=true`, `session` | Last recorded attendance date |
| School-wide | `school_id`, `date`, `view=school` | All classes' status for the day |
| Summary | `class_id`, `date`, `summary=true` | Present/absent/late counts per session |
| Student history | `student_id` | Student's full attendance history |

**Response (single day):** Array of `{ student_id, name, roll_number, status, marked_by, marked_at }`

---

### `POST /api/attendance`
Mark attendance for a class.

**Request body:**
```json
{
  "class_id": 5,
  "school_id": 1,
  "teacher_id": 3,
  "date": "2025-04-16",
  "session": "morning",
  "attendance": [
    { "student_id": 10, "status": "present" },
    { "student_id": 11, "status": "absent" }
  ]
}
```

---

### `GET /api/attendance/analytics`
Monthly or yearly attendance trends.

**Query params:** `school_id`, `class_id`, `year`, `month` (optional)

---

## 8. Leave Requests

### `GET /api/leave-requests`
List leave requests.

**Query params:** `school_id`, `teacher_id` (optional), `status` (`pending`|`approved`|`rejected`|`all`)

**Response:** Array of `{ id, teacher_id, teacher_name, leave_type, start_date, end_date, reason, status, reviewed_at }`

---

### `POST /api/leave-requests`
Submit a leave request.

**Request body:**
```json
{
  "teacher_id": 3,
  "school_id": 1,
  "leave_type": "sick",
  "start_date": "2025-04-20",
  "end_date": "2025-04-22",
  "reason": "Medical appointment"
}
```

---

### `PUT /api/leave-requests/[id]`
Approve or reject a leave request.

**Request body:** `{ "status": "approved" }` or `{ "status": "rejected" }`

---

## 9. Substitute Assignments (Emergency Cover)

### `GET /api/substitutes`
List substitute assignments for a school.

**Query params:** `school_id`, `date` (optional)

---

### `POST /api/substitutes`
Assign a substitute teacher.

**Request body:**
```json
{
  "school_id": 1,
  "leave_request_id": 10,
  "original_teacher_id": 3,
  "substitute_teacher_id": 7,
  "class_id": 5,
  "date": "2025-04-20",
  "day_of_week": "Monday",
  "period_number": 2,
  "subject_name": "Mathematics",
  "time_from": "09:25",
  "time_to": "10:20"
}
```

---

## 10. Tasks & Submissions

### `GET /api/tasks`
List tasks.

**Query params:** `school_id`, `class_id`, `teacher_id`, `status` (`draft`|`published`|`all`)

**Response:** Array of `{ id, title, subject, task_type, max_marks, due_date, due_time, status, submission_count, total_students }`

---

### `POST /api/tasks`
Create a task.

**Request body:**
```json
{
  "school_id": 1,
  "class_id": 5,
  "teacher_id": 3,
  "title": "Chapter 5 Worksheet",
  "subject": "Mathematics",
  "task_type": "homework",
  "max_marks": 10,
  "instructions": "Solve problems 1-20 from page 85.",
  "assigned_to": "all",
  "status": "published",
  "due_date": "2025-04-20",
  "due_time": "23:59"
}
```

---

### `PUT /api/tasks/[id]`
Update task (same fields as POST).

---

### `DELETE /api/tasks/[id]`
Delete a task (soft or hard).

---

### `POST /api/tasks/[id]/remind`
Send reminder to students who haven't submitted.

**Request body:**
```json
{ "target_type": "all" }
// or
{ "target_type": "selected", "student_ids": [10, 11, 12] }
```

---

### `GET /api/tasks/[id]/submissions`
Get all submissions for a task.

**Response:** Array of `{ student_id, name, roll_number, submitted_at, score, feedback, status, file_url }`

---

### `POST /api/tasks/[id]/submissions`
Submit a task (student action).

**Request body:**
```json
{
  "student_id": 10,
  "submission_text": "My answer is...",
  "file_url": "https://cloudinary.com/...",
  "file_name": "homework.pdf",
  "file_size_kb": 250
}
```

---

### `PUT /api/tasks/[id]/submissions/[sid]`
Grade a submission (teacher action).

**Request body:**
```json
{
  "score": 8.5,
  "feedback": "Good work! Watch your steps in Q3.",
  "status": "reviewed",
  "resubmission_requested": false
}
```

---

## 11. Exams & Marks

### `GET /api/exams`
List exams.

**Query params:** `school_id`, `class_id`, `teacher_id`, `status`

**Response:** Array of `{ id, exam_name, exam_type, exam_date, status, class_name, created_by_name }`

---

### `POST /api/exams`
Create an exam.

**Request body:**
```json
{
  "school_id": 1,
  "class_id": 5,
  "created_by": 3,
  "exam_name": "Unit Test 1",
  "exam_type": "unit_test",
  "exam_date": "2025-04-25",
  "passing_pct": 35
}
```

---

### `GET /api/exams/[id]/subjects`
Get subjects in an exam with marks entry status.

---

### `POST /api/exams/[id]/subjects`
Add a subject to an exam.

**Request body:**
```json
{ "subject_name": "Mathematics", "teacher_id": 3, "max_marks": 100 }
```

---

### `GET /api/exams/[id]/marks`
Get all marks for an exam.

**Response:** Array of `{ student_id, student_name, roll_number, marks: { subject: marks_obtained } }`

---

### `POST /api/exams/[id]/marks`
Enter marks for a subject.

**Request body:**
```json
{
  "subject_name": "Mathematics",
  "entered_by": 3,
  "marks": [
    { "student_id": 10, "marks_obtained": 85, "is_absent": false },
    { "student_id": 11, "marks_obtained": 0, "is_absent": true }
  ]
}
```

---

### `POST /api/exams/[id]/publish`
Publish exam marks (freezes marks, sends notifications to parents).

---

### `POST /api/exams/[id]/acknowledge`
Parent acknowledges seeing marks.

**Request body:** `{ "student_id": 10, "parent_name": "Ramesh Kumar", "parent_phone": "9876543210" }`

---

### `GET /api/exams/calendar`
Get exam calendar for a date range.

**Query params:** `school_id`, `from_date`, `to_date`

---

## 12. Doubts (Q&A System)

### `GET /api/doubts`
List doubts.

**Query params:** `school_id`, `class_id`, `student_id`, `status` (`open`|`in_progress`|`resolved`), `subject`, `is_faq` (true/false)

**Response:** Array of `{ id, student_name, question, subject, status, ai_answer, message_count, upvote_count, is_class_faq, last_message_at }`

---

### `POST /api/doubts`
Ask a doubt (student action).

**Request body:**
```json
{
  "school_id": 1,
  "class_id": 5,
  "student_id": 10,
  "subject": "Mathematics",
  "question": "I don't understand how to find LCM...",
  "task_id": 25
}
```

---

### `PUT /api/doubts/[id]`
Update doubt status or toggle FAQ.

**Request body:** `{ "status": "resolved", "is_class_faq": true }`

---

### `GET /api/doubts/[id]/messages`
Get all chat messages for a doubt.

---

### `POST /api/doubts/[id]/messages`
Add a message to the doubt chat.

**Request body:**
```json
{
  "sender_type": "teacher",
  "sender_id": 3,
  "sender_name": "Priya Sharma",
  "message": "LCM is the smallest number divisible by both...",
  "is_final_answer": true
}
```

---

### `POST /api/doubts/[id]/upvote`
Student upvotes a doubt.

**Request body:** `{ "student_id": 10 }`

---

### `GET /api/doubts/peers`
Get anonymised class FAQ doubts for peer learning.

**Query params:** `class_id`, `school_id`, `subject` (optional)

---

## 13. Syllabus

### `GET /api/syllabus`
Get syllabus topics.

**Query params:** `school_id`, `class_id`, `subject` (optional)

**Response:** Array of `{ id, chapter_name, chapter_order, topic_name, topic_order, status, covered_date, covered_by_name }`

---

### `POST /api/syllabus`
Create syllabus from curriculum template for a class.

**Request body:** `{ "school_id": 1, "class_id": 5, "curriculum_type": "CBSE" }`

---

### `PUT /api/syllabus/[id]`
Mark a topic as covered.

**Request body:** `{ "status": "covered", "covered_date": "2025-04-16", "covered_by": 3 }`

---

### `GET /api/syllabus/analytics`
Coverage analytics per subject.

**Query params:** `school_id`, `class_id`

**Response:** Array of `{ subject, total_topics, covered_topics, coverage_pct }`

---

## 14. Fees

### `GET /api/fees/categories`
List fee categories for a school.

**Query params:** `school_id`

---

### `POST /api/fees/categories`
Create a fee category.

**Request body:**
```json
{
  "school_id": 1,
  "name": "Tuition Fee",
  "description": "Monthly tuition charges",
  "frequency": "monthly"
}
```

---

### `GET /api/fees/structures`
Get fee structures for a school and academic year.

**Query params:** `school_id`, `academic_year`

**Response:** Array of `{ id, category_name, grade, amount, due_day, frequency }`

---

### `POST /api/fees/structures`
Upsert fee structure rows (set fee amount per grade per category).

**Request body:**
```json
{
  "school_id": 1,
  "academic_year": "2025-26",
  "structures": [
    { "fee_category_id": 1, "grade": "7", "amount": 5000, "due_day": 10 }
  ]
}
```

---

### `GET /api/fees/ledger`
Get fee ledger for a student.

**Query params:** `school_id`, `student_id`, `academic_year`

---

### `POST /api/fees/generate`
Generate ledger entries for all students based on fee structures.

**Request body:** `{ "school_id": 1, "academic_year": "2025-26" }`

---

### `GET /api/fees/payments`
Payment history.

**Query params:** `school_id`, `student_id`

---

### `POST /api/fees/payments`
Record a payment.

**Request body:**
```json
{
  "school_id": 1,
  "student_id": 10,
  "ledger_id": 45,
  "amount": 5000,
  "payment_mode": "online",
  "receipt_number": "RCP2025001",
  "transaction_ref": "UPI-TXN-1234567890",
  "paid_date": "2025-04-10",
  "collected_by_name": "Office Staff"
}
```

---

### `POST /api/fees/waivers`
Grant a fee waiver.

**Request body:**
```json
{
  "school_id": 1,
  "student_id": 10,
  "ledger_id": 45,
  "waiver_type": "percentage",
  "waiver_value": 50,
  "reason": "Scholarship",
  "granted_by_name": "Principal"
}
```

---

### `GET /api/fees/stats`
Fee collection statistics.

**Query params:** `school_id`, `academic_year`

**Response:** `{ total_billed, total_collected, collection_pct, overdue_count, pending_count }`

---

## 15. Announcements

### `GET /api/announcements`
List announcements.

**Query params:** `school_id`, `audience` (`all` | `teachers` | `students` | `parents`)

The audience filter matches: `target_audience = 'all'` OR `target_audience` contains the specific audience.

**Response:** Array of `{ id, title, content, announcement_type, target_audience, priority, created_by_name, expires_at, created_at }`

---

### `POST /api/announcements`
Create an announcement.

**Request body:**
```json
{
  "school_id": 1,
  "created_by": 1,
  "title": "School Closed Tomorrow",
  "content": "Due to elections, school will be closed on April 17.",
  "announcement_type": "general",
  "target_audience": "all",
  "priority": "high",
  "expires_at": "2025-04-17"
}
```

**Audience values:**
- `"all"` — everyone
- `"teachers"` — teachers only
- `"students"` — students only
- `"parents"` — parents only
- `"teachers,students"` — both (auto-normalised to `"all"` if all 3 are selected)

---

### `PUT /api/announcements/[id]`
Update announcement.

---

### `DELETE /api/announcements/[id]`
Delete announcement.

---

## 16. Notifications

### `GET /api/notifications`
Get notifications for the current user.

**Query params:** `page`, `limit`

**Response:** Array of `{ id, type, title, message, is_read, created_at, data }`

---

### `POST /api/notifications`
Mark notifications as read.

**Request body:** `{ "ids": [1, 2, 3] }` or `{ "all": true }`

---

## 17. Daily Newspaper

### `GET /api/newspapers/today`
Get today's newspaper for a school.

**Query params:** `school_id`

**Response:** `{ id, title, subtitle, content, fun_fact, quiz_question, quiz_answer, topic, category }`

---

### `POST /api/newspapers/[id]/read`
Mark newspaper as read and award points.

**Request body:** `{ "student_id": 10, "school_id": 1, "quiz_answer": "42" }`

**Response:** `{ points_awarded, quiz_correct, total_points }`

---

## 18. Student Rewards

### `GET /api/leaderboard`
Get student leaderboard.

**Query params:** `school_id`, `class_id` (optional), `period` (`month` | `all`)

**Response:** Array of `{ rank, student_id, name, total_points, current_streak, badge_count, badges: [...] }`

---

## 19. Parent Portal

### `GET /api/parent/child-summary`
Full summary for a parent.

**Query params:** `student_id`, `school_id`

**Response:**
```json
{
  "student": { "name", "grade", "section", "roll_number" },
  "attendance": { "present_pct", "total_days", "present_days", "absent_days" },
  "recent_exams": [{ "exam_name", "subjects": [{ "name", "marks", "max_marks" }] }],
  "pending_tasks": [{ "title", "subject", "due_date" }],
  "announcements": [...]
}
```

---

### `GET /api/parent/attendance`
Child's attendance calendar.

**Query params:** `student_id`, `school_id`, `month` (YYYY-MM)

---

### `GET /api/parent/fees`
Child's fee ledger and payment history.

**Query params:** `student_id`, `school_id`, `academic_year`

---

### `GET /api/parent/activity`
Child's learning activity timeline.

**Query params:** `student_id`, `school_id`

---

### `GET /api/parent/timetable`
Child's class timetable.

**Query params:** `student_id`, `school_id`

---

### `GET /api/parent/engagement`
Parent engagement metrics for school.

**Query params:** `school_id`

---

## 20. Academic Years & Rollover

### `GET /api/academic-years`
List academic years for a school.

**Query params:** `school_id`

---

### `POST /api/academic-years`
Create a new academic year.

**Request body:**
```json
{ "school_id": 1, "label": "2025-26", "start_date": "2025-06-01", "end_date": "2026-03-31" }
```

---

### `POST /api/academic-years/rollover`
Execute year rollover: promotes students, archives history, creates new academic year.

**Request body:** `{ "school_id": 1, "from_year_id": 3, "to_label": "2025-26" }`

---

## 21. School Calendar

### `GET /api/school-calendar`
Get calendar events.

**Query params:** `school_id`, `from_date`, `to_date`

---

### `POST /api/school-calendar`
Create calendar event.

**Request body:**
```json
{
  "school_id": 1,
  "title": "Sports Day",
  "event_date": "2025-11-15",
  "end_date": "2025-11-15",
  "event_type": "event",
  "color": "green",
  "description": "Annual sports competition",
  "all_day": true
}
```

---

### `PUT /api/school-calendar/[id]` / `DELETE /api/school-calendar/[id]`
Update or delete a calendar event.

---

## 22. School Schedule Settings

### `GET /api/school-schedule`
Get schedule settings for a school.

**Query params:** `school_id`

**Response:** `{ periods_per_day, start_time, end_time, morning_break_after_period, morning_break_duration, lunch_after_period, lunch_duration, ... }`

---

### `PUT /api/school-schedule`
Update schedule settings.

**Request body:**
```json
{
  "school_id": 1,
  "periods_per_day": 8,
  "start_time": "08:30",
  "end_time": "17:00",
  "morning_break_after_period": 3,
  "morning_break_duration": 15,
  "lunch_after_period": 5,
  "lunch_duration": 45,
  "afternoon_break_after_period": 7,
  "afternoon_break_duration": 10
}
```

---

## 23. Admin Overview & Briefing

### `GET /api/admin/overview`
Batched dashboard data (replaces 9 individual API calls).

**Query params:** `school_id`, `features` (comma-separated: `attendance,leave,cover,timetable,exams,fees`), `date` (YYYY-MM-DD), `year`

**Response:**
```json
{
  "core": { "teachers": 45, "students": 800, "classes": 24 },
  "leaves": { "pending": 3, "approved_today": 1 },
  "uncovered": { "count": 2, "periods": [...] },
  "attendance": { "marked_classes": 20, "total_classes": 24 },
  "timetable": { "generated": 22, "conflicts": 0 },
  "exams": { "upcoming": 3, "pending_marks": 1 },
  "fees": { "collection_pct": 75, "overdue_count": 12 }
}
```

---

### `GET /api/admin/briefing`
Daily morning briefing.

**Query params:** `school_id`, `date`

---

## 24. Platform Admin

### `GET /api/platform/stats`
Platform-wide statistics.

**Response:** `{ total_schools, active_schools, total_teachers, total_students, subscriptions: { none, basic, standard, premium } }`

---

### `GET /api/platform/audit`
Audit log.

**Query params:** `page`, `limit`, `action`, `entity_type`, `from_date`, `to_date`

---

### `GET /api/platform/features`
Feature matrix per tier.

---

### `PUT /api/platform/features`
Update feature enablement for a tier.

**Request body:**
```json
{ "feature_key": "fee-management", "tier": "standard", "enabled": true }
```

---

### `POST /api/platform/schools/reset-password`
Reset a school admin's password.

**Request body:** `{ "school_id": 1 }`

**Response:** `{ temp_password: "abc123" }` + sends email.

---

## 25. Display / Kiosk

### `POST /api/display-token`
Generate a kiosk token for TV display.

**Request body:** `{ "school_id": 1, "label": "Main Lobby" }`

**Response:** `{ token: "64-char-hex-token" }`

---

### `GET /api/display-data`
Get data for TV display (used by kiosk without login).

**Query params:** `token` (the display token)

**Response:** `{ school, timetable_summary, announcements, attendance_summary }`

---

## 26. File Upload

### `POST /api/upload/sign`
Get a signed Cloudinary upload URL.

**Request body:** `{ "public_id": "submissions/task_25_student_10" }`

**Response:** `{ signature, timestamp, cloud_name, api_key, upload_url }`

---

## 27. Exports

### `POST /api/export/marks`
Export marks to PDF.

**Request body:** `{ "school_id": 1, "exam_id": 5, "class_id": 3, "format": "pdf" }`

**Response:** PDF file download.

---

### `POST /api/export/attendance`
Export attendance to PDF.

**Request body:** `{ "school_id": 1, "class_id": 3, "month": "2025-04", "format": "pdf" }`

---

## 28. Other

### `POST /api/init`
Initialize database — runs all CREATE TABLE migrations. Called on app startup from `instrumentation.ts`.

---

### `GET /api/year-review`
Year-in-review report with all metrics.

**Query params:** `school_id`, `academic_year`

---

### `GET /api/curriculum`
List available curricula and their syllabi.

**Response:** `[{ type: "CBSE", grades: [{ grade: "7", subjects: [...] }] }]`
