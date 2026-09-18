# Known Issues

Current bugs and workarounds for the WLYL School prototype.

<!-- 
## Active Issues

### [#131] 74 API operations have no session check
- **Severity:** High
- **Detail:** The regenerated OpenAPI spec marks 74 of 362 operations as public. Some are intentional (sign-in, password reset, public feedback form, health). Others expose student data or allow writes without a login, for example attendance analytics, per-student homework submissions and rewards, the weekly test, notification writes and school calendar writes.
- **Workaround:** None. Filter `/api-docs` for "public, no session check" to list them.
- **Status:** Needs a separate issue to triage each route. Out of scope for #131, which only documents current behaviour.

### [#issue-number] Short description
- **Severity:** Critical / High / Medium / Low
- **Workaround:** Description of workaround
- **Status:** Fix in progress — branch `fix/issue-number-description`
- **ETA:** YYYY-MM-DD

## Resolved (remove entries when the fix is deployed)
-->

## Active Issues

### [#116] Syllabus Translate relies on Google's undocumented Input Tools endpoint
- **Severity:** Medium
- **Detail:** `GET /api/transliterate` proxies `inputtools.google.com`, which has no published quota, SLA, pricing or API terms. Google can throttle or block it at any time, and on Vercel all schools share the same outbound IPs.
- **Workaround:** If it fails, teachers see "Translate is unavailable right now" and can still type the name directly (or use a phone keyboard with Telugu/Hindi).
- **Status:** Acceptable for prototype. Before production, swap in Azure Translator's Transliterate API (supports Latin → Telugu and Latin → Devanagari; free tier 2M chars/month, then ~$10 per million) behind the same route. No client change needed.
