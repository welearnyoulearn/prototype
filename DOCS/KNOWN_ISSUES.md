# Known Issues

Current bugs and workarounds for the WLYL School prototype.

## Active Issues

### [#98] Public feedback submit endpoint has no rate-limiting/spam protection
- **Severity:** Low
- **Workaround:** None — accepted for v1. Matches existing precedent (`app/api/parent/lookup` also has no rate limiting).
- **Status:** Deliberately deferred, not a bug. Revisit if abuse is observed in production.

### [#99] Public feedback photo upload-sign endpoint has no rate-limiting/spam protection
- **Severity:** Low
- **Workaround:** None — accepted trade-off for a public, anonymous form. Scoped as tightly as an open relay reasonably can be: image-only Cloudinary endpoint (`/image/upload`, not `/auto/upload`), `allowed_formats` restricted, per-school folder, and only signs uploads for schools that have explicitly turned the Photo field on in Form Settings. Client-side 5MB size guard is UX-only, not a security control.
- **Status:** Deliberately deferred, not a bug. Revisit if abuse is observed in production.

<!-- 
## Active Issues

### [#issue-number] Short description
- **Severity:** Critical / High / Medium / Low
- **Workaround:** Description of workaround
- **Status:** Fix in progress — branch `fix/issue-number-description`
- **ETA:** YYYY-MM-DD

## Resolved (remove entries when the fix is deployed)
-->
