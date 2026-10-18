import type { ReactNode } from 'react'
import PlanNotice from '@/components/PlanNotice'
import IdleSessionGuard from '@/app/school-admin/components/IdleSessionGuard'

export default function ParentLayout({ children }: { children: ReactNode }) {
  return <>{children}<PlanNotice /><IdleSessionGuard loginHref="/parent/login" /></>
}
