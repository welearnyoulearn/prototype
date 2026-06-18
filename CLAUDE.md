# Prototype Project — WLYL School

## Coding Standards

Read and follow ALL standards from the workspace root before writing any code:
- `../../coding-standards/STANDARDS.md` — tech stack, rules, conventions
- `../../coding-standards/conventions/issue-workflow.md` — how bugs/features flow from discovery to resolution
- `../../coding-standards/checklists/bug-fix.md` — follow for every bug fix
- `../../coding-standards/checklists/feature-development.md` — follow for every new feature
- `../../coding-standards/checklists/code-review.md` — follow for every PR
- `../../coding-standards/conventions/git-workflow.md` — branch naming, commits, PR rules

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
