# In Progress

Tasks currently being worked on. Move to [completed.md](completed.md) when done.

---

<!-- Add new entries at the top -->

### Performance & security audit — login latency, tenant isolation, pagination (#TBD)
**Type:** Bug Fix / Enhancement
**Portal:** All (School Admin, Teacher, Student, Parent, Platform Admin)
**Assigned to:** Vamsi
**Branch:** feature/perf-security-audit — ⚠️ needs renaming once an issue number exists
**Started:** 2026-08-09
**Summary:** Fixed a cross-tenant data leak that exposed password hashes, hardened committed secret fallbacks, cut cold-start DB round-trips ~115 → 2 (the real cause of slow login), and collapsed a 4-level N+1 from ~1,500 queries to 6. Full detail and the open-items list: [DOCS/PERF-SECURITY-AUDIT-2026-08.md](../../DOCS/PERF-SECURITY-AUDIT-2026-08.md).
**Progress:**
- [x] P0 cross-tenant leak + password-hash exposure (students, teachers)
- [x] JWT / ingest secret fallbacks fail closed in production
- [x] Cold-start migration version gate (~115 → 2 round-trips)
- [x] 4-level N+1 in `/api/school/subjects` (~1,500 → 6 queries)
- [x] Missing indexes; dashboard waterfall; teacher + student bundle splitting
- [x] Opt-in pagination API on 6 endpoints + shared `Pagination` component
- [ ] **P0: tenant guards on doubts, announcements, leave-requests, notifications**
- [ ] `/api/fees/payments` unfiltered — ~36k rows to render 6 (2-line fix, biggest win)
- [ ] Facets/search API so the roster screens can actually paginate
- [ ] Open GitHub issues, rename branch, add Playwright tenant-isolation regression test

---

## Format

```
### Title (#issue-number)
**Type:** Feature / Bug Fix / Enhancement
**Portal:** School Admin / Teacher / Student / Parent / Platform Admin
**Assigned to:** Name
**Branch:** feature/42-short-description or fix/87-short-description
**Started:** YYYY-MM-DD
**Summary:** What is being done in 1-2 sentences.
**Progress:**
- [x] Step completed
- [ ] Step remaining
```

---

<!-- 
### Example task (#42)
**Type:** Feature
**Portal:** Student
**Assigned to:** Vamsi
**Branch:** feature/42-student-login
**Started:** 2026-06-18
**Summary:** Building proper login form for student portal to replace demo dropdown.
**Progress:**
- [x] Design login form UI
- [x] Create API endpoint
- [ ] Add JWT session
- [ ] Write Playwright tests
-->
