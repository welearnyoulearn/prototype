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

### [#358] Two upload screens aren't counted as storage usage
- **Severity:** Low (track-only service, nothing is billed)
- **Detail:** School logos (School Profile) and platform curriculum images upload to Cloudinary, but their save calls don't send the file size, so `storage.upload` misses them.
- **Workaround:** None needed.
- **Status:** Send Cloudinary's `bytes` with those saves when storage starts being charged.

### [#358] Billing must not go live on Vercel Hobby
- **Severity:** High before the first school is charged
- **Detail:** Vercel's Hobby plan forbids commercial use. The monthly bill run, the WhatsApp sends and the plan bills are all commercial.
- **Workaround:** Keep `usage_meters.is_billable` false, or don't assign billed plans, until production is on Vercel Pro or Cloudflare.
- **Status:** Hosting decision Q21 in the platform handoff.

### Local dev DB has an incomplete `plan_features` table
- **Severity:** Low (local only)
- **Detail:** `wlyl_dev` has only 10 rows per tier, so school admins are locked out of most tabs, including School Profile, and land on the Library.
- **Workaround:** Insert the missing keys from `lib/features.ts` (enabled) for each tier in the local DB.
- **Status:** Refresh the local DB from a production-shaped seed.

### [#116] Syllabus Translate relies on Google's undocumented Input Tools endpoint
- **Severity:** Medium
- **Detail:** `GET /api/transliterate` proxies `inputtools.google.com`, which has no published quota, SLA, pricing or API terms. Google can throttle or block it at any time, and on Vercel all schools share the same outbound IPs.
- **Workaround:** If it fails, teachers see "Translate is unavailable right now" and can still type the name directly (or use a phone keyboard with Telugu/Hindi).
- **Status:** Acceptable for prototype. Before production, swap in Azure Translator's Transliterate API (supports Latin → Telugu and Latin → Devanagari; free tier 2M chars/month, then ~$10 per million) behind the same route. No client change needed.
