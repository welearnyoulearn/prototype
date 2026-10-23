import PortalLanding from './components/PortalLanding'
import CloudflareWebAnalytics from '@/components/CloudflareWebAnalytics'
import { legalInfo } from '@/lib/legalInfo'

export default function Home() {
  const { legalName, email, phone } = legalInfo()
  return (
    <>
      <PortalLanding operator={{ legalName, email, phone }} />
      <CloudflareWebAnalytics />
    </>
  )
}
