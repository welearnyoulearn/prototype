# Next.js Full-Stack Structure

```
project/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (auth)/signup/page.tsx
│   │   ├── (auth)/forgot-password/page.tsx
│   │   ├── (dashboard)/layout.tsx
│   │   ├── (dashboard)/dashboard/page.tsx
│   │   ├── (dashboard)/settings/page.tsx
│   │   ├── api/auth/[...nextauth]/route.ts
│   │   ├── api/auth/register/route.ts
│   │   ├── api/v1/users/route.ts
│   │   ├── api/v1/upload/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/          # shadcn
│   │   ├── common/      # shared
│   │   ├── layout/      # sidebar, header
│   │   └── features/    # feature-specific
│   ├── hooks/
│   ├── stores/          # zustand
│   ├── lib/             # supabase, auth, email, storage, utils
│   └── types/
├── tests/               # playwright
├── supabase/migrations/
├── .env.local
├── playwright.config.ts
├── vitest.config.ts
└── package.json
```
