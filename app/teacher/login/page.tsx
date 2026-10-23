'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField, AuthInput } from '@/app/components/AuthShell'
import { setUsageSessionId } from '@/lib/usageSession'
import { ButtonLoader } from '@/components/loaders'
import { CalendarCheck2 } from 'lucide-react'

export default function TeacherLoginPage() {
  const router = useRouter()
  const theme = THEMES.teacher

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/teacher/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }

      setUsageSessionId(data.usageSessionId)

      if (!data.passwordChanged) {
        router.push('/teacher/change-password')
      } else {
        router.push('/teacher')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Welcome back, Teacher" subtitle="Sign in to access your portal">
      <div className="auth-context">
        <CalendarCheck2 aria-hidden="true" />
        <div><b>Your teaching day, ready</b><p>Classes, attendance and learning progress stay close at hand.</p></div>
      </div>
      <AuthError message={error} />

      <form onSubmit={handleSubmit} data-testid="teacher-login-form" className="space-y-4">
        <AuthInput label="Email Address" type="email" value={email} onChange={setEmail}
          required={true} placeholder="your.email@school.edu" autoComplete="email" testId="teacher-email-input" ring={theme.ring} />

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          ring={theme.ring}
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link href="/teacher/forgot-password" className="text-sm text-muted-foreground hover:text-primary font-medium transition">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-testid="teacher-submit-btn"
          className="auth-submit"
        >
          {loading ? <ButtonLoader label="Signing in…" /> : 'Sign in'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-stone-200 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Not a teacher?</span>
        <Link href="/" className="text-muted-foreground hover:text-primary font-medium transition">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}
