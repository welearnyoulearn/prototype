# Authentication & Access

**Status:** 3 Built | 2 Partial
**Last updated:** 2026-09-20

---

## Overview

Each portal has its own auth flow using JWT cookies. Platform Admin and School Admin have full auth. Teacher auth is complete. Student and Parent auth are partial.

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| School Staff Auth (school admin / principal / VP) | Built | Login via **own email** + password (School ID is not a login). Server-side revocable sessions (`user_sessions`): 20 min idle / 12 h max, browser-session cookie. Owner adds staff, who get a one-time set-password link (48 h). Login page shows the last-used account (name + email) and always asks for the password. Deactivation, password reset and logout end sessions immediately |
| Platform Admin Auth | Built | Login via email + password. Same JWT flow. Initial setup route (`/api/auth/setup-admin`) |
| Teacher Auth | Built | Login via employee_id + password. Separate JWT cookie (`wlyl_teacher_auth`). First-login flag. Password change |
| Student Auth | Partial | Password hash stored. Change-password API exists. Portal uses dropdown selection (demo mode) — no proper login form |
| Parent Auth | Partial | Lookup by phone + child roll number. No JWT session. No persistent login |

---

## Auth Flow

```
User enters credentials
    → POST /api/auth/login (or /api/auth/teacher-login)
    → Validate credentials against DB
    → Generate JWT (school staff: 12 h cap, carries session id `sid`; other portals 7 days)
    → School staff: insert a user_sessions row, end any previous session in this browser
    → Set HTTP-only cookie (school staff: browser-session cookie)
    → If first_login: redirect to /change-password
    → If school admin first login: redirect to /profile-setup
    → Otherwise: redirect to portal dashboard
```

---

## Known Gaps

- **Student auth:** needs a proper login form instead of dropdown selection
- **Parent auth:** needs JWT session for persistent login instead of lookup-per-visit

---

## School Staff Sessions (#145)

- `getSession()` (lib/auth.ts) validates the JWT **and** the `user_sessions` row (not revoked, within 20 min idle and 12 h max, user not inactive). Normal API calls count as activity; pollers pass `{ passive: true }`.
- `IdleSessionGuard` (mounted by `app/school-admin/layout.tsx`) sends an activity heartbeat (`POST /api/auth/session`) while the user is active, checks validity every 60 s (`GET`, passive) and redirects to `/login?role=school&reason=timeout` once the session has ended.
- A session ends on: logout, login as another user in the same browser, deactivation, password change (other sessions) or reset (all sessions).
- Adding staff: Settings, Staff Accounts, then name, email and role. An invite link is emailed. "Resend Invite Link" voids earlier links.
- The login page keeps `wlyl_last_staff_account` (name, email, role) in localStorage. Never a password or a session.
- Platform "Reset Password" for a school resets only the owner (the account that has a `school_code`).
