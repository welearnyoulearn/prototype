# Forgot Password Blueprint

## Flow

1. User enters email → 2. API generates reset token (1hr expiry) → 3. Email sent via Zoho SMTP → 4. User clicks link → 5. New password saved → 6. Token invalidated

## API - Request Reset

```typescript
// app/api/auth/forgot-password/route.ts
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  const { data: user } = await supabase.from('users').select('id, email, name').eq('email', email).single();
  // Always return success to prevent email enumeration
  if (!user) return NextResponse.json({ success: true });

  const token = crypto.randomBytes(32).toString('hex');
  await supabase.from('password_resets').insert({ user_id: user.id, token, expires_at: new Date(Date.now() + 3600000).toISOString() });

  await sendEmail({ to: user.email, subject: 'Reset Your Password', html: `<a href="${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}">Reset Password</a>` });
  return NextResponse.json({ success: true });
}
```

## API - Reset Password

```typescript
// app/api/auth/reset-password/route.ts
export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  const { data: reset } = await supabase.from('password_resets').select('*').eq('token', token).gt('expires_at', new Date().toISOString()).eq('used', false).single();
  if (!reset) return NextResponse.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired link' } }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 12);
  await supabase.from('users').update({ password_hash: passwordHash }).eq('id', reset.user_id);
  await supabase.from('password_resets').update({ used: true }).eq('id', reset.id);
  return NextResponse.json({ success: true });
}
```

## DB Table

```sql
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
