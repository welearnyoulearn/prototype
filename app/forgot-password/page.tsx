'use client'

import { useState } from 'react'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, AuthInput } from '@/app/components/AuthShell'
import { ButtonLoader } from '@/components/loaders'

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
            <AuthInput label="School ID or Email" type="text" value={identifier} onChange={setIdentifier}
          required={true} placeholder="wlyl-schl-... or admin@email.com" ring={theme.ring} />
            <button type="submit" disabled={loading}
              className="auth-submit">
              {loading
                ? <ButtonLoader label="Sending…" />
                : 'Send Reset Link'}
            </button>
          </form>
          <div className="mt-5 pt-5 border-t border-border text-center">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-primary transition">← Back to login</Link>
          </div>
        </>
      )}
    </AuthShell>
  )
}
