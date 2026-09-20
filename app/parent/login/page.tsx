'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, AuthSuccess, PasswordField } from '@/app/components/AuthShell'
import { setUsageSessionId } from '@/lib/usageSession'
import { normalizeIndianMobile, INDIAN_MOBILE_ERROR } from '@/lib/phone'

// Looks like someone is typing a phone number (digits and the usual separators, no letters/@).
const PHONE_LIKE = /^[\d\s+\-().]+$/

function ParentLoginForm() {
  const router = useRouter()
  const theme = THEMES.parent
  const params = useSearchParams()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(params.get('notice') || '')
  const justReset = params.get('reset') === '1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const typed = identifier.trim()
    if (PHONE_LIKE.test(typed) && !normalizeIndianMobile(typed)) { setError(INDIAN_MOBILE_ERROR); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/parent/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: normalizeIndianMobile(typed) ?? typed, password }),
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

      {/* Feature highlights */}
      <div className="mb-5 grid grid-cols-2 gap-2 text-xs">
        {['Exam results', 'Attendance', 'Fee status', 'Timetable'].map(f => (
          <div key={f} className="flex items-center gap-1.5 text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-1.5">
            <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            {f}
          </div>
        ))}
      </div>

      {justReset && !error && <div data-testid="parent-password-updated-notice"><AuthSuccess message="Password updated. Sign in with your new password." /></div>}
      <AuthError message={error} />

      <form onSubmit={handleSubmit} data-testid="parent-login-form" className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Email or Phone Number</label>
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            // A pasted "+91 98765 43210" becomes the plain 10-digit number; emails are left alone.
            onBlur={() => { const t = identifier.trim(); if (PHONE_LIKE.test(t)) { const n = normalizeIndianMobile(t); if (n) setIdentifier(n) } }}
            placeholder="your@email.com or 10-digit mobile number"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-testid="parent-email-input"
            className={`w-full bg-white border border-stone-300 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 ${theme.ring} focus:border-transparent transition`}
          />
          <p className="text-xs text-stone-400 mt-1.5">Use the email or 10-digit mobile number your school has on record</p>
        </div>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          ring={theme.ring}
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link href="/parent/forgot-password" className="text-sm text-stone-400 hover:text-stone-600 font-medium transition">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-testid="parent-submit-btn"
          className={`w-full bg-gradient-to-r ${theme.btnGradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}
        >
          {loading ? (
            <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Signing in...</>
          ) : 'Sign In'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-stone-200 text-center">
        <p className="text-xs text-stone-400">Account created automatically when your child was enrolled. Check your welcome email for credentials.</p>
        <Link href="/" className="text-sm text-stone-400 hover:text-stone-600 transition mt-2 inline-block">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}

export default function ParentLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf6ef] flex items-center justify-center"><div className="text-stone-400">Loading...</div></div>}>
      <ParentLoginForm />
    </Suspense>
  )
}
