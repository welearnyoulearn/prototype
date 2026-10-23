import type { ReactNode } from 'react'
import PlanNotice from '@/components/PlanNotice'

export default function ParentLayout({ children }: { children: ReactNode }) {
  return <>{children}<PlanNotice /></>
}
