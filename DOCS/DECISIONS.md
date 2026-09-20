# Architecture Decision Records

Non-obvious technical decisions and their reasoning for the WLYL School prototype.

<!-- 
## YYYY-MM-DD — Decision title

**Context:** What situation prompted this decision?
**Decision:** What was decided and why?
**Alternatives considered:** What else was evaluated?
**Consequences:** What trade-offs come with this decision?
-->


## 2026-09-20 — Attendance: any teacher marks, first submit locks; holidays live in the Academic Calendar (#153)

**Context:** Attendance let any logged-in user (students and parents too) read and write any class, silently overwrote earlier records, and each portal computed its own percentage. The school calendar existed but nothing used it, so a holiday looked like a day nobody marked, and its routes had no authentication.

**Decision:** Every teacher can mark every class (schools rotate cover). The **first submit locks** a class + date + session through a unique key on `attendance_sessions`, so a second teacher — even one submitting at the same instant — is told who marked it and changes nothing. The marker may correct it the same day; the admin any time; others use "Report a mistake". **Holidays are the Academic Calendar's `holiday` entries** (plus a per-school weekly-off list): one source of truth that the calendar screens, the mark sheet, the server, the analytics and the parent/student calendars all read. All percentages come from one module: (present + late) ÷ marked sessions, holidays out, unmarked days are gaps. Identity comes only from the signed session; parents and students get their own narrow endpoints.

**Alternatives considered:** class-teacher-only marking (rejected: real schools rotate/cover); letting the last write win (rejected: silent data loss); a `holiday` flag on the attendance table (rejected: a holiday is a school fact, not a per-record one); per-class holidays and half-days (deferred); per-session vs per-day percentage (per-session chosen: simple to explain, works for one or two sessions a day).

**Consequences:** One extra table and a backfill (existing days count as already marked). A teacher's mistake on a locked session needs the admin — deliberate. A holiday added over marked days ignores those records while it exists and counts them again if it is deleted (the admin is warned both times). `attendance` plan feature still gates the parent/student tabs. Whole-school, whole-day holidays only. No LEAP integration (no public API).


## 2026-09-20 — Per-person school staff login with revocable server-side sessions (#145)

**Context:** School staff logged in with a shared School ID, so actions could not be tied to a person. Logout only cleared a cookie (a stateless 7-day JWT), a deactivated user kept access until the JWT expired, and the login page offered "Continue to Dashboard" for whoever last left a session open, letting the next person on a shared computer walk into that account without a password.

**Decision:** Email + password only, one account per person (all school staff roles keep identical access). A `user_sessions` row per login; the JWT carries its id (`sid`) and `getSession()` rejects revoked, idle (20 min) or expired (12 h) sessions and inactive users. The cookie is a browser-session cookie. Only real user activity extends the idle timer: API calls and a browser heartbeat do, background pollers (`getSession({ passive: true })`, e.g. the notification bell) do not. Invites use the existing `password_reset_tokens` table with a 48 h expiry rather than emailing a password. The login page remembers only name + email of the last account (localStorage) and always asks for the password.

**Alternatives considered:** Keep School ID login for the owner (rejected: shared credential, no attribution); per-role permissions (deferred: all roles have the same access today); NextAuth/DB sessions library (rejected: project rule is custom JWT, and one small table covers the need); opt-in "Remember me" (rejected by the product owner in favour of always showing the last-used account).

**Consequences:** One extra indexed query per authenticated school-admin API call. `proxy.ts` (Edge) can only check the JWT signature and presence of `sid`, so an idle-expired session is caught on the first API call and by the client-side `IdleSessionGuard`, not at page load. Existing school-admin cookies (no `sid`) are invalidated once. Two people on one computer take turns (logging in ends the previous session); simultaneous use needs separate browsers or devices. The last-used card shows the previous person's name and email to anyone opening the login page on that browser, which is a deliberate product choice. Follow-ups: school audit log, login lockout/rate limiting.


## 2026-09-12 — Syllabus "Translate" uses transliteration via a server-side proxy (#116)

**Context:** Telugu and Hindi teachers could not enter chapter names in their language without installing Google Input Tools or changing keyboards. We want an in-app option.

**Decision:** Sound-based transliteration, not meaning translation: the teacher types "amma prema" and gets అమ్మ ప్రేమ, with alternative spellings to pick. Textbook titles must match exactly, which meaning translation would reword. The browser calls our own staff-only `GET /api/transliterate`, which proxies Google's public Input Tools endpoint (no API key).

**Alternatives considered:** Google Cloud Translation (meaning-based, $20/1M chars, no Latin→Telugu transliteration); Google's free `translate.googleapis.com` (blocked our requests); Groq AI via `lib/gemini.ts` (needs `GROQ_API_KEY`, not configured for this release, weaker on Telugu); client-side libraries like Sanscript (need strict ITRANS spelling teachers won't know); Chrome's built-in Translator API (desktop Chrome only, meaning-based).

**Consequences:** Zero cost and good quality today, but the upstream is undocumented with no SLA (tracked in KNOWN_ISSUES). The proxy route is the seam: swapping to Azure Translator Transliterate later changes only the route, not the UI.


## 2026-07-01 — Data-only backup to R2 + gap-fill-only restore

**Context:** We need protection against accidental data loss (deleted rows) without introducing a way to clobber good data. Vercel serverless cannot run `pg_dump`/`pg_restore` binaries.

**Decision:** Back up in pure Node via the existing `pg` pool (`@/lib/db`) to Cloudflare R2 (S3-compatible, 10 GB free tier, free egress) as gzipped JSON Lines — one header line per table (name, pk, column types) followed by one line per row. Restore is **gap-fill only**: it compares live primary-key sets against the backup and re-inserts only the missing rows with `INSERT ... ON CONFLICT DO NOTHING`. It never runs `UPDATE`/`DELETE`/`TRUNCATE`.

**Alternatives considered:** `pg_dump` on GitHub Actions (full schema+data, but heavier and off-platform — deferred to a separate ticket); a straight overwrite/restore (rejected — would clobber legitimately edited rows and defeats the "lost rows only" product rule).

**Consequences:** Data-only — schema/DDL, RLS, functions, triggers and Supabase Storage files are NOT covered (separate tickets if needed). Restore cannot repair wrongly-edited rows (same PK) by design. Tables without a primary key can't be gap-checked and are skipped + reported. `bytea` columns and jsonb-holding-arrays are edge cases not specially handled. Retention keeps the newest 14 backups to stay within R2's free tier.
