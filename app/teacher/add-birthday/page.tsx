'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES } from '@/app/components/AuthShell'
import BirthdayField from '@/app/components/BirthdayField'
import { FullPageLoader } from '@/components/loaders'

// Reached once, right after change-password succeeds on a genuinely first
// login (see the redirect in app/teacher/change-password/page.tsx). If the
// teacher somehow lands here again with date_of_birth already set (back
// button, bookmark), it passes straight through to the portal instead of
// re-prompting.
export default function TeacherAddBirthdayPage() {
  const router = useRouter()
  const theme = THEMES.teacher
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetch('/api/teacher/auth/me')
      .then(async r => {
        if (!r.ok) { router.push('/teacher/login'); return }
        const data = await r.json()
        if (data.date_of_birth) { router.push('/teacher/set-gender'); return }
        setChecking(false)
      })
      .catch(() => router.push('/teacher/login'))
  }, [router])

  if (checking) return <FullPageLoader portal="teacher" message="One more thing…" />

  return (
    <AuthShell theme={theme} title="When's your birthday?" subtitle="We'll mark it on your profile with a little birthday note 🎂">
      <BirthdayField
        value={null}
        endpoint="/api/teacher/auth/date-of-birth"
        kind="adult"
        ring={theme.ring}
        accentGradient={theme.btnGradient}
        showSkip
        onSkip={() => router.push('/teacher/set-gender')}
        onSaved={() => router.push('/teacher/set-gender')}
      />
    </AuthShell>
  )
}
