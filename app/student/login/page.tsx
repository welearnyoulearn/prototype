'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'

export default function StudentLoginPage() {
  const router = useRouter()
  const theme = THEMES.student

  const [rollNumber, setRollNumber] = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

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

      {/* Friendly welcome banner */}
      <div className="mb-5 rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 flex items-center gap-3">
        <div className="text-2xl">👋</div>
        <p className="text-sm text-orange-800 font-medium">Welcome back! Ready to learn something new today?</p>
      </div>

      <AuthError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Roll Number</label>
          <input
            type="text"
            value={rollNumber}
            onChange={e => setRollNumber(e.target.value)}
            placeholder="e.g. 2024-GR9-001"
            required
            autoComplete="username"
            className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${theme.ring} transition font-mono`}
          />
          <p className="text-xs text-gray-400 mt-1">Your roll number was shared in your welcome email</p>
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
          <Link href="/student/forgot-password" className="text-sm text-orange-600 hover:text-orange-800 font-medium transition">
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
          ) : 'Let\'s Go! →'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-gray-100 text-center">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition">← Back to portal selection</Link>
      </div>
    </AuthShell>
  )
}
