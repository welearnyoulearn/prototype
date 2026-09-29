'use client'

import { useState, useMemo, useSyncExternalStore, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, AuthInput, AuthButton, PasswordField } from '@/app/components/AuthShell'
import { setUsageSessionId } from '@/lib/usageSession'

type LastAccount = { name: string; email: string; role: string }
const LAST_ACCOUNT_KEY = 'wlyl_last_staff_account'

function parseLastAccount(raw: string | null): LastAccount | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<LastAccount>
    return typeof v.name === 'string' && typeof v.email === 'string'
      ? { name: v.name, email: v.email, role: typeof v.role === 'string' ? v.role : '' }
      : null
  } catch { return null }
}

function readLastAccountRaw(): string | null {
  try { return localStorage.getItem(LAST_ACCOUNT_KEY) } catch { return null }
}

const noopSubscribe = () => () => {}

function writeLastAccount(a: LastAccount) {
  try { localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify({ name: a.name, email: a.email, role: a.role })) } catch { /* private mode */ }
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const role = params.get('role')
  const timedOut = params.get('reason') === 'timeout'

  const isPlatform = role === 'platform'
  const theme = isPlatform ? THEMES.platform : THEMES.admin

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  // "Last used" account on this browser (name + email only — never a password or a
  // session). Clicking it only pre-fills the email; the password is always required.
  // Landing here never signs anyone in, so a colleague opening this page on a shared
  // computer can't step into the previous person's account.
  const storedRaw = useSyncExternalStore(noopSubscribe, readLastAccountRaw, () => null)
  const stored = useMemo(() => parseLastAccount(storedRaw), [storedRaw])
  const [dismissedLast, setDismissedLast] = useState(false)
  const [pickedLast, setPickedLast]       = useState(false)
  const lastAccount = !isPlatform && !dismissedLast ? stored : null

  const showLastCard = !isPlatform && !!lastAccount && !pickedLast && identifier === ''

  function pickLastAccount() {
    if (!lastAccount) return
    setIdentifier(lastAccount.email)
    setPickedLast(true)
  }

  function useDifferentAccount() {
    setPickedLast(false)
    setDismissedLast(true)
    setIdentifier('')
    setPassword('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid credentials'); return }

      setUsageSessionId(data.usageSessionId)

      if (data.role === 'platform_admin') {
        window.location.href = '/platform-admin'
      } else if (['school_admin', 'principal', 'vice_principal'].includes(data.role)) {
        if (data.account) writeLastAccount(data.account)
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
  const subtitle = isPlatform ? 'Sign in to your admin account' : 'Sign in with your own email address'

  return (
    <AuthShell theme={theme} title={title} subtitle={subtitle}>
      {timedOut && !error && (
        <div data-testid="session-timeout-notice" className="mb-5 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl">
          You were signed out because your session ended. Please sign in again.
        </div>
      )}
      {showLastCard && lastAccount && (
        <div className="mb-5 space-y-3">
          <button type="button" data-testid="btn-last-used-account" onClick={pickLastAccount}
            className="auth-account-choice w-full text-left flex items-center gap-3 border rounded-lg px-4 py-3 transition">
            <span className="auth-account-avatar w-10 h-10 shrink-0 rounded-full text-white font-semibold flex items-center justify-center">
              {lastAccount.name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Last used</span>
              <span data-testid="last-used-name" className="block text-sm font-semibold text-stone-800 truncate">{lastAccount.name}</span>
              <span data-testid="last-used-email" className="block text-xs text-stone-500 truncate">{lastAccount.email}</span>
            </span>
          </button>
          <button type="button" data-testid="btn-use-different-account" onClick={useDifferentAccount}
            className="text-sm text-muted-foreground hover:text-primary transition">
            Use a different account
          </button>
        </div>
      )}
      <AuthError message={error} />
      {!showLastCard && (
      <form onSubmit={handleSubmit} data-testid="login-form" className="space-y-4">
        {pickedLast && lastAccount ? (
          <div className="auth-account-picked flex items-center justify-between gap-3 border rounded-lg px-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-stone-800 truncate">{lastAccount.name}</span>
              <span className="block text-xs text-stone-500 truncate">{lastAccount.email}</span>
            </span>
            <button type="button" data-testid="btn-switch-account" onClick={useDifferentAccount}
              className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-900">
              Switch
            </button>
          </div>
        ) : (
          <AuthInput
            label="Email Address"
            value={identifier}
            onChange={setIdentifier}
            placeholder={isPlatform ? 'admin@welearnyoulearn.com' : 'you@school.com'}
            autoComplete="email"
            ring={theme.ring}
          />
        )}
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          ring={theme.ring}
          autoComplete="current-password"
        />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary transition">
            Forgot password?
          </Link>
        </div>
        <AuthButton loading={loading} label={`Sign In`} gradient={theme.btnGradient} />
      </form>
      )}
      <div className="mt-5 pt-5 border-t border-stone-200 text-center">
        <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf6ef] flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}
