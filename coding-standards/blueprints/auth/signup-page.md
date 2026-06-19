# Signup Page Blueprint

```tsx
// app/(auth)/signup/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setIsLoading(true);
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
    const data = await res.json();
    if (!data.success) { setError(data.error.message); setIsLoading(false); return; }
    router.push('/login?registered=true');
  }

  return (
    <div data-testid="signup-page-container" className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-lg border p-8">
        <h1 data-testid="signup-title-text" className="text-2xl font-bold text-center">Create Account</h1>
        {error && <div data-testid="signup-error-text" className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <form data-testid="signup-form" onSubmit={handleSubmit} className="space-y-4">
          <Input data-testid="signup-name-input" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input data-testid="signup-email-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input data-testid="signup-password-input" type="password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Input data-testid="signup-confirm-password-input" type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          <Button data-testid="signup-submit-btn" type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Account'}
          </Button>
        </form>
        <div className="text-center text-sm">
          Already have an account? <Link data-testid="signup-login-link" href="/login" className="text-blue-600 hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
```
