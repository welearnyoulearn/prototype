'use client'

import { useState } from 'react'
import Link from 'next/link'
import AuthShell, { AuthError, AuthInput, type AuthTheme } from '@/app/components/AuthShell'
import { ButtonLoader } from '@/components/loaders'
import type { ForgotPasswordResult } from '@/lib/forgotPassword'

// One forgot-password screen for every portal (#451). Each portal page passes
// its theme and wording; the result handling is identical everywhere.

type Props = {
  theme: AuthTheme
  subtitle: string
  endpoint: string
  loginHref: string
  fieldLabel: string
  placeholder: string
  inputType?: string
  autoComplete?: string
  // What to call the thing the user typed, e.g. "email" -> "We couldn't find an account with that email."
  notFoundNoun: string
}

export default function ForgotPasswordForm({
  theme, subtitle, endpoint, loginHref, fieldLabel, placeholder, inputType = 'text', autoComplete, notFoundNoun,
}: Props) {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string[] | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      const data = await res.json().catch(() => null) as ForgotPasswordResult | { error?: string } | null
      if (data && 'status' in data) {
        if (data.status === 'sent') { setSentTo(data.sentTo); return }
        if (data.status === 'not_found') setError(`We couldn't find an account with that ${notFoundNoun}. Check it and try again.`)
        else if (data.status === 'no_contact') setError('Your account has no email address on file, so we can\'t send a reset link. Please ask your school office to help.')
        else if (data.status === 'ambiguous') setError('More than one account matches that. Please use your Student ID or email instead, or ask your school office.')
        else setError('Too many attempts. Please wait a few minutes and try again.')
      } else {
        setError((data && 'error' in data && data.error) || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Forgot Password?" subtitle={subtitle}>
      {sentTo ? (
        <div className="text-center py-4" data-testid="forgot-password-sent">
          <div className="text-4xl mb-3" aria-hidden="true">📬</div>
          <h3 className="font-semibold text-gray-900 mb-2">Check your email!</h3>
          <p className="text-sm text-gray-500 mb-2">We&apos;ve sent a reset link to</p>
          <p className="text-base font-semibold text-gray-900 mb-3" data-testid="forgot-password-sent-to">{sentTo.join(', ')}</p>
          <p className="text-sm text-gray-500 mb-5">It expires in 1 hour. Check your spam folder if you don&apos;t see it.</p>
          <p className="text-xs text-gray-400 mb-4">Not your email? Ask your school office to update it.</p>
          <Link href={loginHref} data-testid="forgot-password-back-to-login" className="text-sm font-medium text-primary hover:underline transition">← Back to login</Link>
        </div>
      ) : (
        <>
          <AuthError message={error} />
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="forgot-password-form">
            <AuthInput label={fieldLabel} type={inputType} value={identifier} onChange={setIdentifier}
              required placeholder={placeholder} autoComplete={autoComplete} ring={theme.ring}
              testId="forgot-password-identifier-input" />
            <button type="submit" disabled={loading || !identifier.trim()} data-testid="forgot-password-submit-btn"
              className="auth-submit">
              {loading ? <ButtonLoader label="Sending…" /> : 'Send Reset Link'}
            </button>
          </form>
          <div className="mt-5 pt-5 border-t border-border text-center">
            <Link href={loginHref} data-testid="forgot-password-back-to-login" className="text-sm text-muted-foreground hover:text-primary transition">← Back to login</Link>
          </div>
        </>
      )}
    </AuthShell>
  )
}
