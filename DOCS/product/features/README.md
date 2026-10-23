# WLYL School Platform — Feature Dossiers

> **What this is.** One deep, code-verified document per feature, written for three audiences at once: **product** (what it is and why it matters), **end-to-end flow** (who does what, step by step), and **developers** (files, APIs, tables, rules, tests). Built from the `dev` branch at commit `29f0e6a` (2026-09-21).
>
> **How to use it with Claude.** Attach the dossier(s) you need and ask for the deliverable — a Word document, a pitch deck for investors, or a demo deck for schools. Attach [`00-deck-storyline.md`](00-deck-storyline.md) and [`../PRODUCT-FACTBOOK.md`](../PRODUCT-FACTBOOK.md) for decks. Sections marked **INTERNAL** must be stripped from anything sent to schools.

## Ground rules (why the numbers and claims can be trusted)

1. Every statement was checked against the code, not the older wiki. Where the old docs were wrong they were corrected or removed.
2. **Nothing planned or removed is described as live.** No WhatsApp messaging, no payment gateway, no AI headline, no LEAP integration, no timetable.
3. Anything only the founder knows is written **`[TBD – founder]`** (traction, pricing, funding, team, market size).
4. Each dossier has the same six sections: **1 Product brief · 2 End-to-end flow · 3 Business rules · 4 Technical reference · 5 Pitch kit · 6 Limits & roadmap.**

## Start here

| Doc | Read it for |
|---|---|
| [`00-platform-architecture.md`](00-platform-architecture.md) | System architecture, security model, feature flags, data, jobs, tests — **and the security findings to fix before due diligence (§12.1)** |
| [`00-roles-access-and-plans.md`](00-roles-access-and-plans.md) | Five roles, permission matrix, which portals each feature reaches, plans as seeded |
| [`00-deck-storyline.md`](00-deck-storyline.md) | Investor and school slide storylines mapped to these dossiers, demo order, "say / never say" |

## The 19 features (match Platform Admin → Feature configuration)

| # | Feature | Category | Portals | Doc |
|---|---|---|---|---|
| 01 | Overview Dashboard | Core | Admin | [01](01-overview-dashboard.md) |
| 02 | Staff Directory & Onboarding | Core | Admin | [02](02-staff-directory-and-onboarding.md) |
| 03 | Students List & Onboarding (Student 360) | Core | Admin | [03](03-students-list-and-onboarding.md) |
| 04 | Class Management | Core | Admin | [04](04-class-management.md) |
| 05 | Student Portal Access | Core | Student | [05](05-student-portal.md) |
| 06 | Parent Portal Access | Core | Parent | [06](06-parent-portal.md) |
| 07 | WLYL Digital Library | Core | All four | [07](07-digital-library.md) |
| 08 | Attendance Tracking ★ showcase | Scheduling | All four | [08](08-attendance-tracking.md) |
| 09 | Syllabus Customizer | Scheduling | All four | [09](09-syllabus-customizer.md) |
| 10 | Exam Schedule & Marks | Scheduling | All four | [10](10-exam-schedule-and-marks.md) |
| 11 | Announcement Board | Communication | Admin (+ read in portals) | [11](11-announcement-board.md) |
| 12 | Feedback Management (QR) | Communication | Admin + public | [12](12-feedback-management.md) |
| 13 | Fee Management | Finance | Admin, Parent | [13](13-fee-management.md) |
| 14 | Online Fee Payments (UPI) | Finance | Admin, Parent | [14](14-online-fee-payments-upi.md) |
| 15 | Expense Tracking | Finance | Admin | [15](15-expense-tracking.md) |
| 16 | Academic Calendar | Administration | All four | [16](16-academic-calendar.md) |
| 17 | Export & Reports | Administration | Admin | [17](17-export-and-reports.md) |
| 18 | School Settings | Administration | Admin | [18](18-school-settings.md) |
| 19 | Year Rollover | Administration | Admin | [19](19-year-rollover.md) |

**Two portals documented as their own dossiers** (not feature switches, but essential for decks):

| Doc | |
|---|---|
| [`20-teacher-portal.md`](20-teacher-portal.md) | Where teachers use attendance, syllabus, marks and the library |
| [`21-platform-admin-portal.md`](21-platform-admin-portal.md) | The SaaS control room: schools, plans, overrides, monitoring, audit |

> You mentioned **17** features; the code's feature configuration (`lib/features.ts`) lists **19**. If your count excludes two (for example *Overview* and *Export*, or *Online Payments* and *Year Rollover*), tell me which and I will adjust the deck order — the dossiers are independent.

## Also relevant (kept, verified)

| Doc | Why |
|---|---|
| [`../PRODUCT-FACTBOOK.md`](../PRODUCT-FACTBOOK.md) | One-file fact source with generated counts (tables, routes, tests) and the "honest limits" list |
| [`../../ATTENDANCE.md`](../../ATTENDANCE.md) | Attendance in full technical depth, incl. how to run its e2e tests safely |
| [`../../SYLLABUS-FEATURE-README.md`](../../SYLLABUS-FEATURE-README.md) | Syllabus schema and every route in detail |
| [`../../DECISIONS.md`](../../DECISIONS.md), [`../../CHANGELOG.md`](../../CHANGELOG.md), [`../../KNOWN_ISSUES.md`](../../KNOWN_ISSUES.md) | Why things are the way they are; what shipped; what is broken |
| `/api-docs` | Interactive API reference (source `docs/openapi.json`) |

## Keeping this current

When a feature ships or changes: update its dossier and `wiki/features/<feature>.md`, run `node scripts/product-docs.mjs`, commit the regenerated catalog and factbook (see `.claude/skills/update-product-docs/SKILL.md`). The dossier header carries the commit it was verified against — bump it when you re-verify.

## At a glance (from the code)

- 5 portals · 19 plan-gated features · ~130 database tables · 234 API route files / 332 operations · 26 automated end-to-end suites · IST, India-first (10-digit mobile, April–March year, UPI, Telugu/Hindi).
- Removed from `dev` and **not to be presented as live**: timetable, learning hub, rewards marketplace, lesson planner, weekly test, homework, doubts, leave requests, emergency cover, leaderboard, TV display, daily briefing, year-in-review, parent engagement, class analytics.
