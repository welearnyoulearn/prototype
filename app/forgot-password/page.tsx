'use client'

import { useState } from 'react'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError } from '@/app/components/AuthShell'

export default function ForgotPasswordPage() {
  const theme = THEMES.admin
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading]       = useState(false)
  const [sent, setSent]             = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <AuthShell theme={theme} title="Forgot Password?" subtitle="We'll send a reset link to your registered email">
      {sent ? (
        <div className="text-center py-4">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Check your email</h3>
          <p className="text-sm text-gray-500 mb-5">If an account exists for that identifier, a reset link was sent. It expires in 1 hour.</p>
          <Link href="/login" className="text-blue-600 font-medium text-sm hover:text-blue-800 transition">← Back to login</Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">School ID or Email</label>
              <input
                type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                placeholder="wlyl-schl-... or admin@email.com" required
                className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${theme.ring} transition`}
              />
            </div>
            <button type="submit" disabled={loading}
              className={`w-full ${theme.accent} ${theme.accentHover} text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60 shadow-sm flex items-center justify-center gap-2`}>
              {loading
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending...</>
                : 'Send Reset Link'}
            </button>
          </form>
          <div className="mt-5 pt-5 border-t border-gray-100 text-center">
            <Link href="/login" className="text-sm text-gray-400 hover:text-gray-600 transition">← Back to login</Link>
          </div>
        </>
      )}
    </AuthShell>
  )
}
