# Pre-Launch Checklist

## Security
- [ ] All API routes require auth
- [ ] Input validation (Zod) on all endpoints
- [ ] HTTPS enforced, CORS configured
- [ ] Rate limiting on auth endpoints
- [ ] No secrets in code

## Testing
- [ ] Critical flows have Playwright E2E tests
- [ ] Mobile responsive tested
- [ ] Error + empty states handled

## Infrastructure
- [ ] Production env vars set
- [ ] DB backups configured
- [ ] Custom domain + SSL
- [ ] Error monitoring (Sentry)

## Content
- [ ] Privacy policy, Terms of service
- [ ] All links working, no 404s
- [ ] Email delivery tested (check spam folder)
