# Login Page Blueprint

```tsx
// app/(auth)/login/page.tsx
'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) { setError('Invalid email or password'); setIsLoading(false); return; }
    router.push('/dashboard');
  }

  return (
    <div data-testid="login-page-container" className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-lg border p-8">
        <h1 data-testid="login-title-text" className="text-2xl font-bold text-center">Sign In</h1>
        {error && <div data-testid="login-error-text" className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <form data-testid="login-form" onSubmit={handleSubmit} className="space-y-4">
          <Input data-testid="login-email-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input data-testid="login-password-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button data-testid="login-submit-btn" type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
        <Button data-testid="login-google-btn" variant="outline" className="w-full" onClick={() => signIn('google', { callbackUrl: '/dashboard' })}>
          Continue with Google
        </Button>
        <div className="text-center text-sm">
          <Link data-testid="login-forgot-password-link" href="/forgot-password" className="text-blue-600 hover:underline">Forgot password?</Link>
        </div>
        <div className="text-center text-sm">
          Don&apos;t have an account? <Link data-testid="login-signup-link" href="/signup" className="text-blue-600 hover:underline">Sign up</Link>
        </div>
      </div>
    </div>
  );
}
```

## Playwright Test

```typescript
// tests/auth/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/login'); });

  test('should display login form', async ({ page }) => {
    await expect(page.getByTestId('login-email-input')).toBeVisible();
    await expect(page.getByTestId('login-password-input')).toBeVisible();
    await expect(page.getByTestId('login-submit-btn')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.getByTestId('login-email-input').fill('wrong@email.com');
    await page.getByTestId('login-password-input').fill('wrongpassword');
    await page.getByTestId('login-submit-btn').click();
    await expect(page.getByTestId('login-error-text')).toBeVisible();
  });

  test('should redirect to dashboard on success', async ({ page }) => {
    await page.getByTestId('login-email-input').fill('test@example.com');
    await page.getByTestId('login-password-input').fill('validpassword');
    await page.getByTestId('login-submit-btn').click();
    await expect(page).toHaveURL('/dashboard');
  });
});
```
