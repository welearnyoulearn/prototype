# Platform Admin Portal

**Route:** `/platform-admin` (admin subdomain only) · **Cookie:** `wlyl-platform` · **Status:** Built · **Last verified against the code:** 2026-09-21

Full detail: [`docs/product/features/21-platform-admin-portal.md`](../../docs/product/features/21-platform-admin-portal.md).

## What it does

The WLYL team's console: create schools, set plans, switch features per plan and per school, manage the master syllabus and library, watch usage and API health, and keep an audit trail.

| Section | Screen | Main API |
|---|---|---|
| Schools | `app/platform-admin/page.tsx`, `schools/[id]` | `/api/schools`, `/api/schools/{id}`, `/subscription`, `/ai-access`, `/api/platform/schools/{id}/feature-overrides`, `/api/platform/schools/reset-password` |
| Master Syllabus | `curriculum/` | `/api/platform/subjects`, `/chapters`, `/topics`, `/tasks`, `/syllabus/bulk-import` |
| Digital Library | `library/` | `/api/platform/library`, `/materials` |
| Feature Plans | `features/` | `/api/platform/features` |
| Usage Analytics | `usage-analytics/` | `/api/platform/usage-analytics` (+ growth, feature-adoption, school-health) |
| Watchline | `logs/` | `/api/platform/watchline`, `/api/internal/*` |
| Audit Log | `audit/` | `/api/platform/audit` |
| Admins | — | `/api/platform/admins`, `/admins/{id}/reset` |

## Rules

- Changing a school's plan, or lowering a plan's staff limit, asks for confirmation when it would leave schools with more active staff than the new limit (numbers shown; nobody is disabled). Both are recorded in the audit log with the admin and the seat numbers — see settings.md.
- **Renewals** (`renewals/`, `/api/platform/renewals`): the queue of schools that asked to renew. Each request shows the school, plan, end date and status, who asked, and contact details; the admin can add notes, mark it contacted, dismiss/reopen it, or **Set next plan…** (plan + new end date, with a confirmation if it leaves the school over its staff limit). Applying a plan — here or on the school page — closes the school's waiting request as *Renewed* and records the agreed plan and end date. The nav item shows a badge with the number of new requests.
- Assigning a plan takes an end date (default one year; presets; or *No expiry*). Renew 1 year and the status badges are on the school page and list.
- Feature flags are two-layer: tier (`plan_features`) then per-school override (`school_feature_overrides`); Watchline is per school only.
- "Reset password" for a school resets only the owner account.
- **Known security gap:** several `/api/platform/*` routes and `/api/schools/{id}/subscription` have no auth guard (see `docs/KNOWN_ISSUES.md`).

## Related

- Deep dossier: [Platform Admin](../../docs/product/features/21-platform-admin-portal.md)
- [auth.md](auth.md)
