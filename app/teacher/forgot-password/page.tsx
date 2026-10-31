'use client'

import { THEMES } from '@/app/components/AuthShell'
import ForgotPasswordForm from '@/app/components/ForgotPasswordForm'

export default function TeacherForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      theme={THEMES.teacher}
      subtitle="We'll send a reset link to your registered email"
      endpoint="/api/teacher/auth/forgot-password"
      loginHref="/teacher/login"
      fieldLabel="Registered Email"
      placeholder="your.email@school.edu"
      inputType="email"
      autoComplete="email"
      notFoundNoun="email"
    />
  )
}
