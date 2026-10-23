# Authentication & Access

**Status:** 5 Built · **Last verified against the code:** 2026-09-21
Full model: [`docs/product/features/00-platform-architecture.md`](../../docs/product/features/00-platform-architecture.md) §5.

---

## Overview

Each portal has its own login and its own cookie. Schools are never selected by the browser: the login decides the school and every school route compares the requested `school_id` with the session.

| Portal | Cookie | Login identifier | Session |
|---|---|---|---|
| Platform Admin | `wlyl-platform` | email + password | JWT 7 days; admin subdomain only |
| School Admin / Principal / VP | `wlyl-auth` | **own email** + password (School ID is not a login) | JWT (12 h cap) + revocable `user_sessions` row: **20 min idle / 12 h max**, browser-session cookie |
| Teacher | `wlyl-teacher` | employee id + password | JWT 7 days |
| Student | `wlyl-student` | system student id (`wlyl-stu-…`) + password | JWT 7 days |
| Parent | `wlyl-parent` | email **or** phone + password | JWT 7 days |

All five have login, logout, change-password, forgot/reset-password (email link) and a date-of-birth step for teacher, student and parent. **WhatsApp OTP is not live** (draft PR #155).

## Flow

```
credentials → POST /api/<portal>/auth/login → verify hash → sign JWT → HTTP-only cookie
first login → forced password change; school admin first login → /profile-setup
proxy.ts (Edge, jose only) redirects page requests without a valid cookie
each API route re-checks the session in Node (lib/auth.ts)
```

- `lib/auth-constants.ts` holds the cookie names and JWT secret so the Edge (`proxy.ts`) and Node runtimes cannot drift. In production the app **refuses to start without `JWT_SECRET`**.
- `proxy.ts` (not `middleware.ts`) is the Edge gate; it also blocks Platform Admin on the main domain and feeds Watchline.

## School staff sessions (#145)

- `getSession()` validates the JWT **and** the `user_sessions` row (not revoked, within 20 min idle and 12 h max, user active). Normal API calls count as activity; pollers pass `{ passive: true }`.
- `IdleSessionGuard` (mounted by `app/school-admin/layout.tsx`) heart-beats (`POST /api/auth/session`) and checks validity every 60 s, redirecting to `/login?role=school&reason=timeout`.
- A session ends on: logout, login as another user in the same browser, deactivation, password change (others) or reset (all).
- Adding staff: Settings → Staff Accounts → name, email, role. A one-time set-password link (48 h) is emailed; "Resend Invite Link" voids earlier links.
- The login page keeps `wlyl_last_staff_account` (name, email, role) in `localStorage` — never a password or session.
- Platform "Reset Password" for a school resets only the owner (the account with a `school_code`).

## Known gaps

- Several state-changing API routes have no session check — see `docs/KNOWN_ISSUES.md` (#131) and the architecture dossier §12.1.
- No 2FA or SSO. Two parallel teacher-auth route sets exist (`/api/teacher-auth/*`, `/api/teacher/auth/*`).

## Related

- [settings.md](settings.md), [staff.md](staff.md)
