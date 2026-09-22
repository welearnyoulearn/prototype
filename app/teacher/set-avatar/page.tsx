'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES } from '@/app/components/AuthShell'
import AvatarPicker, { type AvatarGender } from '@/app/components/AvatarPicker'
import { FullPageLoader } from '@/components/loaders'

// Last onboarding step, reached once right after set-gender. If the teacher
// somehow lands here again with an avatar already set (back button,
// bookmark), it passes straight through to the portal instead of
// re-prompting — mirrors add-birthday/set-gender's own "already done" guards.
export default function TeacherSetAvatarPage() {
  const router = useRouter()
  const theme = THEMES.teacher
  const [checking, setChecking] = useState(true)
  const [gender, setGender] = useState<AvatarGender>(null)

  useEffect(() => {
    fetch('/api/teacher/auth/me')
      .then(async r => {
        if (!r.ok) { router.push('/teacher/login'); return }
        const data = await r.json()
        if (data.avatar_url) { router.push('/teacher'); return }
        setGender(data.gender ?? null)
        setChecking(false)
      })
      .catch(() => router.push('/teacher/login'))
  }, [router])

  if (checking) return <FullPageLoader portal="teacher" message="Almost there…" />

  return (
    <AuthShell theme={theme} title="Pick your avatar" subtitle="Choose one of these, or upload your own photo. You can always change it later.">
      <AvatarPicker
        role="teacher"
        gender={gender}
        value={null}
        accentColor={theme.color}
        showSkip
        onSkip={() => router.push('/teacher')}
        onSaved={() => router.push('/teacher')}
      />
    </AuthShell>
  )
}
