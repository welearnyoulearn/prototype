'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { FullPageLoader } from '@/components/loaders'
import NotificationBell from '../components/NotificationBell'
import { useUsageHeartbeat } from '@/lib/useUsageHeartbeat'
import { useFeatureTracking } from '@/lib/useFeatureTracking'
import { useSectionNav } from '@/lib/useSectionNav'
import { getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'
import { PORTAL_NAV_KEY_ALIASES } from '@/lib/features'
import PortalSidebar from '@/components/portal/PortalSidebar'
import { BookOpen, BookOpenText, CalendarDays, ChartNoAxesColumn, ClipboardCheck, Home, LogOut, Menu, MessagesSquare, Sparkles, UserRound } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// Always-loaded (landing tab, and small enough not to be worth its own chunk)
import StudentDashboard from './components/StudentDashboard'
import AttendanceCalendar from '../components/AttendanceCalendar'
import SchoolCalendarView from '../components/SchoolCalendarView'
import StudentProfile from './components/StudentProfile'

// Lazy-loaded — only downloaded when first opened
function ModuleSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <div><p className="student-eyebrow">Getting things ready</p><p className="mt-2 text-sm text-[#68736b]">Preparing this part of your workspace…</p></div>
      <Skeleton className="h-8 w-48 rounded-md" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
// Turbopack requires inline object literals for next/dynamic options
const StudentMarks     = dynamic(() => import('./components/StudentMarks'),     { loading: () => <ModuleSkeleton /> })
const StudentSyllabus  = dynamic(() => import('./components/StudentSyllabus'),  { loading: () => <ModuleSkeleton /> })
const DigitalLibrary    = dynamic(() => import('../components/library/DigitalLibrary'), { loading: () => <ModuleSkeleton /> })
const StudentAiHub      = dynamic(() => import('./components/StudentAiHub'),     { loading: () => <ModuleSkeleton /> })
const StudentClassCircle = dynamic(() => import('./components/StudentClassCircle'), { loading: () => <ModuleSkeleton /> })

type Student = {
  id: number; name: string; grade: string; section: string; roll_number: string
  email: string | null; phone: string | null; parent_name: string | null; parent_phone: string | null
  school_id: number; school_name: string; date_of_birth?: string | null
}

type NavItem    = { key: string; label: string; icon: React.ReactNode; comingSoon?: boolean }
type NavSection = { label: string; items: NavItem[] }

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'HOME',
    items: [
      { key: 'dashboard', label: 'Overview', icon: <Home size={18} /> },
      { key: 'syllabus', label: 'Syllabus', icon: <BookOpenText size={18} /> },
      { key: 'library', label: 'Digital library', icon: <BookOpen size={18} /> },
    ],
  },
  {
    label: 'LEARNING',
    items: [
      { key: 'class-circle', label: 'Class circle', icon: <MessagesSquare size={18} /> },
    ],
  },
  {
    label: 'ACADEMIC',
    items: [
      { key: 'my-marks', label: 'My marks', icon: <ChartNoAxesColumn size={18} /> },
      { key: 'attendance', label: 'My attendance', icon: <ClipboardCheck size={18} /> },
      { key: 'calendar', label: 'School calendar', icon: <CalendarDays size={18} /> },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { key: 'profile', label: 'My profile', icon: <UserRound size={18} /> },
    ],
  },
  {
    // Hidden entirely unless the school has been assigned AI Basic/AI Pro —
    // see isNavItemVisible('ai-hub') and the empty-section filter below.
    label: 'AI HUB',
    items: [
      { key: 'ai-hub', label: 'AI Hub', icon: <Sparkles size={18} /> },
    ],
  },
]

const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(s => s.items)

// Only nav keys that map to a plan-gated ALL_FEATURES entry get checked
// against enabledFeatures — everything else (dashboard, profile) has always
// been unconditionally available and stays that way. 'syllabus'/
// 'my-marks' resolves through PORTAL_NAV_KEY_ALIASES to its real
// ALL_FEATURES key ('exam-marks').
// 'attendance' has no dedicated nav item — it only gates the Dashboard's
// engagement-score ring, so isNavItemVisible('attendance') is read directly
// by StudentDashboard, not used for a sidebar entry.
const RESTRICTABLE_NAV_KEYS = new Set(['syllabus', 'library', 'my-marks', 'attendance', 'calendar'])

const BOTTOM_NAV = [
  { key: 'dashboard', label: 'Home', icon: <Home size={20} /> },
  { key: 'my-marks', label: 'Marks', icon: <ChartNoAxesColumn size={20} /> },
  { key: 'profile', label: 'Profile', icon: <UserRound size={20} /> },
]

function StudentPortal() {
  const router = useRouter()
  const [student,     setStudent]     = useState<Student | null>(null)
  const [classId,     setClassId]     = useState(0)
  const [academicYear, setAcademicYear] = useState('')
  // Sidebar section nav lives in the URL's `tab` param — real navigation, so
  // the browser/phone Back button moves through the portal's own screens.
  const { current: activeNav, navigate: navigateSection } = useSectionNav<string>('dashboard')
  const [visitedNav,  setVisitedNav]  = useState<Set<string>>(new Set([activeNav]))
  useEffect(() => {
    setVisitedNav(prev => (prev.has(activeNav) ? prev : new Set([...prev, activeNav])))
  }, [activeNav])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string> | null>(null)
  const [aiAccessTier, setAiAccessTier] = useState<'ai_basic' | 'ai_pro' | 'none' | null>(null)
  const logoutInFlight = useRef(false)

  // Filters out nav items gated by a plan feature the school doesn't have
  // enabled for this portal — null (still loading) means "show everything"
  // so the sidebar doesn't flash empty before the fetch resolves. AI Hub is
  // the opposite: unlike plan features (which default open), an unset AI
  // Access tier means the school never opted in, so it stays hidden while
  // loading and only appears once confirmed as ai_basic/ai_pro.
  function isNavItemVisible(key: string) {
    if (key === 'ai-hub') return aiAccessTier === 'ai_basic' || aiAccessTier === 'ai_pro'
    if (!RESTRICTABLE_NAV_KEYS.has(key)) return true
    if (enabledFeatures === null) return true
    return enabledFeatures.has(PORTAL_NAV_KEY_ALIASES[key] ?? key)
  }

  const trackOpen = useFeatureTracking('student')

  function navigateTo(key: string) {
    setSidebarOpen(false)
    navigateSection(key)
    trackOpen(key)
  }

  // Shared by the initial load and by the periodic revocation poll below —
  // both need identical "kicked out" behavior when the session is no longer
  // valid (either never was, or the school just disabled portal access).
  async function redirectToLogin(r: Response) {
    const data = await r.json().catch(() => null)
    const notice = data?.error === 'access_revoked' ? data.message : null
    router.replace(notice ? `/student/login?notice=${encodeURIComponent(notice)}` : '/student/login')
  }

  useEffect(() => {
    fetch('/api/student/auth/me')
      .then(async r => {
        if (r.status === 401) { await redirectToLogin(r); return }
        const data = await r.json()
        setStudent(data)
        fetch(`/api/school/enabled-features?school_id=${data.school_id}&portal=student`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.enabled) setEnabledFeatures(new Set<string>(d.enabled)) })
          .catch(() => {})
        fetch(`/api/schools/${data.school_id}/ai-access`)
          .then(r => r.ok ? r.json() : null)
          .then(d => setAiAccessTier((d?.tier as 'ai_basic' | 'ai_pro' | 'none') ?? 'none'))
          .catch(() => setAiAccessTier('none'))
        const classRes = await fetch(`/api/classes?school_id=${data.school_id}`)
        if (classRes.ok) {
          const classes = await classRes.json()
          const cls = (classes as { id: number; grade: string; section: string }[])
            .find(c => c.grade === data.grade && c.section === data.section)
          if (cls) setClassId(cls.id)
        }
        // Ambient "which year am I looking at" badge — one fetch, shown once
        // in the header, covers every tab (syllabus, marks, ...).
        fetch(`/api/academic-year/current?school_id=${data.school_id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.label) setAcademicYear(d.label) })
          .catch(() => {})
      })
      .catch(() => router.replace('/student/login'))
      .finally(() => setLoading(false))
  }, [router])

  // Catches a Student Portal Access toggle flipped off by the school while
  // this tab is already open and idle — otherwise the student wouldn't be
  // signed out until their next full page load. 60s matches the existing
  // usage heartbeat cadence; only runs once we actually have a student.
  useEffect(() => {
    if (!student) return
    const interval = setInterval(() => {
      fetch('/api/student/auth/me').then(r => { if (r.status === 401) redirectToLogin(r) }).catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [student]) // eslint-disable-line react-hooks/exhaustive-deps

  useUsageHeartbeat()

  async function handleLogout() {
    if (logoutInFlight.current) return
    logoutInFlight.current = true
    const usageSessionId = getUsageSessionId()
    await fetch('/api/student/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usageSessionId }),
    }).catch(() => {})
    clearUsageSessionId()
    router.replace('/student/login')
  }

  if (loading) return <FullPageLoader portal="student" sub="Fetching your courses and progress…" />

  if (!student) return null

  const firstName   = student.name.split(' ')[0]
  const currentItem = NAV_ITEMS.find(i => i.key === activeNav)

  return (
    <div className="portal-root" data-portal="student">
      <a href="#student-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      <header className="portal-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => setSidebarOpen(o => !o)} className="portal-icon-button lg:hidden" aria-label="Open navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="hidden sm:block text-sm font-semibold text-[#8b4a10]">Student workspace</span>
          <span className="hidden sm:block text-[#a5afa8]" aria-hidden="true">/</span>
          <span className="truncate text-sm font-medium text-[#202a25]">{currentItem?.label || 'Overview'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {academicYear && (
            <span data-testid="academic-year-badge" title="Active academic year — all data on this screen is scoped to this year" className="hidden items-center gap-1.5 text-xs text-[#647068] sm:inline-flex">
              <CalendarDays size={14} aria-hidden="true" /> {academicYear}
            </span>
          )}
          <NotificationBell studentId={student.id} onNavigate={navigateTo} />
          <button onClick={handleLogout} className="portal-icon-button text-[#647068] hover:text-red-700" aria-label="Sign out">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="portal-body">
        <PortalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} label="Student navigation" portal="student">
          <div className="portal-identity">
            <p className="text-base font-semibold tracking-tight text-[#713f0f]">WeLearnYouLearn</p>
            <p className="mt-1 text-xs leading-relaxed text-[#647068]">{student.school_name}</p>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Student sections">
            {NAV_SECTIONS.map(section => {
              const visibleItems = section.items.filter(item => isNavItemVisible(item.key))
              if (visibleItems.length === 0) return null
              return (
                <div key={section.label} className="mb-4">
                  <p className="portal-nav-label">{section.label}</p>
                  {visibleItems.map(item => (
                    <button key={item.key} onClick={() => { if (!item.comingSoon) navigateTo(item.key) }} className="portal-nav-item" aria-current={activeNav === item.key ? 'page' : undefined} disabled={item.comingSoon}>
                      <span className="shrink-0" aria-hidden="true">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {item.comingSoon && <span className="text-xs">Soon</span>}
                    </button>
                  ))}
                </div>
              )
            })}
          </nav>
          <div className="portal-account">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1e2ca] text-sm font-semibold text-[#713f0f]" aria-hidden="true">{firstName.charAt(0)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#202a25]">{student.name}</p>
                <p className="mt-0.5 text-xs text-[#647068]">Grade {student.grade} · Section {student.section}</p>
              </div>
            </div>
          </div>
        </PortalSidebar>

        {/* ── Main Content ──────────────────────────────────────────── */}
        <main id="student-content" tabIndex={-1} className="portal-main">
          <div className="mx-auto w-full max-w-5xl">
            {visitedNav.has('dashboard')   && <div hidden={activeNav !== 'dashboard'}><StudentDashboard student={student} classId={classId} schoolId={student.school_id} onNavigate={navigateTo} isNavItemVisible={isNavItemVisible} /></div>}
            {visitedNav.has('class-circle') && <div hidden={activeNav !== 'class-circle'}><StudentClassCircle /></div>}
            {visitedNav.has('attendance') && isNavItemVisible('attendance') && (
              <div hidden={activeNav !== 'attendance'}>
                <AttendanceCalendar endpoint="/api/student/attendance" who="student" />
              </div>
            )}
            {visitedNav.has('calendar') && isNavItemVisible('calendar') && (
              <div hidden={activeNav !== 'calendar'}>
                <SchoolCalendarView experience="student" />
              </div>
            )}
            {visitedNav.has('my-marks')    && <div hidden={activeNav !== 'my-marks'}><StudentMarks studentId={student.id} schoolId={student.school_id} classId={classId} /></div>}
            {visitedNav.has('syllabus') && isNavItemVisible('syllabus') && <div hidden={activeNav !== 'syllabus'}><StudentSyllabus schoolId={student.school_id} classId={classId} grade={student.grade} /></div>}
            {visitedNav.has('library') && isNavItemVisible('library') && <div hidden={activeNav !== 'library'}><DigitalLibrary apiUrl={`/api/school/library?school_id=${student.school_id}`} experience="student" /></div>}
            {visitedNav.has('profile')     && <div hidden={activeNav !== 'profile'}><StudentProfile student={student} /></div>}
            {visitedNav.has('ai-hub') && isNavItemVisible('ai-hub') && <div hidden={activeNav !== 'ai-hub'}><StudentAiHub tier={aiAccessTier} /></div>}
          </div>
        </main>
      </div>

      <nav className="shrink-0 border-t border-[#dde3dd] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Quick navigation">
        <div className="flex">
          {BOTTOM_NAV.filter(item => isNavItemVisible(item.key)).map(item => {
            const isActive = activeNav === item.key
            return (
              <button key={item.key} onClick={() => navigateTo(item.key)} aria-current={isActive ? 'page' : undefined}
                className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 border-t-2 text-xs font-medium transition-colors motion-reduce:transition-none ${isActive ? 'border-[#a85f16] bg-[#f7efe3] text-[#713f0f]' : 'border-transparent text-[#647068] hover:bg-[#f8f5ef]'}`}>
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

    </div>
  )
}

export default function StudentPortalPage() {
  return (
    <Suspense>
      <StudentPortal />
    </Suspense>
  )
}
