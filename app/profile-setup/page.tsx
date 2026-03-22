'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type UserData = {
  role: string
  school_name?: string
  school_code?: string
  full_name?: string
  phone?: string
  designation?: string
  bio?: string
}

export default function ProfileSetupPage() {
  const router = useRouter()
  const [user, setUser]             = useState<UserData | null>(null)
  const [fullName, setFullName]     = useState('')
  const [phone, setPhone]           = useState('')
  const [designation, setDesignation] = useState('')
  const [bio, setBio]               = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [step, setStep]             = useState(1)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then((d: UserData) => {
      setUser(d)
      setFullName(d.full_name || '')
      setPhone(d.phone || '')
      setDesignation(d.designation || '')
      setBio(d.bio || '')
    }).catch(() => router.push('/login'))
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Full name is required'); return }
    if (phone && !/^\+?[\d\s\-\(\)]{7,15}$/.test(phone)) { setError('Phone number must be 7–15 digits'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone, designation, bio }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save'); return }
      router.push(user?.role === 'platform_admin' ? '/platform-admin' : '/school-admin')
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
      <p className="text-slate-400">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-black text-2xl">W</span>
          </div>
          <h1 className="text-2xl font-bold text-white">WLYL</h1>
          <p className="text-slate-400 text-sm mt-1">Profile Setup</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress */}
          <div className="bg-blue-600 px-8 py-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-semibold text-sm">Step {step} of 2</p>
              <p className="text-blue-200 text-xs">
                {user.role === 'school_admin' ? `School: ${user.school_name}` : 'Platform Admin'}
              </p>
            </div>
            <div className="w-full bg-blue-500 rounded-full h-1.5">
              <div className="bg-white rounded-full h-1.5 transition-all" style={{ width: step === 1 ? '50%' : '100%' }} />
            </div>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              {step === 1 ? (
                /* Step 1: Basic info */
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Basic Information</h2>
                    <p className="text-sm text-gray-500 mb-5">Tell us about yourself</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                    <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                      placeholder="Your full name"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Designation / Role</label>
                    <input type="text" value={designation} onChange={e => setDesignation(e.target.value)}
                      placeholder="e.g., Principal, School Admin"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>

                  <button type="button" onClick={() => { if (!fullName.trim()) { setError('Full name is required'); return } setError(''); setStep(2) }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm transition">
                    Next →
                  </button>
                </div>
              ) : (
                /* Step 2: About */
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-1">About You</h2>
                    <p className="text-sm text-gray-500 mb-5">A short bio helps your team recognise you</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Short Bio <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
                      placeholder="Tell us a bit about yourself, your experience, etc."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                  </div>

                  {/* Summary */}
                  <div className="bg-blue-50 rounded-xl px-4 py-4 text-sm space-y-1.5">
                    <p className="font-semibold text-blue-800 mb-2">Profile Summary</p>
                    <p className="text-gray-700"><span className="text-gray-500">Name: </span>{fullName}</p>
                    {phone && <p className="text-gray-700"><span className="text-gray-500">Phone: </span>{phone}</p>}
                    {designation && <p className="text-gray-700"><span className="text-gray-500">Designation: </span>{designation}</p>}
                  </div>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep(1)}
                      className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-3 rounded-xl text-sm transition">
                      ← Back
                    </button>
                    <button type="submit" disabled={loading}
                      className="flex-2 flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60">
                      {loading ? 'Saving...' : 'Complete Setup →'}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
