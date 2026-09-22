'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES } from '@/app/components/AuthShell'
import BirthdayField from '@/app/components/BirthdayField'
import { FullPageLoader } from '@/components/loaders'

// Reached once, right after change-password succeeds on a genuinely first
// login (see the redirect in app/parent/change-password/page.tsx). If the
// parent somehow lands here again with date_of_birth already set (back
// button, bookmark), it passes straight through to the portal instead of
// re-prompting.
export default function ParentAddBirthdayPage() {
  const router = useRouter()
  const theme = THEMES.parent
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetch('/api/parent/auth/me')
      .then(async r => {
        if (!r.ok) { router.push('/parent/login'); return }
        const data = await r.json()
        if (data.date_of_birth) { router.push('/parent/set-gender'); return }
        setChecking(false)
      })
      .catch(() => router.push('/parent/login'))
  }, [router])

  if (checking) return <FullPageLoader portal="parent" message="One more thing…" />

  return (
    <AuthShell theme={theme} title="When's your birthday?" subtitle="We'll mark it on your profile with a little birthday note 🎂">
      <BirthdayField
        value={null}
        endpoint="/api/parent/auth/date-of-birth"
        kind="adult"
        ring={theme.ring}
        accentGradient={theme.btnGradient}
        showSkip
        onSkip={() => router.push('/parent/set-gender')}
        onSaved={() => router.push('/parent/set-gender')}
      />
    </AuthShell>
  )
}
