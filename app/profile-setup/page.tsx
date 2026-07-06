'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type UserData = {
  role: string
  school_name?: string
  full_name?: string
  phone?: string
}

export default function ProfileSetupPage() {
  const router = useRouter()
  const [user, setUser]       = useState<UserData | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: UserData) => {
        setUser(d)
        setFullName(d.full_name || '')
        setPhone(d.phone || '')
      })
      .catch(() => router.push('/login'))
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Full name is required'); return }
    if (phone && !/^\+?[\d\s\-\(\)]{7,15}$/.test(phone)) {
      setError('Phone number must be 7–15 digits'); return
    }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), phone: phone.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save'); return }
      router.push(user?.role === 'platform_admin' ? '/platform-admin' : '/school-admin')
    } catch {
      setError('Connection error — please try again')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Loading…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-black text-xl">W</span>
          </div>
          <h1 className="text-xl font-bold text-white">WLYL School Portal</h1>
          <p className="text-slate-400 text-sm mt-1">One last step before you begin</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="bg-blue-600 px-7 py-5">
            <p className="text-white font-bold text-base">Complete Your Profile</p>
            <p className="text-blue-200 text-xs mt-0.5">
              {user.school_name ? `Setting up: ${user.school_name}` : 'Platform Admin'}
            </p>
          </div>

          <div className="px-7 py-6">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Your Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  autoFocus
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-xs text-gray-400 mt-1">This name appears in audit logs, receipts and staff lists</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone Number <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !fullName.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
                {loading
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</>
                  : 'Go to Dashboard →'
                }
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          You can update these details anytime in School Settings
        </p>
      </div>
    </div>
  )
}
