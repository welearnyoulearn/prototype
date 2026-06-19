# Feature Development Checklist

## Before Writing Code

- [ ] Issue exists in GitHub Issues with acceptance criteria and priority
- [ ] Feature is assigned to you — move to "In Progress" on the board
- [ ] You understand the requirements (ask questions before coding, not during)
- [ ] If the feature takes > 2 days, break it into sub-tasks with their own issues
- [ ] Branch created: `feature/{issue-number}-{short-description}`
- [ ] If the feature involves new UI, mockup or wireframe is reviewed/approved

## Building the Feature

- [ ] Start with the data model — schema changes first, UI last
- [ ] Commit working states frequently (not WIP commits)
- [ ] All interactive UI elements have `data-testid` attributes
- [ ] Zod schemas validate all new user input (forms, API requests, query params)
- [ ] Loading, empty, and error states handled for every async operation
- [ ] Mobile responsive (test at 375px minimum)
- [ ] No `any` types — use proper TypeScript types
- [ ] No hardcoded strings that should be configurable
- [ ] Auth/permissions checked on every new endpoint and page

## Testing As You Go

- [ ] Playwright E2E tests cover the critical user path (happy path)
- [ ] Playwright tests cover key edge cases (empty state, validation errors, unauthorized)
- [ ] Vitest unit tests for complex business logic (calculations, transformations, parsing)
- [ ] All tests pass: `pnpm test`
- [ ] Manually test the full flow end-to-end
- [ ] Test with realistic data, not just "test123"

## Opening the PR

- [ ] PR title: `feat: short description (#issue-number)`
- [ ] PR description includes `Closes #issue-number`
- [ ] PR description explains what the feature does and how to test it
- [ ] Screenshots or video walkthrough for any UI changes
- [ ] List anything intentionally left out of scope
- [ ] Run `/code-review medium` (or higher) before requesting review
- [ ] Self-review the diff against `checklists/code-review.md`
- [ ] No unrelated changes in the PR — keep it focused

## After Merge

- [ ] Verify feature works in staging environment
- [ ] Verify feature works in production after deploy
- [ ] Add entry to `docs/CHANGELOG.md` under "Added"
- [ ] Update `docs/DECISIONS.md` if you made non-obvious technical choices
- [ ] Close the GitHub Issue (or confirm auto-close via `Closes #`)
- [ ] Demo the feature to stakeholders if applicable

## Large Feature Additions (> 1 week of work)

- [ ] Feature is broken into multiple PRs that each deliver a working increment
- [ ] Use a feature flag if the feature should be hidden until complete
- [ ] Coordinate with the team on any shared interfaces or breaking changes
- [ ] Update project milestone with progress
