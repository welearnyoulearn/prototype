'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'

type NavItem = { key: string; label: string; href: string; icon: string; badge?: 'live' | 'pulse' }
type NavSection = { label: string; items: NavItem[] }

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'OVERVIEW',
    items: [
      { key: 'schools', label: 'Schools', href: '/platform-admin', icon: '🏫' },
    ],
  },
  {
    label: 'CONTENT',
    items: [
      { key: 'curriculum', label: 'Master Syllabus', href: '/platform-admin/curriculum', icon: '📚' },
      { key: 'library', label: 'Digital Library', href: '/platform-admin/library', icon: '📖' },
    ],
  },
  {
    label: 'CONFIGURATION',
    items: [
      { key: 'features', label: 'Feature Plans', href: '/platform-admin/features', icon: '⚙️' },
    ],
  },
  {
    label: 'MONITORING',
    items: [
      { key: 'usage-analytics', label: 'Usage Analytics', href: '/platform-admin/usage-analytics', icon: '📊', badge: 'pulse' },
      { key: 'logs', label: 'Watchline', href: '/platform-admin/logs', icon: '👁️', badge: 'live' },
      { key: 'audit', label: 'Audit Log', href: '/platform-admin/audit', icon: '📋' },
    ],
  },
]

// Wraps every /platform-admin/* page with a persistent left sidebar — same
// visual language as the school-admin/teacher/student/parent shells (dark
// sidebar, grouped sections, active-state highlight). Replaces the old
// pattern of every page building its own scattered top-bar link list, which
// kept growing ad hoc as features were added (Digital Library, Usage
// Analytics, Watchline all landed as one more button rather than a nav
// entry). Each page keeps whatever page-local header/breadcrumb it already
// had — this only owns primary cross-page navigation, not page content.
export default function PlatformAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

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
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      {/* Sidebar — its own scroll container, pinned to the viewport height so
          scrolling long page content (e.g. the Schools table) never drags the
          sidebar along with it. */}
      <aside className="w-56 h-full bg-slate-900 flex-shrink-0 flex flex-col shadow-xl overflow-hidden">
        <div className="px-4 py-4 flex items-center gap-2 border-b border-slate-800 flex-shrink-0">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">W</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight truncate">WLYL</p>
            <p className="text-slate-400 text-[10px] mt-0.5">Platform Admin</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 overflow-y-auto min-h-0">
          {NAV_SECTIONS.map(section => (
            <div key={section.label} className="mb-1">
              <p className="px-3 pt-4 pb-1 text-[9px] font-bold text-slate-600 uppercase tracking-[0.15em]">
                {section.label}
              </p>
              {section.items.map(item => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm mb-0.5 transition-all duration-200 ease-out ${
                      active
                        ? 'bg-purple-600 text-white font-semibold shadow-lg shadow-purple-900/40'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
                    }`}
                  >
                    <span className="text-base leading-none w-5 flex-shrink-0 text-center">{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />}
                    {item.badge === 'pulse' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-slate-800 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all text-sm"
          >
            <span className="text-base leading-none w-5 text-center">👋</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Page content — scrolls independently of the sidebar */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  )
}
