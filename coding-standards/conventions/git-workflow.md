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
