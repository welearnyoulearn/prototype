'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Library, School, Settings2, ChartNoAxesCombined, Activity, ClipboardList, LogOut, Menu } from 'lucide-react'
import PortalSidebar from '@/components/portal/PortalSidebar'
import { getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'

const NAV_SECTIONS = [
  { label: 'Workspace', items: [
    { key: 'schools', label: 'Schools', href: '/platform-admin', icon: School },
  ] },
  { label: 'Content', items: [
    { key: 'curriculum', label: 'Master Syllabus', href: '/platform-admin/curriculum', icon: BookOpen },
    { key: 'library', label: 'Digital Library', href: '/platform-admin/library', icon: Library },
  ] },
  { label: 'Configuration', items: [
    { key: 'features', label: 'Feature Plans', href: '/platform-admin/features', icon: Settings2 },
  ] },
  { label: 'Monitoring', items: [
    { key: 'usage-analytics', label: 'Usage Analytics', href: '/platform-admin/usage-analytics', icon: ChartNoAxesCombined },
    { key: 'logs', label: 'Watchline', href: '/platform-admin/logs', icon: Activity },
    { key: 'audit', label: 'Audit Log', href: '/platform-admin/audit', icon: ClipboardList },
  ] },
]

export default function PlatformAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    const usageSessionId = getUsageSessionId()
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usageSessionId }),
    })
    clearUsageSessionId()
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/platform-admin') return pathname === '/platform-admin'
    return pathname?.startsWith(href) ?? false
  }

  return (
    <div className="portal-root" data-portal="platform-admin">
      <a href="#portal-main" className="portal-skip-link">Skip to content</a>
      <header className="portal-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open platform navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen} className="portal-icon-button lg:hidden">
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold tracking-tight">WeLearnYouLearn</span>
          <span className="hidden border-l border-[#dce2db] pl-3 text-xs text-[#67736b] sm:inline">Platform workspace</span>
        </div>
        <button onClick={handleLogout} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-[#67736b] transition-colors hover:bg-[#f1f3ee] hover:text-[#a33131]">
          <LogOut size={16} aria-hidden="true" /><span>Sign out</span>
        </button>
      </header>
      <div className="portal-body">
        <PortalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} label="Platform navigation" portal="platform-admin">
          <div className="portal-identity flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#235b46] font-semibold text-white" aria-hidden="true">W</div>
            <div className="min-w-0"><p className="text-sm font-semibold">Platform admin</p><p className="mt-0.5 text-xs text-[#67736b]">School operations</p></div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Platform sections">
            {NAV_SECTIONS.map(section => (
              <div key={section.label} className="mb-4">
                <p className="portal-nav-label">{section.label}</p>
                {section.items.map(item => {
                  const Icon = item.icon
                  return <Link key={item.key} href={item.href} onClick={() => setSidebarOpen(false)} aria-current={isActive(item.href) ? 'page' : undefined} className="portal-nav-item">
                    <Icon size={17} strokeWidth={1.7} aria-hidden="true" /><span>{item.label}</span>
                  </Link>
                })}
              </div>
            ))}
          </nav>
          <div className="portal-account"><p className="text-xs text-[#67736b]">WeLearnYouLearn</p></div>
        </PortalSidebar>
        <main id="portal-main" className="portal-main !p-0" tabIndex={-1}>{children}</main>
      </div>
    </div>
  )
}
