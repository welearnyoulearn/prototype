'use client'

import { useState } from 'react'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError } from '@/app/components/AuthShell'

export default function StudentForgotPasswordPage() {
  const theme = THEMES.student
  const [rollNumber, setRollNumber] = useState('')
  const [email, setEmail]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [sent, setSent]             = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await fetch('/api/student/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber: rollNumber || undefined, email: email || undefined }),
      })
      setSent(true)
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Forgot Password?" subtitle="We'll send a reset link to your registered email">
      {sent ? (
        <div className="text-center py-4">
          <div className="text-4xl mb-3">📬</div>
          <h3 className="font-semibold text-gray-900 mb-2">Check your email!</h3>
          <p className="text-sm text-gray-500 mb-5">If your account has a registered email, a reset link has been sent. It expires in 1 hour.</p>
          <p className="text-xs text-gray-400 mb-4">No email? Ask your school admin to resend your account details.</p>
          <Link href="/student/login" className="text-orange-600 font-medium text-sm hover:text-orange-800 transition">← Back to login</Link>
        </div>
      ) : (
        <>
          <AuthError message={error} />
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Roll Number</label>
              <input
                type="text" value={rollNumber} onChange={e => setRollNumber(e.target.value)}
                placeholder="e.g. 2024-GR9-001"
                className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${theme.ring} transition font-mono`}
              />
            </div>
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Registered Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${theme.ring} transition`}
              />
            </div>
            <button type="submit" disabled={loading || (!rollNumber && !email)}
              className={`w-full ${theme.accent} ${theme.accentHover} text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60 shadow-sm flex items-center justify-center gap-2`}>
              {loading
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending...</>
                : 'Send Reset Link'}
            </button>
          </form>
          <div className="mt-5 pt-5 border-t border-gray-100 text-center">
            <Link href="/student/login" className="text-sm text-gray-400 hover:text-gray-600 transition">← Back to login</Link>
          </div>
        </>
      )}
    </AuthShell>
  )
}
