'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES } from '@/app/components/AuthShell'
import { FullPageLoader, ButtonLoader } from '@/components/loaders'

// Reached once, right after add-birthday, on a genuinely first login. If the
// teacher somehow lands here again with gender already set (back button,
// bookmark), it passes straight through to set-avatar instead of
// re-prompting — mirrors add-birthday's own "already done" guard.
export default function TeacherSetGenderPage() {
  const router = useRouter()
  const theme = THEMES.teacher
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/teacher/auth/me')
      .then(async r => {
        if (!r.ok) { router.push('/teacher/login'); return }
        const data = await r.json()
        if (data.gender) { router.push('/teacher/set-avatar'); return }
        setChecking(false)
      })
      .catch(() => router.push('/teacher/login'))
  }, [router])

  async function choose(gender: 'male' | 'female' | null) {
    setSaving(true)
    try {
      await fetch('/api/teacher/auth/gender', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gender }),
      })
    } finally {
      router.push('/teacher/set-avatar')
    }
  }

  if (checking) return <FullPageLoader portal="teacher" message="One more thing…" />

  return (
    <AuthShell theme={theme} title="How do you identify?" subtitle="This helps us show avatars that feel like you.">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => choose('male')}
          disabled={saving}
          data-testid="gender-male-btn"
          className="min-h-14 w-full rounded-md border border-input px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-[var(--auth-accent)] hover:bg-[var(--auth-soft)] disabled:cursor-wait disabled:opacity-60"
        >
          Male
        </button>
        <button
          type="button"
          onClick={() => choose('female')}
          disabled={saving}
          data-testid="gender-female-btn"
          className="min-h-14 w-full rounded-md border border-input px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-[var(--auth-accent)] hover:bg-[var(--auth-soft)] disabled:cursor-wait disabled:opacity-60"
        >
          Female
        </button>
        <button
          type="button"
          onClick={() => choose(null)}
          disabled={saving}
          data-testid="gender-skip-btn"
          className="min-h-12 w-full rounded-md px-4 py-2.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? <ButtonLoader label="Saving…" /> : 'Prefer not to say'}
        </button>
      </div>
    </AuthShell>
  )
}
