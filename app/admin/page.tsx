'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError, AuthInput, AuthButton, PasswordField } from '@/app/components/AuthShell'
import { setUsageSessionId } from '@/lib/usageSession'

export default function AdminLoginPage() {
  const router = useRouter()
  const theme = THEMES.platform

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid credentials'); return }

      if (data.role !== 'platform_admin') {
        setError('This login is for platform administrators only')
        return
      }

      setUsageSessionId(data.usageSessionId)

      router.push('/platform-admin')
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell theme={theme} title="Platform Admin" subtitle="Manage schools, subscriptions & platform settings">
      <AuthError message={error} />
      <form onSubmit={handleSubmit} data-testid="admin-login-form" className="space-y-4">
        <AuthInput
          label="Email Address"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="admin@welearnyoulearn.com"
          autoComplete="email"
          ring={theme.ring}
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          ring={theme.ring}
          autoComplete="current-password"
        />
        <AuthButton loading={loading} label="Sign In" gradient={theme.btnGradient} />
      </form>
      <div className="mt-5 pt-5 border-t border-white/8 text-center">
        <Link href="/" className="text-sm text-white/30 hover:text-white/50 transition">← Back to main portal</Link>
      </div>
    </AuthShell>
  )
}
