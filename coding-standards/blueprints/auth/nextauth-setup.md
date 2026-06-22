# NextAuth (Auth.js) Setup

## Install

```bash
pnpm add next-auth @auth/supabase-adapter @supabase/supabase-js bcryptjs
pnpm add -D @types/bcryptjs
```

## Config

```typescript
// lib/auth.ts
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const { data: user } = await supabase.from('users').select('*').eq('email', credentials.email).single();
        if (!user) return null;
        const isValid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!isValid) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  session: { strategy: 'jwt' as const },
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.role = user.role; token.userId = user.id; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) { session.user.role = token.role; session.user.id = token.userId; }
      return session;
    },
  },
  pages: { signIn: '/login', signUp: '/signup', error: '/auth/error' },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

## Registration API

```typescript
// app/api/auth/register/route.ts
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const RegisterSchema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2) });

export async function POST(req: NextRequest) {
  const parsed = RegisterSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 });

  const { email, password, name } = parsed.data;
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
  if (existing) return NextResponse.json({ success: false, error: { code: 'CONFLICT', message: 'Email already registered' } }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const { data: user } = await supabase.from('users').insert({ email, password_hash: passwordHash, name, role: 'user' }).select('id, email, name, role').single();

  return NextResponse.json({ success: true, data: user }, { status: 201 });
}
```

## Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  email_verified TIMESTAMPTZ,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
