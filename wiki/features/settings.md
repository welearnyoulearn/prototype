# Feature: School Settings

**Platform Admin feature key:** `settings`
**Portal:** School Admin
**Status:** Built (working on dev)
**Last verified against the code:** 2026-09-21

---

## What it does

Set up the school and manage who can sign in.

## Who uses it

School admin (owner).

## How it works

- School profile, academic years (create, set current, history/export), grading and other settings.
- **Staff accounts:** a **school administrator** invites principals/vice principals/admins by email — the invitee gets a one-time set-password link (no password is emailed); resend the link; deactivate (their session ends immediately, unused links are voided) and reactivate. Principals and vice principals can see the list but not change it. Every create / deactivate / reactivate is recorded (who, when) in `staff_account_events`.
- Change your own password (signs you out elsewhere); view the plan and enabled features.

## Rules and limits

- Each person has their own login; staff sessions last 20 minutes idle / 12 hours maximum.
- Platform 'reset password' resets only the owner account — and reactivates it if it had been deactivated, so a locked-out school can always be recovered.
- **Seat limit per plan** (`plan_pricing.staff_limit`, set by the platform admin, same for every school on a plan): No plan 1 · Basic 2 · Standard 5 · Premium unlimited. Active accounts count (including invites not yet accepted). Adding **and reactivating** both need a free seat. A blank limit means unlimited and is kept across deploys.
- **Plan end date.** A plan runs from `plan_start_date` to `plan_end_date`. The term starts (today → +1 year) only on first activation, on No plan → paid, or when the previous plan ended and its 14-day grace is over. Re-saving a plan or changing tier mid-term **keeps the dates** (it used to renew for a year on every save). The platform admin renews (`Renew 1 year` = later of today / current end + 1 year) or sets an exact end date on the school page; all changes go to the audit log. Status: active → *expiring* (≤30 days) → *grace* (14 days, everything works) → *expired*. The platform admin picks the end date (default 1 year, presets, or *No expiry*) when assigning a plan. Staff see a banner on every page from 30 days before the end (dismissible until grace), and the administrator / principal get a reminder window at login once a day from 10 days before, through grace and expiry, with a *Request renewal* button (one request per school per day, emailed to the platform admins and audited); teachers, students and parents see nothing until the school is locked. **Request renewal** is also on Settings → Plan, and the request appears in Platform Admin → Renewals (see platform-admin.md). Reminder emails (30 / 7 / 1 days, ended, grace over) come from the daily cron `/api/cron/plan-expiry`, once each per end date. **Expiry never deletes data or disables logins.** After the grace period the school is **locked** (only when `PLAN_EXPIRY_ENFORCED=true`): teachers, students and parents can no longer log in (their sessions are refused too — parents can't pay fees either), and the school administrator / principal can sign in only to **export the school's data** (Excel: students, parents, teachers, staff, classes, fees, attendance, exams and marks, or everything in one file — passwords never included, every export audited) and to **request a renewal**. `proxy.ts` answers every other request `403 PLAN_EXPIRED`, so no route can forget it. Nothing is ever deleted, and renewing restores everything within ~15 seconds (the proxy caches the list of locked schools).
- **Plan changes and seats.** Seats are active accounts only; a plan change never switches anybody off.
  - *Downgrade that leaves the school over the new limit* (e.g. Standard with 5 active → Basic, limit 2): the platform admin is shown the exact numbers and must confirm; nothing is applied until they do. The school then keeps every account working but is **over its limit** — it cannot add or reactivate until it deactivates enough accounts (or upgrades). Its administrators get an email and a banner in Settings → Staff Accounts.
  - *Deactivate first, then downgrade:* once active accounts fit the new limit there is no warning at all. Deactivated accounts are kept.
  - *Upgrade:* seats open up, but nobody is reactivated automatically — the school clicks Reactivate (or adds someone new).
  - *Lowering a plan's limit for every school* (Feature Plans page): the platform admin sees how many schools it pushes over, and which, and must confirm; those schools are handled exactly as above and emailed.
  - Every plan change and limit change is written to the platform audit log with the admin's email, the from/to plan and the seat numbers. Re-saving the same plan never asks for confirmation.
- The last active school administrator cannot be deactivated, and nobody can deactivate themselves.
- A deactivated person's email stays reserved (it is unique across all schools): use **Reactivate**, not Add.
- The plan itself (`/api/schools/{id}/subscription`) can be read only by the platform admin or staff of that school, and changed only by the platform admin.
- **Danger Zone (Export My Data / Request Account Closure) is removed.** Its export sent a manual request to WLYL support with up to a 2-business-day wait; that's superseded by the instant Excel export on Settings → Plan (and the locked-account screen). Request Account Closure had no replacement — removed with no equivalent. `POST /api/school-admin/account-request` no longer exists. (#249)

## Code evidence

<!-- AUTO:evidence:settings:start (generated by scripts/product-docs.mjs — do not edit by hand) -->
**Code evidence** — checked against the repository on every run of `node scripts/product-docs.mjs`.

Screens: `app/school-admin/components/SchoolSettings.tsx`, `app/school-admin/components/StaffProfile.tsx`

API routes these screens call (all exist):
- `GET/PATCH/POST/PUT` /api/academic-years
- `GET` /api/academic-years/{}/history
- `GET` /api/academic-years/{}/snapshot-export
- `POST` /api/auth/change-password
- `POST` /api/auth/logout
- `GET` /api/auth/me
- `GET` /api/plan/status
- `GET/POST` /api/platform/features
- `DELETE/GET/PATCH/POST` /api/school-admin/staff-accounts
- `POST` /api/school-admin/staff-accounts/resend
- `DELETE/GET/PUT` /api/schools/{}
- `GET/PUT` /api/schools/{}/subscription
- `POST` /api/upload/sign

✅ Every API route the screens call exists.
<!-- AUTO:evidence:settings:end -->

## Related

- Deep dossier: [School Settings](../../docs/product/features/18-school-settings.md)
- [staff.md](staff.md)
- [auth.md](auth.md)
- [year-rollover.md](year-rollover.md)

## Status history

| Date | Change | Issue |
|------|--------|-------|
| 2026-09-21 | Doc created from the code; status checked with `scripts/product-docs.mjs` | #162 |
| 2026-09-26 | Plan end date: no more silent renewal on re-save, renew / set end date, status badges, school banner, reminder cron, optional enforcement | #236 |
| 2026-09-26 | Plan-change handling for staff seats: confirm-before-downgrade with exact numbers, over-limit state (no auto-disable, adds/reactivations blocked), school banner + email, confirm before lowering a plan's limit, plan changes in the audit log | #235 |
| 2026-09-26 | Staff-accounts hardening: plan endpoint now needs a login (was open to anyone), accounts can only be created in your own school and only by a school administrator, reactivation respects the seat limit, last-admin and platform-recovery protection, deactivation voids unused links, audit history, safer limit saving | #234 |
