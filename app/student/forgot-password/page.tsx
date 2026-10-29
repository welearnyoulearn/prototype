'use client'

import { THEMES } from '@/app/components/AuthShell'
import ForgotPasswordForm from '@/app/components/ForgotPasswordForm'

export default function StudentForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      theme={THEMES.student}
      subtitle="Enter your Student ID, email or mobile number and we'll send a reset link to your registered email"
      endpoint="/api/student/auth/forgot-password"
      loginHref="/student/login"
      fieldLabel="Student ID, email or mobile"
      placeholder="WLYL-K7M2P9XQ, email or mobile number"
      autoComplete="username"
      notFoundNoun="Student ID, email or mobile number"
    />
  )
}
