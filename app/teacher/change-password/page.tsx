'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES, AuthError } from '@/app/components/AuthShell'
import { PasswordField } from '@/app/components/AuthShell'

export default function TeacherChangePasswordPage() {
  const router = useRouter()
  const theme = THEMES.teacher

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
      const res = await fetch('/api/teacher/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current || undefined, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to change password'); return }
      router.push('/teacher')
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Set Your Password" subtitle="You must set a new password before continuing">
      <div className="mb-5 flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-emerald-800">
          For your security, please replace the temporary password sent to your email with a new one you&apos;ll remember.
        </p>
      </div>

      <AuthError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="Current / Temporary Password"
          value={current}
          onChange={setCurrent}
          placeholder="Paste the temporary password from email"
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

        <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          Password must be at least 8 characters. Use a mix of letters, numbers, and symbols for best security.
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full bg-gradient-to-r ${theme.btnGradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}
        >
          {loading ? (
            <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving...</>
          ) : 'Set New Password & Continue →'}
        </button>
      </form>
    </AuthShell>
  )
}
