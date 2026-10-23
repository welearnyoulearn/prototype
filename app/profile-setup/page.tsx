'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { AuthError, AuthInput, THEMES } from '@/app/components/AuthShell'
import { ButtonLoader, FullPageLoader } from '@/components/loaders'

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

  if (!user) return <FullPageLoader portal="school-admin" message="Preparing your profile" sub="Loading your account details…" />

  const theme = user.role === 'platform_admin' ? THEMES.platform : THEMES.admin

  return (
    <AuthShell theme={theme} title="Complete your profile" subtitle={user.school_name ? `Set up your details for ${user.school_name}.` : 'Set up your platform administrator details.'}>
      <AuthError message={error} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput label="Full name" value={fullName} onChange={setFullName} placeholder="e.g. Rajesh Kumar" hint="Shown in audit logs, receipts and staff lists." ring={theme.ring} autoComplete="name" />
        <AuthInput label="Phone number (optional)" type="tel" value={phone} onChange={setPhone} placeholder="+91 98765 43210" required={false} ring={theme.ring} autoComplete="tel" />
        <button type="submit" disabled={loading || !fullName.trim()} className="auth-submit">
          {loading ? <ButtonLoader label="Saving profile…" /> : 'Continue to dashboard'}
        </button>
      </form>
      <p className="mt-5 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">You can update these details later in School Settings.</p>
    </AuthShell>
  )
}
