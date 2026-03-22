'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const role = params.get('role') // 'platform' | 'school' | null

  const isPlatform = role === 'platform'
  const isSchool   = role === 'school'

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid credentials'); return }

      if (data.firstLogin) {
        router.push('/change-password?first=1')
      } else if (!data.profileCompleted) {
        router.push('/profile-setup')
      } else if (data.role === 'platform_admin') {
        router.push('/platform-admin')
      } else {
        router.push('/school-admin')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const roleLabel    = isPlatform ? 'Platform Admin' : isSchool ? 'School Admin' : 'Sign In'
  const roleColor    = isPlatform ? 'bg-purple-600' : 'bg-blue-600'
  const roleBadge    = isPlatform ? 'bg-purple-100 text-purple-700' : isSchool ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
  const placeholder  = isPlatform ? 'admin@youremail.com' : 'wlyl-schl-schoolname-1'
  const inputLabel   = isPlatform ? 'Email Address' : isSchool ? 'School ID' : 'School ID or Email'

  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
      {/* Colored header */}
      <div className={`${roleColor} px-8 py-6`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/70 text-xs font-medium uppercase tracking-widest">WLYL Portal</p>
            <h2 className="text-xl font-bold text-white mt-1">{roleLabel}</h2>
          </div>
          {(isPlatform || isSchool) && (
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${roleBadge}`}>
              {isPlatform ? 'Platform' : 'School'}
            </span>
          )}
        </div>
      </div>

      <div className="px-8 py-7">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{inputLabel}</label>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder={placeholder}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
            />
            {isSchool && (
              <p className="text-xs text-gray-400 mt-1">Your School ID was sent in the onboarding email (format: wlyl-schl-...)</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition pr-12"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw
                  ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                }
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Forgot password?
            </Link>
          </div>

          <button type="submit" disabled={loading}
            className={`w-full ${roleColor} hover:opacity-90 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60 shadow-sm`}>
            {loading ? 'Signing in...' : `Sign In as ${roleLabel}`}
          </button>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-100 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            ← Back to role selection
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3 shadow-lg">
            <span className="text-white font-black text-xl">W</span>
          </div>
          <h1 className="text-xl font-bold text-white">WLYL</h1>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-gray-400">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
