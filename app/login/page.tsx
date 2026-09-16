'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, AuthInput, AuthButton, PasswordField } from '@/app/components/AuthShell'
import { setUsageSessionId, getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const role = params.get('role')

  const isPlatform = role === 'platform'
  const theme = isPlatform ? THEMES.platform : THEMES.admin

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  // Landing here (e.g. via the browser's Back button from the dashboard)
  // doesn't actually end the session — the auth cookie is untouched — so an
  // empty login form would be misleading. Check for a still-valid session and
  // surface it instead of silently pretending the user needs to sign in again.
  const [existingSession, setExistingSession] = useState<{ role: string; name: string } | null>(null)
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => setExistingSession(d ? { role: d.role, name: d.full_name || d.email } : null))
      .catch(() => {})
  }, [])

  function continueToDashboard() {
    if (existingSession?.role === 'platform_admin') window.location.href = '/platform-admin'
    else router.push('/school-admin')
  }

  async function logOutExistingSession() {
    await fetch('/api/auth/logout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usageSessionId: getUsageSessionId() }),
    })
    clearUsageSessionId()
    setExistingSession(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid credentials'); return }

      setUsageSessionId(data.usageSessionId)

      if (data.role === 'platform_admin') {
        window.location.href = '/platform-admin'
      } else if (['school_admin', 'principal', 'vice_principal'].includes(data.role)) {
        if (data.firstLogin) router.push('/change-password?first=1')
        else if (!data.profileCompleted) router.push('/profile-setup')
        else router.push('/school-admin')
      } else {
        setError('This portal is for school staff only. Please use the correct login page.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const title    = isPlatform ? 'Welcome Back' : 'School Portal Login'
  const subtitle = isPlatform ? 'Sign in to your admin account' : 'Enter your School ID or email to continue'

  return (
    <AuthShell theme={theme} title={title} subtitle={subtitle}>
      {existingSession && (
        <div data-testid="existing-session-notice" className="mb-5 bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3 rounded-xl space-y-2.5">
          <p>
            You&apos;re still signed in as <strong>{existingSession.name}</strong> — going back here doesn&apos;t log you out.
          </p>
          <div className="flex gap-2">
            <button type="button" data-testid="btn-continue-to-dashboard" onClick={continueToDashboard}
              className="text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
              Continue to Dashboard
            </button>
            <button type="button" data-testid="btn-logout-existing-session" onClick={logOutExistingSession}
              className="text-xs font-semibold text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-100">
              Log out instead
            </button>
          </div>
        </div>
      )}
      <AuthError message={error} />
      <form onSubmit={handleSubmit} data-testid="login-form" className="space-y-4">
        <AuthInput
          label={isPlatform ? 'Email Address' : 'School ID or Email'}
          value={identifier}
          onChange={setIdentifier}
          placeholder={isPlatform ? 'admin@welearnyoulearn.com' : 'School ID or email'}
          hint={!isPlatform ? 'School admins use School ID · Principal/VP use email' : undefined}
          autoComplete={isPlatform ? 'email' : 'username'}
          ring={theme.ring}
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          ring={theme.ring}
          autoComplete="current-password"
        />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-stone-400 hover:text-stone-600 transition">
            Forgot password?
          </Link>
        </div>
        <AuthButton loading={loading} label={`Sign In`} gradient={theme.btnGradient} />
      </form>
      <div className="mt-5 pt-5 border-t border-stone-200 text-center">
        <Link href="/" className="text-sm text-stone-400 hover:text-stone-600 transition">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf6ef] flex items-center justify-center"><div className="text-stone-400">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}
