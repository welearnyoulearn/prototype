'use client'

import { useEffect, useState } from 'react'

const ROLE_LABELS: Record<string, string> = {
  principal: 'Principal',
  vice_principal: 'Vice Principal',
  school_admin: 'School Admin',
}

export default function StaffProfile() {
  const [profile, setProfile] = useState<{ full_name: string; email: string; role: string; school_name: string } | null>(null)
  const [curPwd, setCurPwd]   = useState('')
  const [newPwd, setNewPwd]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setProfile(d)).catch(() => {})
  }, [])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPwd !== confirm) { setMsg({ ok: false, text: 'New passwords do not match.' }); return }
    if (newPwd.length < 8)  { setMsg({ ok: false, text: 'Password must be at least 8 characters.' }); return }
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ ok: false, text: data.error || 'Failed to change password.' }); return }
      setMsg({ ok: true, text: 'Password changed successfully.' })
      setCurPwd(''); setNewPwd(''); setConfirm('')
    } catch {
      setMsg({ ok: false, text: 'Connection error. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-800">My Profile</h2>
        <p className="text-sm text-gray-400 mt-0.5">Your account details</p>
      </div>

      {/* Info card */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl flex-shrink-0">
            {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-base">{profile.full_name}</p>
            <p className="text-sm text-gray-500">{profile.email}</p>
            <span className="inline-block mt-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
              {ROLE_LABELS[profile.role] || profile.role}
            </span>
          </div>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">School</p>
          <p className="text-sm text-gray-700 font-medium">{profile.school_name}</p>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Change Password</h3>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Current Password</label>
            <input type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">New Password</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required minLength={8}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm New Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {msg && (
            <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
          )}
          <button type="submit" disabled={saving || !curPwd || !newPwd || !confirm}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
