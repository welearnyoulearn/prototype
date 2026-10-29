'use client'

import { THEMES } from '@/app/components/AuthShell'
import ForgotPasswordForm from '@/app/components/ForgotPasswordForm'

export default function ParentForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      theme={THEMES.parent}
      subtitle="Enter your email or mobile number and we'll send a reset link to your registered email"
      endpoint="/api/parent/auth/forgot-password"
      loginHref="/parent/login"
      fieldLabel="Registered Email or Mobile"
      placeholder="your@email.com or mobile number"
      autoComplete="username"
      notFoundNoun="email or mobile number"
    />
  )
}
