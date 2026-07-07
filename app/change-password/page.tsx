'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'

function ChangePasswordForm() {
  const router  = useRouter()
  const params  = useSearchParams()
  const isFirst = params.get('first') === '1'
  const theme   = THEMES.admin

  const [current, setCurrent]     = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      router.push(data.profileCompleted ? '/school-admin' : '/profile-setup')
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const strengthChecks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'One uppercase letter',  ok: /[A-Z]/.test(password) },
    { label: 'One number',            ok: /\d/.test(password) },
  ]

  return (
    <AuthShell
      theme={theme}
      title={isFirst ? 'Set Your Password' : 'Change Password'}
      subtitle={isFirst ? 'Replace the temporary password before continuing' : 'Enter your current and new password'}
    >
      {isFirst && (
        <div className="mb-5 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-blue-800">
            You&apos;re logged in with a temporary password. Set a permanent one to secure your admin account.
          </p>
        </div>
      )}

      <AuthError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isFirst && (
          <PasswordField label="Current Password" value={current} onChange={setCurrent}
            placeholder="Your current password" ring={theme.ring} autoComplete="current-password" />
        )}
        <PasswordField label="New Password" value={password} onChange={setPassword}
          placeholder="At least 8 characters" ring={theme.ring} autoComplete="new-password" />
        <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm}
          placeholder="Repeat your new password" ring={theme.ring} autoComplete="new-password" />

        {/* Strength indicator */}
        <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
          {strengthChecks.map(c => (
            <div key={c.label} className={`flex items-center gap-2 text-xs transition ${c.ok ? 'text-green-600' : 'text-gray-400'}`}>
              {c.ok
                ? <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>}
              {c.label}
            </div>
          ))}
        </div>

        <button type="submit" disabled={loading}
          className={`w-full bg-gradient-to-r ${theme.btnGradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}>
          {loading
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving...</>
            : 'Set New Password & Continue →'}
        </button>
      </form>
    </AuthShell>
  )
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="text-white/50">Loading...</div></div>}>
      <ChangePasswordForm />
    </Suspense>
  )
}
