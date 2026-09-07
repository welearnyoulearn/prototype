# Feature: Feedback Management

**Portal:** School Admin (public entry point lives outside all portals) / Platform Admin (feature toggle only)
**Status:** Built (pending live smoke test + code review — see Known issues)
**Last updated:** 2026-09-07

---

## What it does

Lets a school collect feedback from parents, students, teachers, and visitors via a no-login, QR-code-driven form, then manage it from a "Feedback Management" tab in the school-admin dashboard: overview KPIs, a submissions list, an issue pipeline auto-flagged from low ratings, category configuration, and a QR poster generator.

## How it works

1. A school-admin opens Feedback Management → Settings & QR, which lazily creates a `feedback_settings` row with a fresh public code, and shows a link (`/feedback/{code}`) and a downloadable QR poster.
2. Anyone scans the code, no login required. They pick who they are (Parent/Student/Teacher/Visitor/Other), optionally give a name/phone or stay anonymous, pick one or more role-scoped categories to rate, rate each with a 5-point emoji scale, then optionally add quick-pick tags, free text, and a recorded voice note.
3. On submit, each rated category becomes a row in `feedback_submission_ratings`. A rating of 1 or 2 is auto-flagged as an issue (`priority = 'high'` or `'medium'`) and snapshots the category's configured department for routing.
4. The school-admin sees new submissions in the Submissions tab, low ratings in the Issue Pipeline (with a status workflow: open → in_progress → resolved/dismissed), and aggregate stats (pulse score, mood breakdown, best/worst categories) on the Dashboard tab.

## Key files

| File | Purpose |
|------|---------|
| `app/feedback/[code]/page.tsx` + `FeedbackWizard.tsx` + `steps/*.tsx` | Public, unauthenticated submission flow |
| `app/school-admin/components/FeedbackManagement.tsx` + `components/feedback/*.tsx` | Admin dashboard, tabbed (Dashboard/Submissions/Issue Pipeline/Categories/Settings & QR) |
| `lib/feedback-defaults.ts` | Default categories per role, seeded for new schools and backfilled for existing ones |
| `lib/validation/feedback.ts` | Zod schemas for the public submit payload and admin CRUD bodies |
| `lib/request-ip.ts` | Client IP extraction for the public submit rate limit |
| `lib/auth.ts` (`generateFeedbackCode`) | Mints the public code — deliberately independent of `schools.school_code` |

## API endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/feedback/resolve?code=` | Public: resolve school name + active categories from a code |
| POST | `/api/feedback/voice-upload-url` | Public: presigned R2 PUT for a voice note |
| POST | `/api/feedback/submit` | Public: create a submission + its ratings (rate-limited) |
| GET | `/api/feedback/voice/[id]` | Session-gated: presigned R2 GET redirect for admin playback |
| GET | `/api/feedback/submissions` / `/[id]` | Session-gated: list/detail for the Submissions tab |
| GET, PATCH | `/api/feedback/issues` / `/[id]` | Session-gated: issue pipeline list + status/priority/department updates |
| GET | `/api/feedback/stats` | Session-gated: dashboard KPI aggregation |
| GET, POST, PATCH | `/api/feedback/categories` / `/[id]` | Session-gated: category CRUD (soft-delete via `is_active`) |
| GET, PATCH | `/api/feedback/settings` | Session-gated: view/toggle the public form, lazily creates the settings row |
| POST | `/api/feedback/settings/regenerate-code` | Session-gated: mint a new public code (invalidates the old QR poster) |
| GET | `/api/feedback/qr` | Session-gated: PNG QR code encoding the public feedback URL |

## Database tables

| Table | Role |
|-------|------|
| `feedback_settings` | One row per school: public code + active toggle |
| `feedback_categories` | Role-scoped, admin-editable categories with a department for issue routing |
| `feedback_submissions` | One row per public submission: role, identity (or anonymous), free text, voice key, IP hash for rate limiting |
| `feedback_submission_ratings` | One row per (submission, category) rating — the unit the issue pipeline operates on |

## Status history

| Date | Change | Issue |
|------|--------|-------|
| 2026-09-07 | Initial build | #TBD |

## Known issues

- [ ] Full user-flow not smoke-tested against a live database in this environment (no local Postgres available; `.env.local` points at the shared Supabase dev DB, so no test school was created there) — the Playwright spec (`e2e/workflow-feedback-management.spec.ts`) is written but unrun. The DB migrations themselves (new tables, category backfill) *were* run live against that DB during development and are confirmed working, including a real bug caught this way: the category backfill's generated SQL failed on `sort_order`'s type (fixed in `lib/feedback-defaults.ts` with explicit `::integer`/`::varchar` casts — see `/code-review` history)
- [ ] No GitHub issue logged yet — branch is `feature/feedback-management` without an issue number
- [ ] Presigned voice upload has no server-enforced max file size (client-side ~60s recording cap only)
- [ ] `/code-review medium` ran and found several issues, all fixed: missing `is_active`/school-active checks on the public submit and voice-upload routes, no rate limit on voice-upload-url, no dedup/max-size cap on submitted ratings, an unused `cn` npm package pulled in by the shadcn CLI, and three admin tabs missing `res.ok` checks before rendering API responses. A few lower-priority simplification/reuse suggestions (shared fetch-on-mount hook, role-definition duplication across files, adopting the existing Dialog/Table primitives) were deferred as follow-up cleanup, not fixed in this pass.

## Notes

- The public code is intentionally **not** `schools.school_code` (the admin/teacher login identifier) — it's printed on a QR poster anyone can scan or photograph, and must be freely rotatable without ever touching login.
- `APP_URL` (not the request's `host` header) is always used to build the public feedback URL — on `admin.welearnyoulearn.com`, any path outside `/platform-admin`/login routes redirects to platform login (see `proxy.ts`), so a QR code built from that host would dead-end.
- Admin-side routes reuse `requireFeeAccess()` from `lib/auth.ts` for tenant isolation — despite the "Fee" name it's generic school-staff/tenant-match logic, and reusing it avoided a duplicate helper.
- Voice playback for admins is session-gated (unlike `/api/materials/file`'s intentionally-public presigned-GET pattern), since a recording is personally identifying even on an anonymous submission.
- This is the first real use of `zod` in this codebase (added as an explicit dependency) — it was previously only a transitive dependency, and Zustand (also mentioned in `CLAUDE.md`) is still unused; plain `useState`/`useEffect` was used here to match actual codebase norms.
