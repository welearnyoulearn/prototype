import IdleSessionGuard from './components/IdleSessionGuard'

export default function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <IdleSessionGuard />
    </>
  )
}
