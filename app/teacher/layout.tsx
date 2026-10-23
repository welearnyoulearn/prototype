import type { ReactNode } from 'react'
import PlanNotice from '@/components/PlanNotice'

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <>{children}<PlanNotice /></>
}
