'use client'

import { useState } from 'react'

type Props = {
  endpoint: string
  accentGradient: string
}

// Self-service "Change Password" card for a portal's own Profile/Settings
// tab — distinct from the forced first-login change-password pages
// (app/student/change-password, app/parent/change-password), which only
// exist to replace a temp password once. This is the voluntary path: always
// requires the current password (the backend route itself only waives that
// during an un-changed first login), reusable in any portal.
export default function ChangePasswordCard({ endpoint, accentGradient }: Props) {
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess(false)
    if (newPw !== confirm) { setError('New passwords do not match'); return }
    if (newPw.length < 8) { setError('New password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to change password'); return }
      setSuccess(true)
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className={`bg-gradient-to-r ${accentGradient} px-6 py-4`}>
        <h3 className="text-white font-semibold text-sm">Change Password</h3>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-4" data-testid="change-password-form">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-2.5">Password changed successfully.</div>
        )}
        <LightPasswordField label="Current Password" value={current} onChange={setCurrent} autoComplete="current-password" testId="change-password-current" />
        <LightPasswordField label="New Password" value={newPw} onChange={setNewPw} placeholder="At least 8 characters" autoComplete="new-password" testId="change-password-new" />
        <LightPasswordField label="Confirm New Password" value={confirm} onChange={setConfirm} placeholder="Type it again" autoComplete="new-password" testId="change-password-confirm" />
        <button
          type="submit"
          disabled={loading}
          data-testid="change-password-submit"
          className={`w-full bg-gradient-to-r ${accentGradient} text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 hover:shadow-md`}
        >
          {loading ? 'Saving...' : 'Save New Password'}
        </button>
      </form>
    </div>
  )
}

function LightPasswordField({
  label, value, onChange, placeholder = 'Enter password', autoComplete, testId,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; autoComplete?: string; testId: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          data-testid={testId}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition pr-11"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
        >
          {show
            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          }
        </button>
      </div>
    </div>
  )
}
