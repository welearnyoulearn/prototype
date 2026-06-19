# Bug Fix Checklist

## Before Writing Code

- [ ] Issue exists in GitHub Issues with severity, steps to reproduce, and evidence
- [ ] Bug is assigned to you — move to "In Progress" on the board
- [ ] You can reproduce the bug locally
- [ ] You understand the root cause (not just the symptom)
- [ ] Branch created: `fix/{issue-number}-{short-description}`

## Writing the Fix

- [ ] Write a failing test that captures the bug BEFORE fixing it
- [ ] Fix targets the root cause, not a surface-level patch
- [ ] Change is minimal — don't refactor unrelated code in a bug fix PR
- [ ] No new `any` types, `console.log`, or commented-out code introduced
- [ ] If the fix changes API behavior, update API docs
- [ ] If the fix changes UI behavior, test on mobile (375px minimum)

## Testing the Fix

- [ ] The failing test now passes
- [ ] Existing tests still pass (run full suite: `pnpm test`)
- [ ] Playwright E2E tests pass for the affected flow
- [ ] Manually verify the fix works end-to-end
- [ ] Check for regressions in related features
- [ ] If severity was Critical/High, test the exact reproduction steps from the issue

## Opening the PR

- [ ] PR title: `fix: short description (#issue-number)`
- [ ] PR description includes `Closes #issue-number`
- [ ] PR description explains the root cause and what the fix does
- [ ] Screenshots/video included for UI fixes
- [ ] Run `/code-review medium` (or higher) before requesting review
- [ ] Self-review the diff against `checklists/code-review.md`

## After Merge

- [ ] Verify fix in staging environment
- [ ] Verify fix in production after deploy
- [ ] Remove entry from `docs/KNOWN_ISSUES.md` if applicable
- [ ] Add entry to `docs/CHANGELOG.md` under "Fixed"
- [ ] If Critical severity: write post-mortem in `docs/post-mortems/`
- [ ] Close the GitHub Issue (or confirm auto-close via `Closes #`)

## Hotfix Additions (Critical bugs only)

- [ ] Notify the team that a hotfix is in progress
- [ ] Fast-track review: 1 reviewer minimum (don't wait for full review cycle)
- [ ] Deploy immediately after merge
- [ ] Monitor logs/metrics for 30 minutes post-deploy
- [ ] Schedule post-mortem within 48 hours
