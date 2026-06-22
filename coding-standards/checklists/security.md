# Security Checklist

## Auth
- [ ] Passwords hashed bcrypt (cost 12+)
- [ ] JWT tokens expire (access: 15min, refresh: 7d)
- [ ] Account lockout after 5 failed attempts
- [ ] Session invalidation on password change

## Authorization
- [ ] Role-based access control
- [ ] Users can only access their own data
- [ ] Admin routes protected

## Input
- [ ] All input validated with Zod
- [ ] File uploads: check type, size, content
- [ ] SQL parameterized (Supabase handles)

## API
- [ ] Rate limiting on public endpoints
- [ ] CORS restricted to your domains
- [ ] Error messages don't leak internals

## Infra
- [ ] SSH key-only (no password)
- [ ] Firewall: only 80, 443, 22
- [ ] SSL/TLS everywhere
- [ ] .env never in git

## Headers
```typescript
// next.config.js
{ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Strict-Transport-Security': 'max-age=31536000' }
```
