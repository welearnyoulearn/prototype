'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const theme = THEMES.parent

  const [valid, setValid]     = useState<boolean | null>(null)
  const [newPw, setNewPw]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  useEffect(() => {
    if (!token) { setValid(false); return }
    fetch(`/api/parent/auth/reset-password?token=${token}`)
      .then(r => r.json()).then(d => setValid(d.valid)).catch(() => setValid(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== confirm) { setError('Passwords do not match'); return }
    if (newPw.length < 8)  { setError('Password must be at least 8 characters'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/parent/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setDone(true)
      setTimeout(() => router.push('/parent/login'), 2500)
    } catch { setError('Connection error.') } finally { setLoading(false) }
  }

  if (valid === null) return <p className="text-center text-gray-400 py-8">Validating link...</p>
  if (!valid) return (
    <div className="text-center py-4">
      <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L3.07 16.5C2.3 17.333 3.262 19 4.8 19z" /></svg>
      </div>
      <h3 className="font-semibold text-gray-900 mb-2">Link expired</h3>
      <p className="text-sm text-gray-500 mb-4">This link is no longer valid. Request a new one.</p>
      <Link href="/parent/forgot-password" className="text-teal-600 font-medium text-sm">Request new link →</Link>
    </div>
  )
  if (done) return (
    <div className="text-center py-4">
      <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      </div>
      <h3 className="font-semibold text-gray-900 mb-2">Password reset!</h3>
      <p className="text-sm text-gray-500">Redirecting to login...</p>
    </div>
  )

  return (
    <>
      <AuthError message={error} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField label="New Password" value={newPw} onChange={setNewPw} placeholder="At least 8 characters" ring={theme.ring} autoComplete="new-password" />
        <PasswordField label="Confirm Password" value={confirm} onChange={setConfirm} placeholder="Repeat your new password" ring={theme.ring} autoComplete="new-password" />
        <button type="submit" disabled={loading}
          className={`w-full ${theme.accent} ${theme.accentHover} text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60 shadow-sm flex items-center justify-center gap-2`}>
          {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving...</> : 'Reset Password'}
        </button>
      </form>
    </>
  )
}

export default function ParentResetPasswordPage() {
  return (
    <AuthShell theme={THEMES.parent} title="Reset Your Password" subtitle="Enter a new password for your parent account">
      <Suspense fallback={<p className="text-center text-gray-400 py-8">Loading...</p>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  )
}
