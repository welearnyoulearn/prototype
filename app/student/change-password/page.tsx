'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES, AuthError, PasswordField } from '@/app/components/AuthShell'
import { ButtonLoader } from '@/components/loaders'

export default function StudentChangePasswordPage() {
  const router = useRouter()
  const theme = THEMES.student

  const [current, setCurrent]     = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== confirm) { setError('Passwords do not match'); return }
    if (newPw.length < 6)  { setError('Password must be at least 6 characters'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/student/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current || undefined, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to change password'); return }
      router.push('/student')
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Create Your Password" subtitle="Choose a new password to protect your account">

      <div className="mb-5 rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 flex items-start gap-3">
        <span className="text-xl">🔐</span>
        <div>
          <p className="text-sm text-orange-800 font-semibold">One last step!</p>
          <p className="text-xs text-orange-700 mt-0.5">Replace the temporary password with one you&apos;ll remember. You only need to do this once.</p>
        </div>
      </div>

      <AuthError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="Temporary Password (from your welcome email)"
          value={current}
          onChange={setCurrent}
          placeholder="Paste the temporary password"
          ring={theme.ring}
          autoComplete="current-password"
          required={false}
        />
        <PasswordField
          label="New Password"
          value={newPw}
          onChange={setNewPw}
          placeholder="At least 6 characters"
          ring={theme.ring}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Type it again"
          ring={theme.ring}
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={loading}
          className={`w-full bg-gradient-to-r ${theme.btnGradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}
        >
          {loading
            ? <ButtonLoader label="Saving..." />
            : 'Save & Start Learning →'}
        </button>
      </form>
    </AuthShell>
  )
}
