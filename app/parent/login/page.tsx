'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField, AuthInput } from '@/app/components/AuthShell'
import { setUsageSessionId } from '@/lib/usageSession'
import { ButtonLoader } from '@/components/loaders'
import { CheckCircle2 } from 'lucide-react'

function ParentLoginForm() {
  const router = useRouter()
  const theme = THEMES.parent
  const params = useSearchParams()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(params.get('notice') || '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/parent/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }

      setUsageSessionId(data.usageSessionId)

      if (!data.passwordChanged) {
        router.push('/parent/change-password')
      } else {
        router.push('/parent')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Parent Portal" subtitle="Monitor your child's progress and academic journey">

      <div className="auth-feature-line" aria-label="Parent portal includes">
        {['Exam results', 'Attendance', 'Fee status'].map(f => (
          <div key={f}>
            <CheckCircle2 aria-hidden="true" />
            {f}
          </div>
        ))}
      </div>

      <AuthError message={error} />

      <form onSubmit={handleSubmit} data-testid="parent-login-form" className="space-y-4">
        <AuthInput label="Email or Phone Number" type="text" value={identifier} onChange={setIdentifier}
          required={true} placeholder="your@email.com or phone number" autoComplete="username" testId="parent-email-input" hint="Use the email or phone number your school has on record" ring={theme.ring} />

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          ring={theme.ring}
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link href="/parent/forgot-password" className="text-sm text-muted-foreground hover:text-primary font-medium transition">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-testid="parent-submit-btn"
          className="auth-submit"
        >
          {loading ? <ButtonLoader label="Signing in…" /> : 'Sign in'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-stone-200 text-center">
        <p className="text-xs text-muted-foreground">Account created automatically when your child was enrolled. Check your welcome email for credentials.</p>
        <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition mt-2 inline-block">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}

export default function ParentLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf6ef] flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>}>
      <ParentLoginForm />
    </Suspense>
  )
}
