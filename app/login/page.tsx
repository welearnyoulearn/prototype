'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, AuthInput, AuthButton, PasswordField } from '@/app/components/AuthShell'

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

      if (data.role === 'platform_admin') {
        // Platform admin accidentally used school portal — redirect to correct portal
        window.location.href = '/platform-admin'
      } else if (['school_admin', 'principal', 'vice_principal'].includes(data.role)) {
        if (data.firstLogin) window.location.href = '/change-password?first=1'
        else if (!data.profileCompleted) window.location.href = '/profile-setup'
        else window.location.href = '/school-admin'
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
          <Link href="/forgot-password" className="text-sm text-white/40 hover:text-white/70 transition">
            Forgot password?
          </Link>
        </div>
        <AuthButton loading={loading} label={`Sign In`} gradient={theme.btnGradient} />
      </form>
      <div className="mt-5 pt-5 border-t border-white/8 text-center">
        <Link href="/" className="text-sm text-white/30 hover:text-white/50 transition">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center"><div className="text-white/40">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}
