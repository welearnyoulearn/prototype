# WLYL Platform — Role & Permission Matrix

> Last updated: 2026-04-16

---

## The 5 Roles

| Role | How They Log In | Scope |
|---|---|---|
| **Platform Admin** | Email + password → `/api/auth/login` | Entire platform (all schools) |
| **School Admin** | school_code + password → `/api/auth/login` | Their school only |
| **Teacher** | employee_id + password → `/api/teacher-auth/login` | Their assigned classes only |
| **Student** | Dropdown selection (partial auth) | Their own data only |
| **Parent** | Phone + child roll lookup | Their child's data only |

---

## Permission Legend

| Symbol | Meaning |
|---|---|
| ✅ | Full access (read + write + delete) |
| 👁 | Read only |
| ✏️ | Can create/edit own records only |
| ⚡ | Trigger/action only (e.g. approve, publish) |
| ❌ | No access |
| 🔒 | Access gated by subscription tier |

---

## 1. School & Platform Management

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| View all schools | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create school | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit school details | ✅ | 👁 own school | ❌ | ❌ | ❌ |
| Soft-delete / reactivate school | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage subscription tier | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configure feature flags per tier | ✅ | ❌ | ❌ | ❌ | ❌ |
| View platform audit log | ✅ | ❌ | ❌ | ❌ | ❌ |
| View platform stats | ✅ | ❌ | ❌ | ❌ | ❌ |
| Reset school admin password | ✅ | ❌ | ❌ | ❌ | ❌ |
| View school settings | ❌ | ✅ | 👁 | ❌ | ❌ |
| Edit school settings | ❌ | ✅ | ❌ | ❌ | ❌ |
| Configure schedule settings | ❌ | ✅ | ❌ | ❌ | ❌ |
| Manage subject templates | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 2. Teachers

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| View teacher list | 👁 (via stats) | ✅ | 👁 (own school) | ❌ | ❌ |
| Add teacher (individual) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Bulk import teachers (CSV) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Edit teacher profile | ❌ | ✅ | ✏️ own profile | ❌ | ❌ |
| Soft-delete teacher | ❌ | ✅ | ❌ | ❌ | ❌ |
| Reset teacher password | ❌ | ✅ | ❌ | ❌ | ❌ |
| Change own password | ❌ | ❌ | ✅ | ❌ | ❌ |
| View teacher availability | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 3. Students

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| View student list | 👁 (via stats) | ✅ | ✅ assigned classes | ❌ | ❌ |
| Add student (individual) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Bulk import students (CSV) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Edit student profile | ❌ | ✅ | ❌ | ✏️ own | ❌ |
| Promote students (year rollover) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Change student password | ❌ | ✅ | ❌ | ✏️ own | ❌ |
| View student's marks | ❌ | ✅ | ✅ their subject | ✅ own | ✅ own child |
| View student's attendance | ❌ | ✅ | ✅ their class | 👁 own | ✅ own child |
| View student's tasks | ❌ | ✅ | ✅ their class | ✅ own | 👁 own child |
| View student rewards | ❌ | ✅ | 👁 | ✅ own | ❌ |

---

## 4. Classes

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| View class list | ❌ | ✅ | ✅ assigned | ❌ | ❌ |
| Create class | ❌ | ✅ | ❌ | ❌ | ❌ |
| Assign class teacher | ❌ | ✅ | ❌ | ❌ | ❌ |
| Add subjects to class | ❌ | ✅ | ❌ | ❌ | ❌ |
| Assign teacher to subject | ❌ | ✅ | ❌ | ❌ | ❌ |
| View class subjects | ❌ | ✅ | ✅ own | 👁 own class | 👁 child's class |
| View class performance analytics | ❌ | ✅ | ✅ own | ❌ | ❌ |
| Sync classes from students | ❌ | ✅ | ❌ | ❌ | ❌ |
| View class timetable | ❌ | ✅ | ✅ assigned | ✅ own class | ✅ child's class |

---

## 5. Timetable

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Generate timetable | ❌ | ✅ | ❌ | ❌ | ❌ |
| View class timetable | ❌ | ✅ | ✅ own | ✅ own class | ✅ child's |
| View teacher timetable | ❌ | ✅ | ✅ own | ❌ | ❌ |
| Swap timetable periods | ❌ | ✅ | ❌ | ❌ | ❌ |
| Publish / circulate timetable | ❌ | ✅ | ❌ | ❌ | ❌ |
| Manage schedule templates | ❌ | ✅ | ❌ | ❌ | ❌ |
| Set timetable mode (master/slave) | ❌ | ✅ | ❌ | ❌ | ❌ |
| View timetable health / conflicts | ❌ | ✅ | ❌ | ❌ | ❌ |
| Set teacher unavailability | ❌ | ✅ | ❌ | ❌ | ❌ |
| View timetable versions | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 6. Attendance

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Mark attendance (school-wide view) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Mark attendance (own class) | ❌ | ✅ | ✅ assigned class | ❌ | ❌ |
| View attendance per class | ❌ | ✅ | ✅ own class | 👁 own | 👁 child's |
| View school-wide attendance status | ❌ | ✅ | ❌ | ❌ | ❌ |
| View attendance analytics | ❌ | ✅ | ✅ own class | ❌ | ❌ |
| View student's attendance history | ❌ | ✅ | ✅ own class | 👁 own | ✅ child's |

---

## 7. Leave & Emergency Cover

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Submit leave request | ❌ | ❌ | ✅ own | ❌ | ❌ |
| View own leave requests | ❌ | ❌ | ✅ own | ❌ | ❌ |
| View all leave requests | ❌ | ✅ | ❌ | ❌ | ❌ |
| Approve / reject leave request | ❌ | ✅ | ❌ | ❌ | ❌ |
| View substitute assignments | ❌ | ✅ | 👁 own | ❌ | ❌ |
| Assign substitute teacher | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 8. Tasks

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| View all tasks in school | ❌ | ✅ | ❌ | ❌ | ❌ |
| Create task | ❌ | ❌ | ✅ own class | ❌ | ❌ |
| Edit / delete own task | ❌ | ✅ | ✏️ own | ❌ | ❌ |
| Publish task to class | ❌ | ❌ | ✅ | ❌ | ❌ |
| View published tasks | ❌ | ✅ | ✅ own | ✅ own class | 👁 child's |
| Submit task | ❌ | ❌ | ❌ | ✅ own | ❌ |
| Grade submission | ❌ | ❌ | ✅ own task | ❌ | ❌ |
| Request resubmission | ❌ | ❌ | ✅ | ❌ | ❌ |
| Send task reminders | ❌ | ❌ | ✅ own task | ❌ | ❌ |
| View submissions for task | ❌ | ✅ | ✅ own task | 👁 own | ❌ |

---

## 9. Exams & Marks

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Create exam | ❌ | ✅ | ✅ own class | ❌ | ❌ |
| Add subject to exam | ❌ | ✅ | ✅ own | ❌ | ❌ |
| Enter marks (own subject) | ❌ | ✅ | ✅ own subject | ❌ | ❌ |
| Enter marks (any subject) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Publish exam marks | ❌ | ✅ | ❌ | ❌ | ❌ |
| View exam marks | ❌ | ✅ | ✅ own class | ✅ own | ✅ child's |
| View exam calendar | ❌ | ✅ | ✅ | ✅ | 👁 |
| Acknowledge marks (parent action) | ❌ | ❌ | ❌ | ❌ | ✅ child's |
| View marks analytics | ❌ | ✅ | ✅ own class | 👁 own | ❌ |

---

## 10. Doubts

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Ask a doubt | ❌ | ❌ | ❌ | ✅ | ❌ |
| View own doubts | ❌ | ❌ | ❌ | ✅ own | ❌ |
| View class doubts | ❌ | ✅ | ✅ assigned class | 👁 FAQs only | ❌ |
| Answer a doubt | ❌ | ❌ | ✅ | ❌ | ❌ |
| Send message in doubt chat | ❌ | ❌ | ✅ | ✅ own doubt | ❌ |
| Mark doubt as resolved | ❌ | ❌ | ✅ | ❌ | ❌ |
| Set doubt as class FAQ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Upvote a doubt | ❌ | ❌ | ❌ | ✅ | ❌ |
| View peer FAQs (anonymised) | ❌ | ❌ | ❌ | ✅ own class | ❌ |

---

## 11. Syllabus

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Create syllabus from template | ❌ | ✅ | ❌ | ❌ | ❌ |
| View syllabus topics | ❌ | ✅ | ✅ own class | ✅ own class | ❌ |
| Mark topic as covered | ❌ | ❌ | ✅ assigned | ❌ | ❌ |
| View coverage analytics | ❌ | ✅ | ✅ own class | ❌ | ❌ |
| Assign curriculum type to grade | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 12. Fee Management

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| View fee categories | ❌ | ✅ | ❌ | ❌ | ❌ |
| Create / edit fee categories | ❌ | ✅ | ❌ | ❌ | ❌ |
| Set fee structures by grade | ❌ | ✅ | ❌ | ❌ | ❌ |
| Generate fee ledger entries | ❌ | ✅ | ❌ | ❌ | ❌ |
| Record payment | ❌ | ✅ | ❌ | ❌ | ❌ |
| Grant fee waiver | ❌ | ✅ | ❌ | ❌ | ❌ |
| View student fee ledger | ❌ | ✅ | ❌ | ❌ | ✅ child's |
| View fee collection stats | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 13. Announcements

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Create announcement | ❌ | ✅ | ❌ | ❌ | ❌ |
| Edit / delete announcement | ❌ | ✅ | ❌ | ❌ | ❌ |
| View announcements (all) | ❌ | ✅ | 👁 teacher-targeted | 👁 student-targeted | 👁 parent-targeted |
| Set audience targeting | ❌ | ✅ | ❌ | ❌ | ❌ |
| Set priority / expiry | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 14. Notifications

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Receive notifications | ❌ | ✅ school-wide | ✅ teacher-specific | ✅ student-specific | ❌ |
| Mark notifications as read | ❌ | ✅ own | ✅ own | ✅ own | ❌ |
| View notification history | ❌ | ✅ all school | ✅ own | ✅ own | ❌ |
| System sends notifications for: | — | Timetable changes, leave approvals | Timetable, task reminders, exam updates | Task due, marks published, doubt answered | Marks published |

---

## 15. Rewards & Gamification

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| View leaderboard | ❌ | ✅ | 👁 | ✅ | ❌ |
| View own points / badges | ❌ | ❌ | ❌ | ✅ own | ❌ |
| Award points (automatic) | ❌ | ❌ | ❌ | — (system) | ❌ |
| View rewards analytics | ❌ | ✅ | ✅ own class | ❌ | ❌ |

**Automatic point triggers (system, not user-initiated):**
- Student submits task → +5 pts
- Student scores ≥80% on task → +10 pts
- Doubt resolved → +5 pts
- Reads newspaper → +1 pt
- Correct quiz answer → +2 pts, wrong → -1 pt
- 7-day streak → +20 pts
- 30-day streak → +50 pts

---

## 16. Daily Newspaper

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| View today's newspaper | ❌ | 👁 | ❌ | ✅ | ❌ |
| Mark as read (earn points) | ❌ | ❌ | ❌ | ✅ | ❌ |
| Answer quiz (earn points) | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 17. Academic Calendar

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Create / edit events | ❌ | ✅ | ❌ | ❌ | ❌ |
| Delete events | ❌ | ✅ | ❌ | ❌ | ❌ |
| View calendar | ❌ | ✅ | ✅ | ✅ | ✅ |

---

## 18. Year Rollover & Academic Years

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Create academic year | ❌ | ✅ | ❌ | ❌ | ❌ |
| Execute year rollover | ❌ | ✅ | ❌ | ❌ | ❌ |
| View rollover history | ❌ | ✅ | ❌ | ❌ | ❌ |
| View student class history | ❌ | ✅ | ❌ | 👁 own | ❌ |

---

## 19. Export & Reports

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Export attendance to PDF | ❌ | ✅ | ❌ | ❌ | ❌ |
| Export marks to PDF | ❌ | ✅ | ❌ | ❌ | ❌ |
| View year-in-review report | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 20. Display / Kiosk

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Generate display token | ❌ | ✅ | ❌ | ❌ | ❌ |
| Access kiosk display | ❌ | ✅ | ✅ | ✅ | ✅ (token required) |
| View display data | ❌ | ✅ | ✅ | ✅ | ✅ (token required) |

---

## 21. Authentication & Profile

| Feature / Action | Platform Admin | School Admin | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Login | ✅ email | ✅ school_code | ✅ employee_id | ⚠️ dropdown (no auth) | ⚠️ phone lookup |
| Change own password | ✅ | ✅ | ✅ | ✅ | ❌ |
| Forgot / reset password (email) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit own profile | ✅ | ✅ | ✅ | ✅ | ❌ |
| First-login forced password change | ❌ | ✅ | ✅ | ❌ | ❌ |
| Profile setup flow | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## Subscription Tier vs Feature Access (School Admin)

All school admin features are gated by the subscription tier configured by the platform admin. The matrix below shows which features are available at each tier.

> **Note:** The platform admin can override any feature for any tier via the Feature Configuration panel.

| Feature | None | Basic | Standard | Premium |
|---|---|---|---|---|
| Overview Dashboard | ❌ | ✅ | ✅ | ✅ |
| Daily Briefing | ❌ | ✅ | ✅ | ✅ |
| Attendance | ❌ | ✅ | ✅ | ✅ |
| Leave Requests | ❌ | ✅ | ✅ | ✅ |
| Emergency Cover | ❌ | ✅ | ✅ | ✅ |
| Staff Management | ❌ | ✅ | ✅ | ✅ |
| Student Management | ❌ | ✅ | ✅ | ✅ |
| Class Management | ❌ | ✅ | ✅ | ✅ |
| Timetable | ❌ | ✅ | ✅ | ✅ |
| Exam Schedule | ❌ | ✅ | ✅ | ✅ |
| Announcements | ❌ | ✅ | ✅ | ✅ |
| Academic Calendar | ❌ | ✅ | ✅ | ✅ |
| Class Analytics | ❌ | ✅ | ✅ | ✅ |
| Academic Analytics | ❌ | ✅ | ✅ | ✅ |
| Student-Teacher Analysis | ❌ | ✅ | ✅ | ✅ |
| Student Leaderboard | ❌ | ✅ | ✅ | ✅ |
| Notifications | ❌ | ✅ | ✅ | ✅ |
| Export & Reports | ❌ | ✅ | ✅ | ✅ |
| School Settings | ❌ | ✅ | ✅ | ✅ |
| Parent Engagement | ❌ | ❌ | ✅ | ✅ |
| Fee Management | ❌ | ❌ | ✅ | ✅ |
| Year Rollover | ❌ | ❌ | ✅ | ✅ |
| Year Review | ❌ | ❌ | ✅ | ✅ |

> Default configuration — platform admin can change any of these per tier.

---

## Key Rules Summary

1. **School isolation is absolute** — every query filters by `school_id`. No data ever crosses school boundaries.
2. **Platform admin cannot see school data** — they can manage schools, subscriptions, and features, but cannot view teacher lists, student marks, or attendance for any school.
3. **Teachers see only assigned classes** — all task, attendance, doubt, and syllabus access is scoped to classes where `teacher_id` matches.
4. **Students see only their own data** — marks, tasks, doubts, attendance are filtered to their `student_id`.
5. **Parents see only their child's data** — child linked via `student_id` from the lookup flow.
6. **Announcements auto-filter by audience** — API uses SQL LIKE matching on `target_audience` column so each role only sees announcements targeted to them.
7. **Feature visibility is tier-controlled** — school admin sidebar only shows features enabled for their subscription tier. API routes themselves do not enforce tier — only the UI gates them.
