'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell, { THEMES } from '@/app/components/AuthShell'
import AvatarPicker, { type AvatarGender } from '@/app/components/AvatarPicker'
import { FullPageLoader } from '@/components/loaders'

// Last onboarding step, reached once right after set-gender. If the parent
// somehow lands here again with an avatar already set (back button,
// bookmark), it passes straight through to the portal instead of
// re-prompting — mirrors add-birthday/set-gender's own "already done" guards.
export default function ParentSetAvatarPage() {
  const router = useRouter()
  const theme = THEMES.parent
  const [checking, setChecking] = useState(true)
  const [gender, setGender] = useState<AvatarGender>(null)

  useEffect(() => {
    fetch('/api/parent/auth/me')
      .then(async r => {
        if (!r.ok) { router.push('/parent/login'); return }
        const data = await r.json()
        if (data.avatar_url) { router.push('/parent'); return }
        setGender(data.gender ?? null)
        setChecking(false)
      })
      .catch(() => router.push('/parent/login'))
  }, [router])

  if (checking) return <FullPageLoader portal="parent" message="Almost there…" />

  return (
    <AuthShell theme={theme} title="Pick your avatar" subtitle="Choose one of these, or upload your own photo. You can always change it later.">
      <AvatarPicker
        role="parent"
        gender={gender}
        value={null}
        accentColor={theme.color}
        showSkip
        onSkip={() => router.push('/parent')}
        onSaved={() => router.push('/parent')}
      />
    </AuthShell>
  )
}
