# Planned Tasks

Upcoming features and improvements. Not yet started. Move to [in-progress.md](in-progress.md) when work begins.

---

## Features Not Yet Built

These are defined in `lib/features.ts` but have no implementation:

### School Health Score
**Portal:** School Admin — Analytics
**Description:** Composite score combining attendance %, marks averages, task completion rate, and fee collection percentage into a single school health metric.
**Feature key:** `school-health`

### Syllabus Predictor
**Portal:** School Admin — Analytics
**Description:** AI-powered prediction of syllabus completion date based on current teaching pace and topic coverage.
**Feature key:** `syllabus-predictor`

### Anonymous Class Pulse
**Portal:** School Admin — Communication
**Description:** Anonymous student feedback system for class experience. Students submit feelings/ratings without teacher knowing who submitted.
**Feature key:** `class-pulse`

### Report Cards
**Portal:** School Admin — Tools
**Description:** Generate and print formatted report cards per student per exam. DB tables exist (`report_card_config`, `report_card_remarks`), API partially built, no UI.
**Feature key:** `report-cards`

---

## Partial Features to Complete

### Student Auth — Proper Login
**Portal:** Student
**Description:** Replace demo dropdown with a real login form (student ID + password). Add JWT session.

### Parent Auth — Persistent Login
**Portal:** Parent
**Description:** Add JWT-based session for parents instead of lookup-per-visit. Proper login form with phone + password.

### Mark Acknowledgement UI
**Portal:** Parent
**Description:** Surface the mark acknowledgement feature prominently in the parent portal. API and DB exist.

### Subject Templates Auto-Apply
**Portal:** School Admin
**Description:** Wire up subject templates to auto-apply when creating new classes. API and DB are ready.

### Teacher Performance Analytics
**Portal:** Teacher
**Description:** Build the performance analytics component. Navigation item exists but flagged `comingSoon`.

### Weekly Test UI
**Portal:** Student
**Description:** Surface the AI-generated MCQ weekly test in the student portal. DB table exists.
