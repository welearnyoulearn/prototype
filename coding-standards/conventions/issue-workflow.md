# Issue Workflow: Features & Bugs

## How Issues Arise

### Bug Discovery

| Source | Example | Priority |
|--------|---------|----------|
| **User report** | Customer emails, support tickets, feedback forms | Triage within 24h |
| **Monitoring / logs** | Error spikes, failed health checks, Sentry alerts | Triage immediately |
| **QA / testing** | Playwright failures, manual testing finds regression | Triage within 24h |
| **Code review** | Reviewer spots a logic error or security issue | Block the PR |
| **Self-discovered** | Developer notices something wrong while working | Log it, don't context-switch |

### Feature Requests

| Source | Example | Priority |
|--------|---------|----------|
| **Product decision** | Planned roadmap item, business requirement | Schedule into sprint |
| **User feedback** | Repeated customer requests, usability complaints | Evaluate and prioritize |
| **Technical need** | Performance bottleneck, scaling requirement, tech debt | Evaluate impact vs. effort |
| **Dependency** | Another feature requires this first | Prioritize as blocker |

---

## Issue Logging

Every bug or feature MUST be logged before work begins. No "just fixing it real quick" without a record.

### Where to Log

Use **GitHub Issues** as the single source of truth for all projects.

### Bug Report Format

```markdown
**Title:** [Component] Short description of what's broken

**Type:** Bug
**Severity:** Critical / High / Medium / Low
**Found by:** [Name] — [Source: user report / monitoring / QA / code review / self]
**Date found:** YYYY-MM-DD
**Environment:** Production / Staging / Local

## What happened
[Describe the actual behavior]

## What should happen
[Describe the expected behavior]

## Steps to reproduce
1. Go to ...
2. Click ...
3. Observe ...

## Evidence
[Screenshots, error logs, Sentry link, network tab output]

## Impact
[Who is affected? How many users? Is there a workaround?]
```

### Feature Request Format

```markdown
**Title:** [Area] Short description of the feature

**Type:** Feature
**Priority:** Must-have / Should-have / Nice-to-have
**Requested by:** [Name] — [Source: product / user feedback / technical need]
**Date logged:** YYYY-MM-DD

## Problem
[What problem does this solve? Why does it matter?]

## Proposed solution
[High-level description of the feature]

## Acceptance criteria
- [ ] [Specific, testable condition]
- [ ] [Specific, testable condition]
- [ ] [Specific, testable condition]

## Out of scope
[What this feature does NOT include — prevents scope creep]

## Design / Mockups
[Links or descriptions if available]
```

---

## Severity Levels (Bugs)

| Level | Definition | Response Time | Examples |
|-------|-----------|---------------|----------|
| **Critical** | App is down, data loss, security breach | Fix within hours | Payment processing broken, auth bypass, DB corruption |
| **High** | Major feature broken, no workaround | Fix within 1-2 days | Users can't sign up, search returns wrong results |
| **Medium** | Feature partially broken, workaround exists | Fix within 1 week | Export fails for large datasets, UI glitch on mobile |
| **Low** | Minor inconvenience, cosmetic | Fix when convenient | Typo in UI, alignment off by a few pixels |

---

## Development Workflow

### For Bugs

```
1. Issue logged in GitHub Issues
2. Assign severity and owner
3. Create branch: fix/{issue-number}-{short-description}
4. Reproduce the bug locally (MUST succeed before writing code)
5. Write a failing test that captures the bug
6. Fix the bug
7. Verify the test passes
8. Self-review using checklists/bug-fix.md
9. Open PR, link to issue
10. Code review (human + /code-review)
11. Merge → auto-close issue
12. Verify fix in staging/production
```

### For Features

```
1. Issue logged in GitHub Issues
2. Assign priority and owner
3. Break into sub-tasks if the feature takes > 2 days
4. Create branch: feature/{issue-number}-{short-description}
5. Build incrementally — commit working states, not WIPs
6. Write Playwright tests for critical paths as you go
7. Self-review using checklists/feature-development.md
8. Open PR, link to issue
9. Code review (human + /code-review)
10. Merge → auto-close issue
11. Verify in staging/production
```

### For Hotfixes (Critical bugs in production)

```
1. Issue logged with Critical severity
2. Create branch: hotfix/{issue-number}-{short-description}
3. Fix with minimal change — don't refactor while firefighting
4. Test locally + write regression test
5. Fast-track review (1 reviewer minimum)
6. Merge to main, deploy immediately
7. Post-mortem: log what caused it and how to prevent recurrence
```

---

## Branch Naming (extends conventions/git-workflow.md)

```
feature/{issue-number}-{short-description}   → feature/42-user-dashboard
fix/{issue-number}-{short-description}        → fix/87-login-redirect-loop
hotfix/{issue-number}-{short-description}     → hotfix/103-payment-crash
```

Always include the issue number so branches trace back to their issue.

---

## PR Requirements

Every PR that closes a bug or delivers a feature MUST include:

1. **Link to the issue** — use `Closes #123` in the PR description
2. **What changed** — summary of the approach
3. **How to test** — steps for the reviewer to verify
4. **Screenshots/video** — for any UI change
5. **Test coverage** — new or updated Playwright/Vitest tests

---

## File Organization for Tracking

### In-Project Tracking Files

Each project repository keeps a `docs/` folder at the root:

```
project-root/
├── docs/
│   ├── CHANGELOG.md          # User-facing changes per release
│   ├── KNOWN_ISSUES.md       # Current known bugs and workarounds
│   └── DECISIONS.md          # Architecture decisions and their reasoning
├── src/
├── tests/
└── ...
```

| File | Purpose | When to Update |
|------|---------|----------------|
| `CHANGELOG.md` | Track what shipped in each release | Every merge to main |
| `KNOWN_ISSUES.md` | Document bugs users might hit + workarounds | When a bug is found but not yet fixed |
| `DECISIONS.md` | Record why non-obvious technical choices were made | When choosing between approaches |

### CHANGELOG Format

```markdown
## [1.2.0] - 2026-06-18

### Added
- User dashboard with activity feed (#42)
- CSV export for reports (#55)

### Fixed
- Login redirect loop on expired sessions (#87)
- Mobile nav not closing after link click (#91)

### Changed
- Upgraded Supabase client to v2.45 (#100)
```

### KNOWN_ISSUES Format

```markdown
## Active Issues

### [#87] Login redirect loop on expired sessions
- **Severity:** High
- **Workaround:** Clear cookies and log in again
- **Status:** Fix in progress — branch `fix/87-login-redirect-loop`
- **ETA:** 2026-06-20
```

### DECISIONS Format

```markdown
## 2026-06-15 — Chose Zustand over Redux for state management

**Context:** Needed client-side state for the dashboard.
**Decision:** Zustand — smaller bundle, simpler API, no boilerplate.
**Alternatives considered:** Redux Toolkit (too much boilerplate for our scale), Jotai (atomic model not needed).
**Consequences:** Less ecosystem tooling than Redux, but acceptable for our use case.
```

---

## Tracking System

### Labels (GitHub Issues)

Apply these labels consistently across all projects:

| Label | Color | Usage |
|-------|-------|-------|
| `bug` | Red | Something is broken |
| `feature` | Green | New functionality |
| `hotfix` | Orange | Critical production fix |
| `tech-debt` | Yellow | Refactoring, cleanup |
| `blocked` | Gray | Waiting on something external |
| `needs-triage` | Purple | Not yet assessed |

### Milestones

Group issues into milestones that match release targets:

```
v1.0 — MVP launch
v1.1 — Post-launch fixes
v1.2 — User feedback round 1
```

### Projects Board (GitHub Projects)

Use a Kanban board with these columns:

```
Backlog → Triage → Ready → In Progress → In Review → Done
```

| Column | Rule |
|--------|------|
| **Backlog** | Logged but not prioritized |
| **Triage** | Needs severity/priority assessment |
| **Ready** | Prioritized, requirements clear, ready to pick up |
| **In Progress** | Someone is actively working on it (assign yourself) |
| **In Review** | PR is open and awaiting review |
| **Done** | Merged and verified in staging/production |

### Weekly Review

Once a week, review the board:

1. Move stale items back to Triage
2. Reprioritize based on user feedback and metrics
3. Close issues that are no longer relevant
4. Update KNOWN_ISSUES.md if applicable

---

## Post-Mortem (Critical Bugs Only)

After resolving a Critical severity bug, write a brief post-mortem:

```markdown
## Post-Mortem: [#103] Payment processing crash

**Date:** 2026-06-18
**Duration:** 2 hours (14:00 - 16:00 UTC)
**Impact:** ~200 users could not complete checkout

### What happened
[Timeline of events]

### Root cause
[Technical explanation]

### Fix applied
[What the fix was, link to PR]

### How to prevent recurrence
- [ ] [Action item with owner and deadline]
- [ ] [Action item with owner and deadline]
```

Store post-mortems in `docs/post-mortems/` within the project repo.
