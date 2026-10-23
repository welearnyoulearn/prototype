# Deck Storylines — Investors and Schools

> Use with the dossiers and the factbook. Every slide points to the dossier that holds its facts, flows and demo script. Anything in **[TBD – founder]** must be supplied by you — never invent it.

## 0. Ground rules for both decks

**Say (all true on `dev`)**
- One platform, five portals, one source of truth: admin, teacher, student, parent, platform owner.
- Attendance locked, holiday-aware and identical on every screen.
- Fee ledger with FIFO receipts, waivers, day-close, year-end carry-forward.
- UPI QR fee flow with human verification.
- Governed exam pipeline: enter → class-teacher review → admin release → parent acknowledge.
- Per-school feature switches; Basic / Standard / Premium tiers.
- India-first: IST, 10-digit mobile validation, April–March year, UPI, Telugu/Hindi.
- Individual revocable staff logins, 20-minute idle timeout.
- 26 automated end-to-end suites; API spec guarded by tests.

**Never say**
- "AI-powered" (only a per-school link page to external assistants exists).
- "WhatsApp alerts / OTP" (scaffold only; alerts are email).
- "Integrated payment gateway" or "automatic payment confirmation".
- "LEAP integration" (only an absentee export).
- "Timetable", "leaderboard", "rewards", "homework", "doubts", "leave", "TV display", "learning hub" (removed from `dev`).
- "Every endpoint is authenticated" (see architecture §12.1) until the fix lands.
- Any customer count, revenue, price or market size that is not in your **[TBD – founder]** answers.

## 1. Investor / summit deck (15–18 slides, ~12 minutes + demo)

| # | Slide | Content | Source |
|---|---|---|---|
| 1 | Title | Company, one-line promise | **[TBD – founder]** |
| 2 | The problem | Schools run on registers, Excel, WhatsApp; parents in the dark; fees leak; year-end chaos | dossiers 08, 13, 19 |
| 3 | Why now / why schools | Digitisation of private schools in India; parents expect app access | **[TBD – founder]** market data with sources |
| 4 | The product on a page | Five portals, one platform diagram | architecture §2, roles doc |
| 5 | Daily heartbeat: Attendance | Lock, holidays, dashboards, one formula | [08](08-attendance-tracking.md) |
| 6 | Money: Fees + UPI + Expenses | Ledger, day-close, carry-forward, UPI verify; honest "no gateway yet" | [13](13-fee-management.md), [14](14-online-fee-payments-upi.md), [15](15-expense-tracking.md) |
| 7 | Learning: Syllabus + Exams | Three-layer syllabus, weekly trend, governed results | [09](09-syllabus-customizer.md), [10](10-exam-schedule-and-marks.md) |
| 8 | Family engagement | Parent and student portals; acknowledgements; feedback QR | [06](06-parent-portal.md), [05](05-student-portal.md), [12](12-feedback-management.md) |
| 9 | Retention engine | Year Rollover, Student 360, history — why a school never leaves | [19](19-year-rollover.md), [03](03-students-list-and-onboarding.md) |
| 10 | SaaS engine | Tiers, per-school overrides, usage analytics, audit | [21](21-platform-admin-portal.md), roles doc §4 |
| 11 | Architecture & trust | Multi-tenant, sessions, single-source rules, tests | architecture §5–§10 |
| 12 | Live demo | Order in §3 below | — |
| 13 | Traction | Schools, pilots, users, LOIs | **[TBD – founder]** |
| 14 | Business model & pricing | Seeded tiers exist (499 / 999 / 1999, unit undefined) | **[TBD – founder]** confirm before showing |
| 15 | Go-to-market | | **[TBD – founder]** |
| 16 | Competition | | **[TBD – founder]** |
| 17 | Roadmap (honest) | WhatsApp, payment gateway, timetable, analytics, half-day holidays | factbook §8 |
| 18 | Team & the ask | | **[TBD – founder]** |

Investors' technical follow-ups (have answers ready): tenancy model, session model, what is not built (gateway, WhatsApp, encryption), test coverage, and the API-guard fix status.

## 2. School (client) deck (12–14 slides, ~10 minutes + demo)

Tone: benefits in the principal's words, no jargon, every slide ends with a **"what you'll notice on Monday"**.

| # | Slide | Content | Source |
|---|---|---|---|
| 1 | Title | "Your school, on one page" | — |
| 2 | Today's reality | Registers, calls, lost dues | dossiers 08, 13 |
| 3 | One platform, five doors | Admin, teacher, student, parent (and us) | roles doc |
| 4 | Morning in 2 minutes | Overview dashboard | [01](01-overview-dashboard.md) |
| 5 | Attendance that everyone trusts | Two taps, lock, holiday-aware, parent email | [08](08-attendance-tracking.md) |
| 6 | Fees without fear | Receipts, part-payments, waivers, day-close, UPI | [13](13-fee-management.md), [14](14-online-fee-payments-upi.md) |
| 7 | Exams and results, done right | Enter → review → release → acknowledge | [10](10-exam-schedule-and-marks.md) |
| 8 | Syllabus you can see | Coverage by class, nudge, parents see progress | [09](09-syllabus-customizer.md) |
| 9 | Parents in the loop | Parent app, announcements, calendar | [06](06-parent-portal.md), [11](11-announcement-board.md), [16](16-academic-calendar.md) |
| 10 | Hear every voice | QR feedback with issue tracking | [12](12-feedback-management.md) |
| 11 | Admissions to new year | Bulk upload, Student 360, Year Rollover | [03](03-students-list-and-onboarding.md), [19](19-year-rollover.md) |
| 12 | Safe and controlled | Individual logins, idle timeout, audit | [18](18-school-settings.md) |
| 13 | Getting started | Onboarding steps (roles doc §5) | roles doc |
| 14 | Plans | **[TBD – founder]** | — |

## 3. Demo order (works for both audiences; ~8 minutes)

1. **Platform Admin** creates a school (30 s) → [21](21-platform-admin-portal.md)
2. **Admin** uploads staff and students from a template; show one parent linked to two siblings (60 s) → [02](02-staff-directory-and-onboarding.md), [03](03-students-list-and-onboarding.md)
3. **Teacher** marks attendance; a second teacher hits the lock; add a holiday (90 s) → [08](08-attendance-tracking.md), [16](16-academic-calendar.md)
4. **Admin Overview** updates; open **Student 360** (60 s) → [01](01-overview-dashboard.md), [03](03-students-list-and-onboarding.md)
5. **Fees:** take a ₹15,000 payment across two terms; parent reports a UPI payment; admin approves (120 s) → [13](13-fee-management.md), [14](14-online-fee-payments-upi.md)
6. **Exam:** enter marks, review, release; parent acknowledges (90 s) → [10](10-exam-schedule-and-marks.md)
7. **Feedback QR** on a phone → issue appears (45 s) → [12](12-feedback-management.md)
8. **Year Rollover** blocked popup, then success (45 s) → [19](19-year-rollover.md)

**Demo hygiene:** use a throwaway school and sample names (no real school names without permission). Until the API-guard fix is deployed, do not demo write actions against shared production data.

## 4. Questions you will be asked — with honest answers

| Question | Answer (all true today) | Detail |
|---|---|---|
| Do you have a payment gateway? | Not yet — UPI QR with admin verification; gateway is roadmap | [14](14-online-fee-payments-upi.md) |
| WhatsApp? | Email alerts today; WhatsApp needs Meta setup, roadmap | [06](06-parent-portal.md) |
| Is it AI? | No. We do not claim it | [05](05-student-portal.md) |
| LEAP? | No public API; we export the absentee list | [08](08-attendance-tracking.md) |
| Timetable? | Built on a branch, awaiting sign-off | [04](04-class-management.md) |
| Data safety? | Tenant-scoped, revocable sessions, daily R2 backup; a known set of unguarded routes is being fixed | architecture §5, §12 |
| Can each school have its own domain/branding? | Logo and receipt header yes; separate domain no | [18](18-school-settings.md) |
| What if a school leaves? | Data-export request path exists (email to support) | [18](18-school-settings.md) |

## 5. Facts you must supply (ask Claude to leave these highlighted)

Founder bio and why you · legal name, city, year, contact · traction (schools, pilots, users, LOIs, testimonials) · real pricing (unit, currency) · funding ask and use of funds · market size with sources · competitors · target segment (board, geography, size) · team and advisors · go-to-market · pilot outcomes with real numbers · demo data · languages to stress.
