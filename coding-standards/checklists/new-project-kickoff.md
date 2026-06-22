# New Project Kickoff Checklist

1. **Decide**: Next.js or React (Vite)? Node/Python/Go backend? Auth needed?
2. **Init project**: `pnpm create next-app --typescript --tailwind --app --src-dir`
3. **Install core**: `pnpm add zustand zod next-auth @supabase/supabase-js`
4. **Install dev**: `pnpm add -D @playwright/test vitest @testing-library/react`
5. **Setup shadcn**: `npx shadcn@latest init`
6. **Copy** `.env.template` from credentials/ → `.env.local`
7. **Create** Supabase project, run migrations
8. **Setup auth** (NextAuth config + login/signup pages)
9. **Setup services** (email, storage as needed)
10. **Write first** Playwright test (login flow)
11. **Connect** to Vercel, set env vars
12. **Deploy** and verify
