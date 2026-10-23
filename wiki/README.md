# WLYL School Platform — Wiki

> Living documentation. Snapshot = the `dev` branch. Update it when a feature ships, changes or is removed.

## Where to read what

| You want | Read |
|---|---|
| **Deep, per-feature dossiers** (product brief, end-to-end flow, business rules, developer reference, pitch kit) | [`docs/product/features/`](../docs/product/features/README.md) |
| Architecture, roles and plans | [`00-platform-architecture.md`](../docs/product/features/00-platform-architecture.md), [`00-roles-access-and-plans.md`](../docs/product/features/00-roles-access-and-plans.md) |
| Short feature summaries + **computed code evidence** (the guard test reads these) | [`features/CATALOG.md`](features/CATALOG.md) and `features/<feature>.md` |
| The single source of facts for decks and documents | [`docs/product/PRODUCT-FACTBOOK.md`](../docs/product/PRODUCT-FACTBOOK.md) |
| Attendance in full technical depth | [`docs/ATTENDANCE.md`](../docs/ATTENDANCE.md) |
| Syllabus in full technical depth | [`docs/SYLLABUS-FEATURE-README.md`](../docs/SYLLABUS-FEATURE-README.md), [`features/syllabus-module-workflow.md`](features/syllabus-module-workflow.md) |
| Authentication and sessions | [`features/auth.md`](features/auth.md) |
| Platform Admin portal | [`features/platform-admin.md`](features/platform-admin.md) |
| Backup and restore | [`features/backup-restore.md`](features/backup-restore.md) |
| Decisions, changelog, known issues | [`docs/DECISIONS.md`](../docs/DECISIONS.md), [`docs/CHANGELOG.md`](../docs/CHANGELOG.md), [`docs/KNOWN_ISSUES.md`](../docs/KNOWN_ISSUES.md) |
| API reference | `/api-docs` (source: [`docs/openapi.json`](../docs/openapi.json)) |

## Task log

| Log | What it tracks |
|-----|---------------|
| [Completed](tasks/completed.md) | Shipped work, newest first |
| [In progress](tasks/in-progress.md) | Active work |
| [Planned](tasks/planned.md) | Roadmap (intentions, not commitments) |

## Rules for maintaining the wiki

1. **Feature shipped/changed/removed:** edit `wiki/features/<feature>.md` and `wiki/features/feature-map.json`, update the matching dossier in `docs/product/features/`, then run `node scripts/product-docs.mjs` and commit the regenerated `CATALOG.md` and factbook (see `.claude/skills/update-product-docs/SKILL.md`).
2. **Starting work:** add an entry to `tasks/in-progress.md`. **Finishing:** move it to `tasks/completed.md`.
3. Never describe a removed or planned feature as live. Use the template `features/_template.md` for new feature docs.

> The old database ERD diagrams were removed because they described a much earlier schema (60+ tables; the code now has 130). The domain-level data model is in the architecture dossier §7; ask to regenerate a fresh ERD from `lib/db.ts` if you need one for due diligence.
