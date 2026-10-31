# Git Workflow

## Branch Naming: `{type}/{short-description}`

```
feature/user-auth    fix/login-bug    hotfix/payment-crash    refactor/api-format    chore/deps
```

## Commit Messages: `type: short description`

```
feat: add Google OAuth login
fix: prevent duplicate form submission
refactor: extract email service
chore: upgrade Next.js to 14.1
test: add Playwright tests for checkout
```

## PR Rules

1. One feature per PR
2. Must pass: type check, lint, tests, build
3. No console.log or commented-out code in production
4. Every PR must be reviewed before merge (see `checklists/code-review.md`)

## Code Review Process

### Workflow
1. Author self-reviews using `checklists/code-review.md` before requesting review
2. Run `/code-review medium` (or higher) for automated review via Claude Code
3. Human reviewer checks correctness, security, and architecture
4. Address all "Request Changes" before merge — no force-merging over objections

### Auto-merge into `dev`
`.github/workflows/auto-merge.yml` replaces step 3 for PRs into `dev`: no human reviewer is needed there. PRs into any other branch still follow the workflow above.

1. Runs on every PR into `dev`, on every push to `dev` (re-checks all open PRs), and by hand with a `pr_number`.
2. Skips forks, drafts, PRs labelled `no-auto-merge`, `[Preserved]` PRs, and PRs that change `.github/workflows/`. Those need a human.
3. On a conflict, merges `dev` into the PR branch and has Claude fix only the conflicted files. If it can't, it comments and stops.
4. Claude reviews the full diff read-only. Anything but an explicit approve from the last review means no merge.
5. On reject, a separate Claude step fixes only the findings, the workflow type-checks and pushes the fix, and a new review runs on the new diff. After two fix rounds it posts the remaining findings and stops. A failed type-check or a fix touching `.github/`, lockfiles, `package.json`, `.env` files or `lib/db.ts` also comments and stops.
6. On approve, it approves the PR and squash-merges that exact commit.

Add the `no-auto-merge` label to keep a PR out of this flow. After it stops, push a fix to run it again.

### Review Priority (what to check first)
1. **Security** — auth, injection, data exposure
2. **Correctness** — does it do what the ticket says?
3. **Performance** — N+1 queries, unnecessary re-renders
4. **Maintainability** — readability, naming, structure
5. **Style** — formatting, conventions (lint should catch most of this)

### Claude Code Review Commands
```bash
/code-review low           # Quick — high-confidence issues
/code-review medium        # Standard review
/code-review high          # Thorough — broader coverage
/code-review ultra         # Deep multi-agent cloud review
/code-review high --comment  # Post findings as PR comments
/code-review medium --fix    # Auto-apply fixes to working tree
```

## .gitignore Essentials

```
node_modules/ .env .env.local .next/ dist/ build/ .DS_Store coverage/ playwright-report/ test-results/
```
