'use client'

import { useState } from 'react'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, AuthInput } from '@/app/components/AuthShell'
import { ButtonLoader } from '@/components/loaders'

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
            <AuthInput label="Roll Number" type="text" value={rollNumber} onChange={setRollNumber}
          required={false} placeholder="e.g. 2024-GR9-001" ring={theme.ring} />
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <AuthInput label="Registered Email" type="email" value={email} onChange={setEmail}
          required={false} placeholder="your.email@example.com" ring={theme.ring} />
            <button type="submit" disabled={loading || (!rollNumber && !email)}
              className="auth-submit">
              {loading
                ? <ButtonLoader label="Sending…" />
                : 'Send Reset Link'}
            </button>
          </form>
          <div className="mt-5 pt-5 border-t border-border text-center">
            <Link href="/student/login" className="text-sm text-muted-foreground hover:text-primary transition">← Back to login</Link>
          </div>
        </>
      )}
    </AuthShell>
  )
}
