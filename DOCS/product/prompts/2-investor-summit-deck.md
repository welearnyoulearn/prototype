# PROMPT 2 — Investor / Summit Deck

**How to use (2 minutes)**
1. New chat in claude.ai (or Claude Code). Attach these files from this repo:
   - `docs/product/PRODUCT-FACTBOOK.md` (fact-checker)
   - `docs/product/features/00-deck-storyline.md`
   - `docs/product/features/00-platform-architecture.md`
   - `docs/product/features/00-roles-access-and-plans.md`
   - Feature dossiers for the core slides: `08-attendance-tracking.md`, `13-fee-management.md`, `14-online-fee-payments-upi.md`, `10-exam-schedule-and-marks.md`, `09-syllabus-customizer.md`, `06-parent-portal.md`, `03-students-list-and-onboarding.md`, `19-year-rollover.md`, `12-feedback-management.md`, `21-platform-admin-portal.md`
2. Paste everything below the line.
3. Answer Claude's founder questions with **real facts only** (or say "skip").
4. Before presenting: re-run `node scripts/product-docs.mjs` so the counts are current, and confirm the API-guard fix has shipped (see the security note below).

---

ROLE: You are a world-class pitch strategist and presentation designer — the kind who builds keynote storytelling for global summits, accelerator demo days and investor meetings — and you think like a founder, a product manager and a systems architect.

CONTEXT: I am the founder-developer of WLYL, a multi-portal, multi-tenant school-management SaaS for Indian schools (5 portals: Platform Admin, School Admin, Teacher, Student, Parent; 19 plan-gated features). The attached files are the ONLY source of truth. `PRODUCT-FACTBOOK.md` is the fact-checker; the `features/*.md` dossiers hold the flows, business rules, demo scripts and honest answers. Never invent features, traction, customers, revenue, prices, market numbers, partnerships or dates.

HARD HONESTY RULES (these are true of the code today):
- NOT live: WhatsApp messaging or OTP (email alerts only); a payment gateway or automatic payment confirmation (UPI is a QR + parent self-report + admin verification flow); any AI feature (never call the product "AI-powered"); LEAP integration (only an absentee export); timetable, leaderboard, rewards, homework, doubts, leave requests, learning hub, TV display (removed from `dev`).
- Do NOT claim "every endpoint is authenticated". A scan on 2026-09-21 found some API routes without a login check (plan change, announcements, textbooks, some platform routes). Treat security as "tenant isolation, revocable staff sessions, audit logs; a known set of routes being hardened" unless I tell you the fix has shipped.
- Seeded plan prices (499 / 999 / 1999) have no defined unit or currency — do not show them unless I confirm them.
- Anything I have not answered must appear as a visible yellow "[FILL: …]" placeholder — never guess.

FIRST STEP: ask me, in ONE message, everything you need that only I know: founder name(s) and bio and "why me"; company legal name, city, year, contact; traction (schools, pilots, users, revenue, LOIs, testimonials — only what is true); real pricing (unit, currency); funding ask, instrument, use of funds, runway; market-size numbers with sources; competitors; target segment (board, geography, school size); team and advisors; go-to-market; pilot outcomes with real numbers; whether the API-guard fix has shipped. Wait for my answers. If I say "skip", use a placeholder.

AUDIENCE: top summits, accelerators and investors who see a hundred decks. This must NOT look like a normal PPT: one idea per slide, insight-led headlines (a sentence that makes a claim, not a label like "Problem"), large visuals, minimal text, no bullet walls, a cinematic opening and a memorable close.

DELIVERABLES
1. A real, editable `.pptx` (16:9) if you can create files; otherwise a single-file HTML deck plus a slide-by-slide spec. Main deck 16–18 slides + an appendix of 8–10.
2. For EVERY slide: headline, exact visual (chart / diagram / screenshot / illustration), on-slide text (max 25 words), speaker notes (a spoken script, 20–40 seconds), and the dossier it relies on.
3. Three cut-downs as slide lists: 3-minute lightning pitch (6 slides), 10-minute pitch, 20-minute deep dive.
4. Also: a one-line pitch; 30-second and 2-minute elevator pitches; a founder story (150 words); the 20 hardest investor questions with honest answers grounded in the files; and a short "what I say when asked about AI / WhatsApp / payments / security" script.
5. A live-demo run sheet (8 minutes) using the order in `00-deck-storyline.md`, with a throwaway school and sample names only.

SLIDE SKELETON (adapt, keep the order of the argument)
1. Cinematic hook: "a day in an Indian school" — paper registers, WhatsApp chaos, a parent waiting at the office.
2. The problem, in numbers I supply (qualitative version from dossiers 08, 13, 19 if I skip).
3. Why now / market — my numbers only.
4. The insight: one source of truth; every role sees its own slice, computed by one set of rules.
5. The product on a page: 5 portals, one database, plan-controlled features.
6. Showcase — attendance: first-submit lock, holiday-aware, one formula everywhere, role dashboards (dossier 08).
7. Money — fee ledger, FIFO receipts, waivers, day-close, year-end carry-forward; UPI verify flow; say "no gateway yet" yourself (13, 14, 15).
8. Learning — three-layer syllabus with coverage analytics; governed exam pipeline: enter → class-teacher review → admin release → parent acknowledge (09, 10).
9. Families — parent and student apps, announcements, calendar, QR feedback with issue pipeline (06, 05, 11, 12, 16).
10. Retention engine — Year Rollover with fee gate, Student 360, full history (19, 03).
11. Proof of depth — the stats block from the factbook (tables, API operations, test suites, code size), framed as capital-efficient founder-developer speed and quality.
12. SaaS engine — tiers, per-school overrides, usage analytics, audit log (21, roles doc).
13. Architecture and trust — multi-tenant isolation, revocable sessions, single-source rules, tests, daily backup (architecture doc §5–§10).
14. Traction — mine.
15. Business model and pricing — mine.
16. Go-to-market and competition — mine; differentiators from the files: shared-rule consistency, attendance locking, UPI flow, Year Rollover, Telugu/English parent app.
17. Roadmap, honestly labelled as intentions: WhatsApp, payment gateway, timetable, rebuilt analytics, annual report card, half-day holidays.
18. Team, the ask, vision.
Appendix: architecture diagram, security model, permission matrix, per-feature detail slides, data model by domain, testing and quality, known limits.

DESIGN DIRECTION: modern, confident, premium. Palette: deep indigo/violet with one bright accent; green/amber/red used ONLY to show data status. Large type (Inter or Poppins), generous whitespace, one consistent grid, device mockups of real screens (mark each "[SCREENSHOT: route]"; routes are `/school-admin`, `/teacher`, `/parent`, `/student`, `/platform-admin`, `/api-docs`), simple honest charts, one icon set, no clip-art or stock-photo clichés. Readable from the back of a hall. No decorative accent lines under titles.

BEFORE YOU ANSWER, self-check: every claim traces to an attached file or to my answers; nothing not-built is shown as built; each slide carries exactly one message; the headlines alone, read in order, tell the whole story; every number is either from the factbook stats block or marked "[FILL]".
