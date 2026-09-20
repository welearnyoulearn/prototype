# Architecture Decision Records

Non-obvious technical decisions and their reasoning for the WLYL School prototype.

<!-- 
## YYYY-MM-DD — Decision title

**Context:** What situation prompted this decision?
**Decision:** What was decided and why?
**Alternatives considered:** What else was evaluated?
**Consequences:** What trade-offs come with this decision?
-->

## 2026-09-20 — Per-person school staff login with revocable server-side sessions (#145)

**Context:** School staff logged in with a shared School ID, so actions could not be tied to a person. Logout only cleared a cookie (a stateless 7-day JWT), a deactivated user kept access until the JWT expired, and the login page offered "Continue to Dashboard" for whoever last left a session open, letting the next person on a shared computer walk into that account without a password.

**Decision:** Email + password only, one account per person (all school staff roles keep identical access). A `user_sessions` row per login; the JWT carries its id (`sid`) and `getSession()` rejects revoked, idle (20 min) or expired (12 h) sessions and inactive users. The cookie is a browser-session cookie. Only real user activity extends the idle timer: API calls and a browser heartbeat do, background pollers (`getSession({ passive: true })`, e.g. the notification bell) do not. Invites use the existing `password_reset_tokens` table with a 48 h expiry rather than emailing a password. The login page remembers only name + email of the last account (localStorage) and always asks for the password.

**Alternatives considered:** Keep School ID login for the owner (rejected: shared credential, no attribution); per-role permissions (deferred: all roles have the same access today); NextAuth/DB sessions library (rejected: project rule is custom JWT, and one small table covers the need); opt-in "Remember me" (rejected by the product owner in favour of always showing the last-used account).

**Consequences:** One extra indexed query per authenticated school-admin API call. `proxy.ts` (Edge) can only check the JWT signature and presence of `sid`, so an idle-expired session is caught on the first API call and by the client-side `IdleSessionGuard`, not at page load. Existing school-admin cookies (no `sid`) are invalidated once. Two people on one computer take turns (logging in ends the previous session); simultaneous use needs separate browsers or devices. The last-used card shows the previous person's name and email to anyone opening the login page on that browser, which is a deliberate product choice. Follow-ups: school audit log, login lockout/rate limiting.

## 2026-09-20 — Parent password reset by WhatsApp one-time code from one platform-owned sender (#152)

**Context:** Many parents have no email, and the existing reset link went by email only (the WhatsApp send was a scaffold that never sent). Parents sign in with a phone number, so a code to that same number is the natural recovery path.

**Decision:** A 6-digit code sent through Meta's WhatsApp Cloud API using an Authentication-category template, from ONE WLYL-owned number paid by WLYL, not per-school accounts. Codes live in `otp_challenges` as an HMAC bound to the phone number (5 min, single use, 5 attempts). A challenge row is written for every request, including unregistered numbers, and the send happens after the response, so limits, body and timing don't reveal who is registered. A correct code is traded for a 10-minute single-use ticket (`password_reset_tokens.role = 'parent_otp'`) used only by `/otp/reset`, which updates every parent account on that number (the same person can have children at several schools). Parent phones are validated as 10-digit Indian mobiles at every entry point and stored as the bare number; lookups compare the last 10 digits so older, differently formatted rows still match.

**Alternatives considered:** SMS OTP (needs DLT registration and costs more per message in India); per-school WhatsApp accounts (each school would need its own verified Meta business; the per-school table stays for fee reminders); a BSP such as AiSensy (monthly fee plus markup for no benefit here); email-only reset (excludes parents without email); revealing "number not registered" (enumeration).

**Consequences:** About ₹0.14 per code (Meta list price plus GST), bounded by per-phone, per-IP and daily caps. Nothing is delivered in production until WhatsApp credentials are set, so production must not ship this before then. Only Indian mobiles are supported; parents stored with other numbers can't use the code flow until a school corrects the number. Resetting a password does not sign out an already-logged-in parent (parent sessions are stateless 7-day cookies). Registered numbers do a few extra queries, so a very fine timing side-channel remains.


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
