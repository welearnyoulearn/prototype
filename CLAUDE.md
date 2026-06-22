# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Prototype Project — WLYL School

## Coding Standards

Read and follow ALL standards in this project's `coding-standards/` folder before writing any code:
- `coding-standards/STANDARDS.md` — tech stack, rules, conventions
- `coding-standards/conventions/issue-workflow.md` — how bugs/features flow from discovery to resolution
- `coding-standards/checklists/bug-fix.md` — follow for every bug fix
- `coding-standards/checklists/feature-development.md` — follow for every new feature
- `coding-standards/checklists/code-review.md` — follow for every PR
- `coding-standards/conventions/git-workflow.md` — branch naming, commits, PR rules

## Issue Workflow

1. **Every bug or feature MUST be logged as a GitHub Issue before work starts** — no "quick fixes" without a record
2. **Branch names include the issue number:** `fix/42-login-bug` or `feature/55-dashboard`
3. **PRs link to issues:** use `Closes #42` in the PR description
4. **Bugs:** reproduce locally → write failing test → fix → verify → follow bug-fix checklist
5. **Features:** understand requirements → build incrementally → test as you go → follow feature-dev checklist
6. **Critical bugs:** hotfix branch → minimal fix → fast-track review → deploy immediately → post-mortem

## Project Tracking

Maintain these files in `docs/`:
- `docs/CHANGELOG.md` — what shipped per release
- `docs/KNOWN_ISSUES.md` — current bugs and workarounds
- `docs/DECISIONS.md` — architecture decision records
- `docs/post-mortems/` — post-mortems for critical bugs

## Wiki — Living Documentation

The `wiki/` folder is the living documentation of this project. Read it to understand what exists and what's in progress.

- **[wiki/README.md](wiki/README.md)** — Index of all wiki docs
- **[wiki/features/](wiki/features/)** — Feature docs per portal (school-admin, teacher, student, parent, platform-admin, display, auth)
- **[wiki/tasks/completed.md](wiki/tasks/completed.md)** — All finished work
- **[wiki/tasks/in-progress.md](wiki/tasks/in-progress.md)** — Currently active work
- **[wiki/tasks/planned.md](wiki/tasks/planned.md)** — Upcoming features

### Rules for maintaining the wiki:
1. **After completing a feature or bug fix:** update the relevant feature doc in `wiki/features/` and move the task entry to `wiki/tasks/completed.md`
2. **When starting new work:** add an entry to `wiki/tasks/in-progress.md`
3. **When a feature status changes** (Planned → Partial → Built): update both the feature doc and `wiki/tasks/planned.md`
4. **Use the template** at `wiki/features/_template.md` when documenting new features

## Project Rules

- TypeScript strict mode — no `any` type
- All interactive UI elements MUST have `data-testid` for Playwright
- Supabase = database only — never use Supabase Auth
- Tailwind + shadcn/ui for styling
- Zustand for client state
- Zod for all input validation
- pnpm as package manager

## Commands

```bash
npm run dev          # Start dev server (webpack mode, not turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run test:e2e     # Playwright e2e tests
npm run test:e2e:ui  # Playwright with UI
```

## Architecture

### Multi-portal Next.js App Router
Five portals in one Next.js app, separated by route prefix and JWT cookie:

| Portal | Route | Cookie | Role |
|--------|-------|--------|------|
| Platform Admin | `/platform-admin` | `wlyl_admin_token` | `platform_admin` |
| School Admin | `/school-admin` | `wlyl_admin_token` | `school_admin` |
| Teacher | `/teacher` | `wlyl_teacher_token` | `teacher` |
| Student | `/student` | `wlyl_student_token` | `student` |
| Parent | `/parent` | `wlyl_parent_token` | `parent` |

Platform Admin is served on `admin.welearnyoulearn.com` subdomain only — blocked on main domain via `middleware.ts`.

### Auth
- `lib/auth.ts` — JWT sign/verify, cookie set/clear, session helpers per role, `requireFeeAccess()`, `schoolHasFeature()`
- **Never import `lib/auth.ts` or `lib/db.ts` in `middleware.ts`** — Edge runtime only supports `jose`, not `jsonwebtoken` or `pg`
- `middleware.ts` uses `jose`'s `jwtVerify` with cookie names hardcoded inline

### Database
- `lib/db.ts` — single `pg.Pool`, auto-runs migrations via `initDB()` / `ensureDB()` on cold start
- All migrations are idempotent (`IF NOT EXISTS`, `IF NOT EXISTS` indexes, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
- Add new migrations at the **bottom** of the `migrations[]` array in `lib/db.ts`
- Supabase PgBouncer in session mode — pool `max: 1` on Vercel, `max: 10` locally

### Feature Flags (two-layer)
- `plan_features` table — feature enabled/disabled per tier (basic/standard/premium)
- `school_feature_overrides` table — per-school override takes precedence
- `schoolHasFeature(schoolId, featureKey)` in `lib/auth.ts` — checks override first, then tier, returns `false` by default
- Feature keys in `lib/features.ts` — `OVERRIDABLE_FEATURE_KEYS = ['online-payments', 'whatsapp']`

### Fee Management
- `app/school-admin/components/FeeManagement.tsx` — large single component (~4000 lines), tabs: overview/setup/ledger/collect/students/reports/yearend + optional online-payments/whatsapp
- `requireFeeAccess(school_id)` — tenant isolation guard used in all fee API routes
- Ledger sorted by `grade, section, school_roll_number NULLS LAST, name`

### Student Roll Number
- `school_roll_number INTEGER` — class roll number assigned by school, unique per `(school_id, grade, section)`
- Separate from `roll_number VARCHAR` which is the internal system ID (`wlyl-stu-{slug}-{num}`)
- Excel template served from `/api/students/template` via ExcelJS

### Encryption
- `lib/encryption.ts` — AES-256-GCM, key from `ENCRYPTION_KEY` env var (64-char hex = 32 bytes)
- Used for Cashfree secret key and WhatsApp access token at rest

### Branch Strategy
- `wlylV1` — dev/testing branch (Vercel preview)
- `wlylV1_main` — production branch (welearnyoulearn.com), requires PR to merge
- `dev` — separate feature branch
- **Never commit online payments / WhatsApp code to `wlylV1_main` without explicit approval**
- Never auto-push — commit locally, push only when told

### Email
- `lib/email.ts` — Resend API, `EMAIL_FROM` env var
- Welcome emails sent fire-and-forget (`.catch(console.error)`) — never block the response

### Key Env Vars
```
DATABASE_URL          # Supabase connection string
JWT_SECRET            # JWT signing secret
ENCRYPTION_KEY        # 64-char hex for AES-256-GCM
RESEND_API_KEY        # Transactional email
APP_URL               # Base URL for email links
WHATSAPP_VERIFY_TOKEN # Meta webhook verification
WHATSAPP_APP_SECRET   # Meta webhook HMAC secret
```
