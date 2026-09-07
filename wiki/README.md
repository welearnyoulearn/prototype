# WLYL School Platform — Wiki

> Living documentation of all features, tasks, and work history.
> Update this wiki whenever a feature is built, changed, or a bug is fixed.

---

## Feature Documentation

| Portal | Doc | Features |
|--------|-----|----------|
| [School Admin](features/school-admin.md) | Portal overview, all modules | 23 built, 3 partial, 4 planned |
| [Teacher](features/teacher.md) | Portal overview, all modules | 12 built, 1 partial |
| [Student](features/student.md) | Portal overview, all modules | 8 built, 1 partial |
| [Parent](features/parent.md) | Portal overview, all modules | 5 built, 2 partial |
| [Platform Admin](features/platform-admin.md) | Portal overview, all modules | 7 built |
| [Display / Kiosk](features/display.md) | Kiosk mode, tokens | 2 built |
| [Auth](features/auth.md) | Login flows, JWT, password reset | 3 built, 2 partial |
| [Backup & Restore](features/backup-restore.md) | Daily R2 backup, gap-fill restore | 1 built |

---

## Database ERD (Entity Relationship Diagrams)

| Diagram | Description |
|---------|-------------|
| [ERD Index](erd/README.md) | Overview and index of all diagrams |
| [Core: Schools & Config](erd/core-schools.md) | Schools, subscriptions, users, settings, calendars |
| [People](erd/people.md) | Teachers, students, parents, classes |
| [Scheduling](erd/scheduling.md) | Timetable, attendance, leave, substitutes |
| [Academics](erd/academics.md) | Exams, marks, tasks, doubts, syllabus, report cards |
| [Fees](erd/fees.md) | Fee categories, structures, payments, waivers, online payments |
| [Engagement](erd/engagement.md) | Announcements, notifications, rewards, daily content, WhatsApp, billing |
| [Full Schema](erd/full-schema.md) | Complete ERD with all 60+ tables |

---

## Task Log

| Log | What it tracks |
|-----|---------------|
| [Completed Tasks](tasks/completed.md) | All finished features and bug fixes with dates |
| [In Progress](tasks/in-progress.md) | Currently active work |
| [Planned](tasks/planned.md) | Upcoming features and improvements |

---

## How to Use This Wiki

### When starting a new feature
1. Add an entry to [tasks/in-progress.md](tasks/in-progress.md)
2. Link to the GitHub Issue

### When completing a feature or bug fix
1. Move the entry from [tasks/in-progress.md](tasks/in-progress.md) to [tasks/completed.md](tasks/completed.md)
2. Update the relevant feature doc in [features/](features/)
3. Update status if it changed (Partial → Built, Planned → Built, etc.)

### When finding a bug
1. Log it in GitHub Issues
2. Add to [tasks/in-progress.md](tasks/in-progress.md) once work begins
3. After fix, move to [tasks/completed.md](tasks/completed.md) and update the feature doc

### Template for feature entries
See [_template.md](features/_template.md) for the standard format.
