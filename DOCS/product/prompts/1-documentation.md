# PROMPT 1 — Product Documentation
(Attach `PRODUCT-FACTBOOK.md` to the chat, then paste everything below the line.)

---

ROLE: You are a senior product manager and technical writer documenting a SaaS product for two audiences: (a) school staff and parents who will use it, and (b) investors and engineers doing due diligence.

SOURCE OF TRUTH: I attached "PRODUCT-FACTBOOK.md". Use ONLY that. Never invent a feature, number, customer, price or date. Respect its status tags (BUILT / PARTIAL / SCAFFOLD / PLANNED / REMOVED-FOR-REWORK) and section 7 "Honest limits". If something you need is missing or marked [FOUNDER TO FILL], write "[TBD – founder]" highlighted in yellow instead of guessing.

FIRST STEP: if you need anything from section 0 to write the docs (company name, target segment), ask me all questions in ONE message and wait. Otherwise start immediately.

DELIVERABLE: a complete Product Documentation suite for the platform exactly as it exists on the `dev` branch. Create it as a professionally formatted Word document (.docx) if you can create files; otherwise as clean Markdown. Write it in parts: after each part say "Part X of 7 done — reply 'continue'".

STRUCTURE
Part 1 — Product overview: what it is, who it is for, why it exists, vision, value by role, a "product on a page", and a feature status matrix (Built / Partial / Planned) as a table.
Part 2 — Roles & permissions: personas (goals, pains, top 5 tasks each), a permission matrix (who can see and do what), how sign-in and sessions work.
Part 3 — User guides, task-based and numbered, for School Admin, Teacher, Parent, Student and Platform Admin. Cover the ~25 most important tasks, e.g.: mark attendance; what to do when a class is "already marked"; report a mistake; add a holiday; read the attendance dashboard; open a student's full profile before a parent meeting; add students in bulk; collect a fee; grant a waiver; year-end fee review; create an exam and release marks; mark syllabus covered; print the feedback QR poster. Each task: goal, before you start, steps, what you will see, common problems. Use "[SCREENSHOT: route – description]" placeholders (routes are in factbook section 11).
Part 4 — Feature reference: one section per module using this template — Purpose · Who uses it · How it works (flow) · Business rules · Statuses & edge cases · Limits · Related modules. Cover every BUILT and PARTIAL module (factbook sections 3, 4, 9). Draw flows as Mermaid diagrams.
Part 5 — Business rules & calculations: exactly how attendance %, bands, holidays/weekly-off, fee balance, waivers, FIFO allocation, year rollover, exam pass and points are calculated, each with a worked example (numbers clearly labelled "example").
Part 6 — Technical documentation: architecture diagram (Mermaid), tech stack, multi-tenancy and security model, sessions, data model overview by domain (section 10), API overview (route groups; point to /api-docs), background jobs, backups and restore, environments and configuration (variable NAMES only, never secrets), testing and quality practices, engineering workflow.
Part 7 — Roadmap and known limitations (honest, straight from sections 7–8), FAQ (the 20 questions schools and parents actually ask), glossary, document-control block (version, date, snapshot = dev, date on the factbook stats block), change-log template.

STYLE: plain English, short paragraphs, tables for anything comparable, skimmable pages, consistent terminology from the glossary, no marketing fluff in the guides. Mark anything internal-only (e.g. engineering/security notes) with the label "INTERNAL" so I can strip it before sharing externally.

BEFORE YOU ANSWER, self-check: every claim is traceable to the factbook; nothing planned or removed is described as live; every module has all template headings; no invented numbers.
