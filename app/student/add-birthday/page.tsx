'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES } from '@/app/components/AuthShell'
import BirthdayField from '@/app/components/BirthdayField'
import { FullPageLoader } from '@/components/loaders'

// Reached once, right after change-password succeeds on a genuinely first
// login (see the redirect in app/student/change-password/page.tsx). If the
// student somehow lands here again with date_of_birth already set (back
// button, bookmark), it passes straight through to the portal instead of
// re-prompting.
export default function StudentAddBirthdayPage() {
  const router = useRouter()
  const theme = THEMES.student
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetch('/api/student/auth/me')
      .then(async r => {
        if (!r.ok) { router.push('/student/login'); return }
        const data = await r.json()
        if (data.date_of_birth) { router.push('/student/set-gender'); return }
        setChecking(false)
      })
      .catch(() => router.push('/student/login'))
  }, [router])

  if (checking) return <FullPageLoader portal="student" message="One more thing…" />

  return (
    <AuthShell theme={theme} title="When's your birthday?" subtitle="We'll give your class a heads-up on your special day 🎉">
      <BirthdayField
        value={null}
        endpoint="/api/student/auth/date-of-birth"
        kind="student"
        ring={theme.ring}
        accentGradient={theme.btnGradient}
        showSkip
        onSkip={() => router.push('/student/set-gender')}
        onSaved={() => router.push('/student/set-gender')}
      />
    </AuthShell>
  )
}
