# PROMPT 3 — School (Client) Demo Deck

**How to use (2 minutes)**
1. New chat in claude.ai (or Claude Code). Attach these files from this repo:
   - `docs/product/PRODUCT-FACTBOOK.md` (fact-checker)
   - `docs/product/features/00-deck-storyline.md`
   - `docs/product/features/00-roles-access-and-plans.md`
   - All feature dossiers `01` to `19`, plus `20-teacher-portal.md` (skip `00-platform-architecture.md` and `21-platform-admin-portal.md`; they are technical/internal)
2. Paste everything below the line.
3. Answer Claude's questions with **real facts only** (or say "skip").
4. Sections of the dossiers marked **INTERNAL** must never reach a school slide.

---

ROLE: You are a senior product manager and sales-enablement designer preparing a product demonstration for school owners, principals and management committees — non-technical, busy, price-sensitive, and skeptical of "software our teachers won't use".

CONTEXT: I am the founder of WLYL, a school-management platform for Indian schools. The attached files are the ONLY source of truth. `PRODUCT-FACTBOOK.md` is the fact-checker; the `features/*.md` dossiers hold the flows, business rules, demo scripts and honest answers. Never invent features, customers, results, prices or guarantees.

HARD HONESTY RULES (true of the code today)
- NOT live, so never promise: WhatsApp alerts or OTP (parents are alerted by **email**); an online payment gateway or automatic payment confirmation (fees can be paid by UPI QR — the parent reports it and the school confirms it against the bank); any AI feature; direct LEAP integration (we give the daily absentee list to key in); a timetable, leaderboard, rewards, homework, doubts, leave requests (removed from the product); annual multi-exam report cards (a per-exam printable report card exists); half-day or class-specific holidays.
- Show only built features as live. Show planned ones clearly as "coming next".
- Prices: the code seeds 499 / 999 / 1999 with no unit or currency — do not show them unless I confirm them.
- Never say "multi-tenant", "API", "JWT" or other jargon on main slides.
- Anything I have not answered must be a visible yellow "[FILL: …]" placeholder — never guess.

FIRST STEP: ask me, in ONE message: company name and contact; the pricing I will quote (unit, currency, what each plan includes); real pilot numbers if any (time saved, fee collection, attendance); reference schools I may name (with permission); language preference (English, Telugu headlines); the demo school name and sample data to use; target school type (board, size, region). If I skip, use a placeholder.

GOAL OF THE MEETING: the principal says "let's pilot this in our school." Sell outcomes, not features. Every feature slide must answer: what pain does this remove, for whom, and what will they see on Monday morning?

DELIVERABLES
1. An editable 16:9 `.pptx` if you can create files (otherwise HTML slides + a spec): 14–18 main slides plus an appendix (full feature checklist by portal, FAQ, data-safety page).
2. Per slide: headline, visual (use "[SCREENSHOT: route]" placeholders; routes are `/school-admin`, `/teacher`, `/parent`, `/student`), very short on-slide text (max 20 words), and presenter notes (what to say + what to click).
3. A 25-minute live-demo run-of-show: exact click paths, timings, one "wow moment" per role, and a fallback plan if the internet fails. Use the demo order in `00-deck-storyline.md` §3 and each dossier's "60-second demo".
4. A one-page leave-behind handout; a 7-day onboarding plan (accounts, upload of staff and students from the Excel templates, classes and subjects, fee setup, calendar, training); a pilot proposal outline; a simple ROI worksheet (formulas with blanks for the school's OWN numbers — no invented savings); and honest answers to the 15 objections principals raise: cost, teacher resistance, data safety, parents who are not tech-savvy, poor internet, Telugu, "we already use X", switching effort, who owns the data, WhatsApp, payment gateway, timetable, report cards, LEAP, what happens if we leave, who trains our staff.

SLIDE SKELETON (adapt; keep the order of the argument)
1. Title — "Your school, on one page."
2. Today's reality — registers, calls, lost dues (dossiers 08, 13).
3. One platform, five doors — admin, teacher, student, parent (roles doc).
4. 9:05 am — which classes haven't marked attendance? Overview dashboard (01).
5. Attendance everyone trusts — two taps, no double marking, holiday closes attendance, parent gets an email (08, 16).
6. Class teacher's view — students needing attention, weekday patterns (08, 20).
7. Fees without fear — receipts, part-payments, waivers, day-close, UPI with your confirmation (13, 14).
8. Expenses with the bill attached (15).
9. Exams and results done right — enter → class-teacher review → you release → parents acknowledge (10).
10. Syllabus you can see — coverage by class, nudge a teacher who is behind, parents see progress (09).
11. The parent's phone — attendance calendar, fees, results, Telugu/English (06).
12. Student view (05) and library (07), briefly.
13. Notices and feedback — audience-targeted announcements; QR feedback poster with tracked issues (11, 12).
14. The principal with a parent in the room — Student 360 in 30 seconds (03).
15. Admissions to new year — Excel upload, Year Rollover with the fee gate (02, 03, 19).
16. Control and safety in plain words — everyone has their own login, instant removal of leavers, automatic logout when idle, daily backup, who sees what (18, roles doc). Do not claim more than the files say.
17. What is live today vs coming next — honest two-column slide (factbook §7–§8).
18. Plans and pricing — mine, or placeholder.
19. Pilot plan and next steps — 7-day onboarding, what we need from the school.
Appendix: feature checklist by portal, permission matrix, FAQ, data-safety page, sample reports (attendance CSV, absentee list, report card).

DESIGN DIRECTION: friendly, high-trust, uncluttered. Large real-screen mockups in device frames, before/after comparisons (paper register vs dashboard), colour-coding consistent with the product (green/amber/red = attendance health only), one icon per role, big readable type, plain English (plus Telugu headlines if I choose). Every slide names a person and a benefit and can be followed in 5 seconds. No decorative accent lines under titles.

BEFORE YOU ANSWER, self-check: nothing unbuilt is shown as live; every slide names a person and a benefit; no INTERNAL or technical content leaked onto a slide; every number is from the files or my answers, otherwise "[FILL]".
