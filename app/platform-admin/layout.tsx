import PlatformAdminShell from './components/PlatformAdminShell'

export const dynamic = 'force-dynamic'

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlatformAdminShell>{children}</PlatformAdminShell>
}
