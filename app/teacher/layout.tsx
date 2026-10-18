import type { ReactNode } from 'react'
import PlanNotice from '@/components/PlanNotice'
import IdleSessionGuard from '@/app/school-admin/components/IdleSessionGuard'

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <>{children}<PlanNotice /><IdleSessionGuard loginHref="/teacher/login" /></>
}
