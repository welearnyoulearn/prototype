# Authentication & Access

**Status:** 3 Built | 2 Partial
**Last updated:** 2026-06-18

---

## Overview

Each portal has its own auth flow using JWT cookies. Platform Admin and School Admin have full auth. Teacher auth is complete. Student and Parent auth are partial.

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| School Admin Auth | Built | Login via school_code + password. JWT cookie (7d). First-login force password change. Profile setup. Forgot/reset password via email |
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
    → Generate JWT (7-day expiry)
    → Set HTTP-only cookie
    → If first_login: redirect to /change-password
    → If school admin first login: redirect to /profile-setup
    → Otherwise: redirect to portal dashboard
```

---

## Known Gaps

- **Student auth:** needs a proper login form instead of dropdown selection
- **Parent auth:** needs JWT session for persistent login instead of lookup-per-visit
