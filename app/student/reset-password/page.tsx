'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const theme = THEMES.student

  const [valid, setValid]     = useState<boolean | null>(null)
  const [newPw, setNewPw]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  useEffect(() => {
    if (!token) { setValid(false); return }
    fetch(`/api/student/auth/reset-password?token=${token}`)
      .then(r => r.json()).then(d => setValid(d.valid)).catch(() => setValid(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== confirm) { setError('Passwords do not match'); return }
    if (newPw.length < 6)  { setError('Password must be at least 6 characters'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/student/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setDone(true)
      setTimeout(() => router.push('/student/login'), 2500)
    } catch { setError('Connection error.') } finally { setLoading(false) }
  }

  if (valid === null) return <p className="text-center text-gray-400 py-8">Validating link...</p>
  if (!valid) return (
    <div className="text-center py-4">
      <div className="text-4xl mb-3">⏰</div>
      <h3 className="font-semibold text-gray-900 mb-2">Link expired</h3>
      <p className="text-sm text-gray-500 mb-4">This reset link is no longer valid. Request a new one.</p>
      <Link href="/student/forgot-password" className="text-orange-600 font-medium text-sm">Request new link →</Link>
    </div>
  )
  if (done) return (
    <div className="text-center py-4">
      <div className="text-4xl mb-3">✅</div>
      <h3 className="font-semibold text-gray-900 mb-2">Password reset!</h3>
      <p className="text-sm text-gray-500">Taking you to login...</p>
    </div>
  )

  return (
    <>
      <AuthError message={error} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField label="New Password" value={newPw} onChange={setNewPw} placeholder="At least 6 characters" ring={theme.ring} autoComplete="new-password" />
        <PasswordField label="Confirm Password" value={confirm} onChange={setConfirm} placeholder="Type it again" ring={theme.ring} autoComplete="new-password" />
        <button type="submit" disabled={loading}
          className={`w-full bg-gradient-to-r ${theme.btnGradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}>
          {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving...</> : 'Reset Password'}
        </button>
      </form>
    </>
  )
}

export default function StudentResetPasswordPage() {
  return (
    <AuthShell theme={THEMES.student} title="Reset Your Password" subtitle="Enter a new password for your account">
      <Suspense fallback={<p className="text-center text-gray-400 py-8">Loading...</p>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  )
}
