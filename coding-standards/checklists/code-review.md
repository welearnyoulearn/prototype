# Code Review Checklist

## Before Requesting Review

- [ ] Self-review your own diff first
- [ ] PR has a clear title and description
- [ ] One feature/fix per PR — no mixed concerns
- [ ] All CI checks pass (type check, lint, tests, build)
- [ ] No `console.log`, `debugger`, or commented-out code
- [ ] No `.env` values, secrets, or credentials in the diff

## Correctness

- [ ] Logic matches the requirements / ticket
- [ ] Edge cases handled (empty states, null, undefined, loading, error)
- [ ] No off-by-one errors, race conditions, or stale closures
- [ ] API error responses return correct status codes and messages
- [ ] Database queries are parameterized (no raw string interpolation)
- [ ] File uploads validated (type, size, content)

## TypeScript & Type Safety

- [ ] No `any` type — use proper types or `unknown` with narrowing
- [ ] Zod schemas validate all external input (API request bodies, query params, form data)
- [ ] Return types are explicit on public functions and API handlers
- [ ] No type assertions (`as`) unless genuinely necessary with a comment explaining why

## React & Frontend

- [ ] Components are small and focused (< 200 lines)
- [ ] No prop drilling beyond 2 levels — use Zustand or context
- [ ] All interactive elements have `data-testid` for Playwright
- [ ] Loading and error states rendered for async operations
- [ ] No inline styles — use Tailwind classes
- [ ] Images have `alt` text, forms have labels
- [ ] Mobile responsive (test at 375px width minimum)

## API & Backend

- [ ] Auth middleware on all protected routes
- [ ] Users can only access/modify their own data
- [ ] Rate limiting on public and auth endpoints
- [ ] Consistent error response format across endpoints
- [ ] No N+1 queries — use joins or batch fetches
- [ ] Pagination on list endpoints

## Performance

- [ ] No unnecessary re-renders (check dependency arrays)
- [ ] Large lists use virtualization or pagination
- [ ] Images optimized (Next.js `<Image>` or compressed)
- [ ] No blocking operations on the main thread
- [ ] Database queries have appropriate indexes

## Testing

- [ ] New features have Playwright E2E tests for critical paths
- [ ] Unit tests for complex business logic (Vitest)
- [ ] Tests actually assert behavior, not just "doesn't crash"
- [ ] No flaky tests — avoid arbitrary timeouts and sleeps

## Security

- [ ] No XSS vectors (user content sanitized before rendering)
- [ ] No SQL injection (parameterized queries only)
- [ ] CORS not set to `*` in production
- [ ] Sensitive data not logged or exposed in error messages
- [ ] File uploads stored in Cloudflare R2, not local filesystem

## How to Use

### As the Author
1. Run through this checklist before marking PR as ready
2. Add context in the PR description for non-obvious decisions
3. Respond to every comment — resolve or explain why not

### As the Reviewer
1. Pull the branch and run locally when the change is non-trivial
2. Check the diff against this checklist
3. Focus on correctness and security first, style last
4. Use "Request Changes" for blockers, "Comment" for suggestions
5. Approve only when all blockers are resolved

### Using Claude Code for Review
Run `/code-review` with an effort level to get automated review:
```
/code-review low      # Quick pass — high-confidence issues only
/code-review medium   # Standard review
/code-review high     # Thorough review — may flag uncertain issues
/code-review ultra    # Deep multi-agent cloud review
```

Add `--comment` to post findings as inline PR comments:
```
/code-review high --comment
```

Add `--fix` to auto-apply findings to the working tree:
```
/code-review medium --fix
```
