# Known Issues

Current bugs and workarounds for the WLYL School prototype.

<!-- 
## Active Issues

### [#153] No direct LEAP (AP govt attendance app) integration
- **Severity:** Low (manual route exists)
- **Detail:** LEAP has no public API or bulk import that we could find. Attendance still has to be keyed into LEAP by the school.
- **Workaround:** Admin → Attendance → export the **daily absentee list** (`/api/export/attendance?mode=absentees&date=`); LEAP marks everyone present by default, so only absentees need entering.
- **Status:** Ask the LEAP/CSE helpdesk whether an import or API exists for private schools; build a connector if so.

### [#153] Holidays are whole-school and whole-day
- **Severity:** Low
- **Detail:** No class/grade-specific closures (e.g. Grade 10 study leave) and no half-day holidays.
- **Workaround:** None — add the entry as a holiday only when the whole school is closed.
- **Status:** Follow-up if schools ask.

### [#153] Attendance and Academic Calendar screens follow the platform plan features
- **Severity:** Low
- **Detail:** The portals hide plan-gated tabs: no Attendance tab without the `attendance` feature, no calendar screens without the `calendar` (Academic Calendar) feature.
- **Workaround:** Platform admin → plan features → enable Attendance and Academic Calendar for the tier.
- **Status:** As designed.

### [#153] `workflow-school-admin.spec.ts` step 7 fails in a brand-new database
- **Severity:** Low (test only)
- **Detail:** It fails at the school-admin profile-setup step (`Step 1 of 2`), before reaching attendance.
- **Status:** Existing; needs its own look.


### [#issue-number] Short description
- **Severity:** Critical / High / Medium / Low
- **Workaround:** Description of workaround
- **Status:** Fix in progress — branch `fix/issue-number-description`
- **ETA:** YYYY-MM-DD

## Resolved (remove entries when the fix is deployed)
-->

## Active Issues

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
