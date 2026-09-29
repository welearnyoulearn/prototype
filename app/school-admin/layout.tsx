import IdleSessionGuard from './components/IdleSessionGuard'
import PlanNotice from '@/components/PlanNotice'

export default function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <IdleSessionGuard />
      <PlanNotice />
    </>
  )
}
