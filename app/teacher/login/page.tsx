'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'

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
      <AuthError message={error} />

      <form onSubmit={handleSubmit} data-testid="teacher-login-form" className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1.5">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your.email@school.edu"
            required
            autoComplete="email"
            data-testid="teacher-email-input"
            className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 ${theme.ring} focus:border-transparent transition backdrop-blur-sm`}
          />
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
          <Link href="/teacher/forgot-password" className="text-sm text-white/40 hover:text-white/70 font-medium transition">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-testid="teacher-submit-btn"
          className={`w-full bg-gradient-to-r ${theme.btnGradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}
        >
          {loading ? (
            <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Signing in...</>
          ) : 'Sign In'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-white/8 flex items-center justify-between text-sm">
        <span className="text-white/30">Not a teacher??</span>
        <Link href="/" className="text-white/30 hover:text-white/50 font-medium transition">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}
