'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { THEMES } from '@/app/components/AuthShell'
import ForgotPasswordForm from '@/app/components/ForgotPasswordForm'

// Shared by school admin and platform admin; ?role=platform picks the platform look.
function StaffForgotPassword() {
  const isPlatform = useSearchParams().get('role') === 'platform'
  return (
    <ForgotPasswordForm
      theme={isPlatform ? THEMES.platform : THEMES.admin}
      subtitle="We'll send a reset link to your registered email"
      endpoint="/api/auth/forgot-password"
      loginHref={isPlatform ? '/login?role=platform' : '/login'}
      fieldLabel="School ID or Email"
      placeholder="wlyl-schl-... or admin@email.com"
      notFoundNoun="School ID or email"
    />
  )
}

export default function ForgotPasswordPage() {
  return <Suspense fallback={null}><StaffForgotPassword /></Suspense>
}
