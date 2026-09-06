'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'
import { setUsageSessionId } from '@/lib/usageSession'

export default function ParentLoginPage() {
  const router = useRouter()
  const theme = THEMES.parent

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

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

      {/* Feature highlights */}
      <div className="mb-5 grid grid-cols-2 gap-2 text-xs">
        {['Exam results', 'Attendance', 'Fee status', 'Homework'].map(f => (
          <div key={f} className="flex items-center gap-1.5 text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-1.5">
            <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            {f}
          </div>
        ))}
      </div>

      <AuthError message={error} />

      <form onSubmit={handleSubmit} data-testid="parent-login-form" className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Email or Phone Number</label>
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="your@email.com or phone number"
            required
            autoComplete="username"
            data-testid="parent-email-input"
            className={`w-full bg-white border border-stone-300 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 ${theme.ring} focus:border-transparent transition`}
          />
          <p className="text-xs text-stone-400 mt-1.5">Use the email or phone number your school has on record</p>
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
