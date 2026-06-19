# Supabase Database-Only Setup

> Supabase = PostgreSQL database ONLY. Auth, storage, realtime handled separately.

## Client Setup

```bash
pnpm add @supabase/supabase-js
```

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

## Generate Types

```bash
pnpm add -D supabase
npx supabase gen types typescript --project-id your-project-id > types/database.ts
```

## Common Queries

```typescript
// CREATE
const { data } = await supabase.from('users').insert({ email, name }).select().single();

// READ single
const { data } = await supabase.from('users').select('*').eq('id', userId).single();

// READ list + pagination
const { data, count } = await supabase.from('users').select('*', { count: 'exact' }).range(offset, offset + limit - 1).order('created_at', { ascending: false });

// UPDATE
const { data } = await supabase.from('users').update({ name: 'New' }).eq('id', userId).select().single();

// SOFT DELETE
await supabase.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', userId);

// JOIN
const { data } = await supabase.from('orders').select(`*, user:users(id, name), items:order_items(id, product_name, quantity)`).eq('id', orderId).single();

// SEARCH
const { data } = await supabase.from('users').select('*').ilike('name', `%${term}%`);
```

## Standard Schema

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## Connection Pooling

```env
# Serverless (Vercel) - use port 6543
DATABASE_URL=postgresql://postgres:pass@db.project.supabase.co:6543/postgres?pgbouncer=true

# Long-running - use port 5432
DATABASE_URL=postgresql://postgres:pass@db.project.supabase.co:5432/postgres
```
