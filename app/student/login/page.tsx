'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField, AuthInput } from '@/app/components/AuthShell'
import { setUsageSessionId } from '@/lib/usageSession'
import { ButtonLoader } from '@/components/loaders'
import { BookOpenCheck } from 'lucide-react'

function StudentLoginForm() {
  const router = useRouter()
  const theme = THEMES.student
  const params = useSearchParams()

  const [rollNumber, setRollNumber] = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(params.get('notice') || '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/student/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber: rollNumber.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }

      setUsageSessionId(data.usageSessionId)

      if (!data.passwordChanged) {
        router.push('/student/change-password')
      } else {
        router.push('/student')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Student Login" subtitle="Enter your roll number and password to continue">

      <div className="auth-context">
        <BookOpenCheck aria-hidden="true" />
        <div><b>Pick up where you left off</b><p>Your lessons, attendance and results are ready in your workspace.</p></div>
      </div>

      <AuthError message={error} />

      <form onSubmit={handleSubmit} data-testid="student-login-form" className="space-y-4">
        <AuthInput label="Roll Number" type="text" value={rollNumber} onChange={setRollNumber}
          required={true} placeholder="e.g. 2024-GR9-001" autoComplete="username" testId="student-roll-input" hint="Your roll number was shared in your welcome email" ring={theme.ring} />

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          ring={theme.ring}
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link href="/student/forgot-password" className="text-sm text-muted-foreground hover:text-primary font-medium transition">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-testid="student-submit-btn"
          className="auth-submit"
        >
          {loading ? <ButtonLoader label="Signing in…" /> : 'Open my workspace'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-stone-200 text-center">
        <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}

export default function StudentLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf6ef] flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>}>
      <StudentLoginForm />
    </Suspense>
  )
}
