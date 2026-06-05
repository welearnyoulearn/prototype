'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'

export default function ParentChangePasswordPage() {
  const router = useRouter()
  const theme = THEMES.parent

  const [current, setCurrent]     = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== confirm) { setError('Passwords do not match'); return }
    if (newPw.length < 8)  { setError('Password must be at least 8 characters'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/parent/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current || undefined, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to change password'); return }
      router.push('/parent')
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Set Your Password" subtitle="Create a secure password for your parent account">

      <div className="mb-5 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3 flex items-start gap-3">
        <svg className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div>
          <p className="text-sm text-teal-800 font-semibold">Secure your account</p>
          <p className="text-xs text-teal-700 mt-0.5">Replace the temporary password with something memorable. Your child&apos;s data is protected.</p>
        </div>
      </div>

      <AuthError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="Temporary Password (from welcome email)"
          value={current}
          onChange={setCurrent}
          placeholder="Paste from your welcome email"
          ring={theme.ring}
          autoComplete="current-password"
          required={false}
        />
        <PasswordField
          label="New Password"
          value={newPw}
          onChange={setNewPw}
          placeholder="At least 8 characters"
          ring={theme.ring}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Repeat your new password"
          ring={theme.ring}
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={loading}
          className={`w-full bg-gradient-to-r ${theme.btnGradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}
        >
          {loading
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving...</>
            : 'Save & View Dashboard →'}
        </button>
      </form>
    </AuthShell>
  )
}
