'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SetupPage() {
  const router = useRouter()
  const [exists, setExists]     = useState<boolean | null>(null)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [secret, setSecret]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  useEffect(() => {
    fetch('/api/auth/setup-admin').then(r => r.json()).then(d => setExists(d.exists))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, secret }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setDone(true)
      setTimeout(() => router.push('/login?role=platform'), 2000)
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  if (exists === null) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-slate-400">Checking...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-black text-2xl">W</span>
          </div>
          <h1 className="text-2xl font-bold text-white">WLYL Setup</h1>
          <p className="text-slate-400 text-sm mt-1">First-time platform admin setup</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {exists ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Platform Admin Already Exists</h2>
              <p className="text-sm text-gray-500 mb-5">Setup has already been completed. Please log in with your admin credentials.</p>
              <Link href="/login?role=platform"
                className="block w-full bg-purple-600 hover:bg-purple-700 text-white text-center font-semibold py-3 rounded-xl text-sm transition">
                Go to Login →
              </Link>
            </div>
          ) : done ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Platform Admin Created!</h2>
              <p className="text-sm text-gray-500">Redirecting to login...</p>
            </div>
          ) : (
            <>
              <div className="bg-purple-600 px-8 py-5">
                <h2 className="text-white font-bold text-lg">Create Platform Admin</h2>
                <p className="text-purple-200 text-sm mt-0.5">This page is only available once — before any admin exists.</p>
              </div>
              <div className="px-8 py-6">
                {error && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Admin Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                      placeholder="admin@wlyl.com"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                      placeholder="At least 8 characters"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Setup Secret <span className="text-gray-400 font-normal text-xs">(from .env.local → SETUP_SECRET)</span>
                    </label>
                    <input type="password" value={secret} onChange={e => setSecret(e.target.value)} required
                      placeholder="wlyl-setup-2024"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60">
                    {loading ? 'Creating...' : 'Create Platform Admin →'}
                  </button>
                </form>
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                  Setup Secret is <code className="font-mono font-bold">wlyl-setup-2024</code> (set in .env.local as SETUP_SECRET)
                </div>
              </div>
            </>
          )}
        </div>
        <p className="text-center mt-4"><Link href="/" className="text-slate-500 text-xs hover:text-slate-300">← Back to home</Link></p>
      </div>
    </div>
  )
}
