# Known Issues

Current bugs and workarounds for the WLYL School prototype.

<!-- 
## Active Issues

### [#issue-number] Short description
- **Severity:** Critical / High / Medium / Low
- **Workaround:** Description of workaround
- **Status:** Fix in progress — branch `fix/issue-number-description`
- **ETA:** YYYY-MM-DD

## Resolved (remove entries when the fix is deployed)
-->

## Active Issues

### [#152] Parent WhatsApp reset does nothing in production until WhatsApp is configured
- **Severity:** High (blocks release of the feature, not the app)
- **Detail:** Without `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`, production sends no code (development prints it to the console). The parent still sees "we sent a code".
- **Workaround:** Use "Use email instead" on the forgot-password page, or have the school admin reset credentials.
- **Status:** Complete the Meta setup in `docs/WHATSAPP-SETUP.md`, then merge to production.

### [#152] Resetting a parent's password does not sign out their other sessions
- **Severity:** Low
- **Detail:** Parent sessions are stateless 7-day cookies, so a device that was already signed in stays signed in after a reset.
- **Workaround:** None. School-staff sessions are revocable; parent sessions would need the same treatment.
- **Status:** Follow-up.

### [#152] Parents stored with a non-Indian or malformed phone can't use the code flow
- **Severity:** Low
- **Detail:** Only 10-digit Indian mobiles are accepted. Older rows in other formats still sign in and are matched by last 10 digits, but a number that isn't a valid Indian mobile won't receive a code.
- **Workaround:** The school corrects the parent phone on the student record; or the parent uses email reset.
- **Status:** Accepted.

### [#131] 75 API operations have no session check
- **Severity:** High
- **Detail:** The OpenAPI spec marks 75 of 362 operations as public. Some are intentional (sign-in, password reset, public feedback form, health, the spec itself). Others expose student data or allow writes without a login, for example attendance analytics, per-student homework submissions and rewards, the weekly test, notification writes and school calendar writes. `/api-docs` is public by product decision, so this list is visible to anyone.
- **Workaround:** None. Search `/api-docs` for routes with the red Public badge.
- **Status:** Needs a separate issue to triage each route. Out of scope for #131, which only documents current behaviour.

### [#116] Syllabus Translate relies on Google's undocumented Input Tools endpoint
- **Severity:** Medium
- **Detail:** `GET /api/transliterate` proxies `inputtools.google.com`, which has no published quota, SLA, pricing or API terms. Google can throttle or block it at any time, and on Vercel all schools share the same outbound IPs.
- **Workaround:** If it fails, teachers see "Translate is unavailable right now" and can still type the name directly (or use a phone keyboard with Telugu/Hindi).
- **Status:** Acceptable for prototype. Before production, swap in Azure Translator's Transliterate API (supports Latin → Telugu and Latin → Devanagari; free tier 2M chars/month, then ~$10 per million) behind the same route. No client change needed.
