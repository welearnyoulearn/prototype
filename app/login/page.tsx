'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const role = params.get('role') // 'platform' | 'school' | null

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

      if (data.firstLogin) {
        router.push('/change-password?first=1')
      } else if (!data.profileCompleted) {
        router.push('/profile-setup')
      } else if (data.role === 'platform_admin') {
        router.push('/platform-admin')
      } else {
        router.push('/school-admin')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const title    = isPlatform ? 'Platform Admin' : 'School Admin'
  const subtitle = isPlatform ? 'Sign in with your admin email' : 'Sign in with your School ID'
  const idLabel  = isPlatform ? 'Email Address' : 'School ID'
  const idPlaceholder = isPlatform ? 'admin@youremail.com' : 'wlyl-schl-yourschool-1'

  return (
    <AuthShell theme={theme} title={title} subtitle={subtitle}>
      <AuthError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{idLabel}</label>
          <input
            type={isPlatform ? 'email' : 'text'}
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder={idPlaceholder}
            required
            autoComplete={isPlatform ? 'email' : 'username'}
            className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${theme.ring} transition`}
          />
          {!isPlatform && <p className="text-xs text-gray-400 mt-1">Your School ID was sent in the onboarding email</p>}
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
          <Link href="/forgot-password" className={`text-sm font-medium transition ${isPlatform ? 'text-purple-600 hover:text-purple-800' : 'text-blue-600 hover:text-blue-800'}`}>
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full ${theme.accent} ${theme.accentHover} text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60 shadow-sm flex items-center justify-center gap-2`}
        >
          {loading ? (
            <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Signing in...</>
          ) : `Sign In as ${title}`}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-gray-100 text-center">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="text-white">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}
