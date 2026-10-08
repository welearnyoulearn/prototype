'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion, MotionConfig } from 'framer-motion'
import { FeaturesProvider } from '@/lib/features-context'
import NotificationBell from '../components/NotificationBell'
import CommandBar from './components/CommandBar'
import { useRouter } from 'next/navigation'
import { FullPageLoader } from '@/components/loaders'
import { useUsageHeartbeat } from '@/lib/useUsageHeartbeat'
import { useFeatureTracking } from '@/lib/useFeatureTracking'
import { useSectionNav } from '@/lib/useSectionNav'
import { getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'
import { ALL_FEATURES, PORTAL_NAV_KEY_ALIASES } from '@/lib/features'
import PortalSidebar from '@/components/portal/PortalSidebar'
import { Skeleton } from '@/components/ui/skeleton'

// Always-loaded (small, needed immediately)
import { Building2, CalendarDays, ClipboardCheck, Download, GraduationCap, LayoutDashboard, Library, ListChecks, Megaphone, MessageSquareText, NotebookPen, Receipt, RefreshCcw, School, SlidersHorizontal, Users, Wallet } from 'lucide-react'
import Overview from './components/Overview'
import StaffProfile from './components/StaffProfile'

// Lazy-loaded — only downloaded when first opened
function ModuleSkeleton() {
  return (
    <div role="status" aria-label="Loading section" className="space-y-5">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-56" />
    </div>
  )
}
// Turbopack requires inline object literals for next/dynamic options
const AttendanceDashboard   = dynamic(() => import('./components/AttendanceDashboard'),   { loading: () => <ModuleSkeleton /> })
const AcademicCalendar      = dynamic(() => import('./components/AcademicCalendar'),      { loading: () => <ModuleSkeleton /> })
const StaffOnboarding       = dynamic(() => import('./components/StaffOnboarding'),        { loading: () => <ModuleSkeleton /> })
const StudentOnboarding     = dynamic(() => import('./components/StudentOnboarding'),      { loading: () => <ModuleSkeleton /> })
const ClassManagement       = dynamic(() => import('./components/ClassManagement'),        { loading: () => <ModuleSkeleton /> })
const CurriculumCustomizer   = dynamic(() => import('./components/CurriculumCustomizer'),   { loading: () => <ModuleSkeleton /> })
const DigitalLibrary         = dynamic(() => import('@/app/components/library/DigitalLibrary'), { loading: () => <ModuleSkeleton /> })
const AcademicAnalytics      = dynamic(() => import('./components/AcademicAnalytics'),      { loading: () => <ModuleSkeleton /> })
const ExamSchedule          = dynamic(() => import('./components/ExamSchedule'),           { loading: () => <ModuleSkeleton /> })
const TeachersManagement    = dynamic(() => import('./components/TeachersManagement'),     { loading: () => <ModuleSkeleton /> })
const StudentsManagement    = dynamic(() => import('./components/StudentsManagement'),     { loading: () => <ModuleSkeleton /> })
const AnnouncementBoard     = dynamic(() => import('./components/AnnouncementBoard'),      { loading: () => <ModuleSkeleton /> })
const FeedbackManagement    = dynamic(() => import('./components/FeedbackManagement'),      { loading: () => <ModuleSkeleton /> })
const ExportCenter          = dynamic(() => import('./components/ExportCenter'),           { loading: () => <ModuleSkeleton /> })
const SchoolSettings        = dynamic(() => import('./components/SchoolSettings'),         { loading: () => <ModuleSkeleton /> })
const FeeManagement         = dynamic(() => import('./components/FeeManagement'),          { loading: () => <ModuleSkeleton /> })
const ExpenseManagement     = dynamic(() => import('./components/ExpenseManagement'),      { loading: () => <ModuleSkeleton /> })
const YearRollover          = dynamic(() => import('./components/YearRollover'),           { loading: () => <ModuleSkeleton /> })

type School = {
  id: number
  name: string
  type: string
  city: string
  country: string
  status: string
  logo_url?: string | null
  logo_align?: 'left' | 'center' | 'right' | null
  receipt_header_blocks?: { text: string; size: 'sm' | 'md' | 'lg' | 'xl'; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right' }[]
}

type Tier = 'none' | 'basic' | 'standard' | 'premium'

type NavItem = {
  key: string
  label: string
  icon: React.ReactNode
  tier?: Tier[]  // kept for reference only — actual visibility driven by platform feature config
}

// Section grouping for sidebar — Management first, then Scheduling
const NAV_SECTIONS = [
  { label: 'OVERVIEW',      keys: ['overview'] },
  { label: 'PEOPLE',        keys: ['staff', 'students', 'class-management'] },
  { label: 'MONEY MANAGEMENT', keys: ['fee-management', 'expenses'] },
  { label: 'SCHEDULING',    keys: ['curriculum', 'library', 'attendance', 'academic-calendar', 'exam-schedule'] },
  { label: 'COMMUNICATION', keys: ['announcements', 'feedback-management'] },
  { label: 'TOOLS',         keys: ['export', 'settings', 'year-rollover'] },
]

type NavOrder = { sections: string[]; items: Record<string, string[]> }
const NAV_ORDER_KEY = 'wlyl_sa_nav_order'
const NAV_RECENT_KEY = 'wlyl_sa_nav_recent'
const NAV_RECENT_MAX = 3

// Saved order first (in saved sequence); anything new or unsaved keeps its default position at the end.
function applyOrder<T>(defaults: T[], saved: string[] | undefined, keyOf: (t: T) => string): T[] {
  if (!saved || saved.length === 0) return defaults
  const rank = (t: T) => { const i = saved.indexOf(keyOf(t)); return i === -1 ? saved.length + defaults.indexOf(t) : i }
  return [...defaults].sort((a, b) => rank(a) - rank(b))
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}

function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

function MoveButtons({ label, testId, canUp, canDown, onMove }: {
  label: string
  testId: string
  canUp: boolean
  canDown: boolean
  onMove: (dir: -1 | 1) => void
}) {
  const cls = 'w-7 h-7 flex items-center justify-center rounded text-[#3b4a40] hover:bg-[#cfdcd2] disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#235b46]'
  return (
    <span className="flex flex-shrink-0">
      <button type="button" className={cls} disabled={!canUp} onClick={() => onMove(-1)} aria-label={`Move ${label} up`} data-testid={`${testId}-up`}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
      </button>
      <button type="button" className={cls} disabled={!canDown} onClick={() => onMove(1)} aria-label={`Move ${label} down`} data-testid={`${testId}-down`}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      </button>
    </span>
  )
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'overview',
    label: 'Overview',
    tier: ['basic', 'standard', 'premium'],
    icon: (<LayoutDashboard className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'attendance',
    label: 'Attendance',
    tier: ['basic', 'standard', 'premium'],
    icon: (<ClipboardCheck className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'academic-calendar',
    label: 'Academic Calendar',
    tier: ['basic', 'standard', 'premium'],
    icon: (<CalendarDays className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'class-management',
    label: 'Class Management',
    tier: ['basic', 'standard', 'premium'],
    icon: (<School className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'staff',
    label: 'Staff Management',
    tier: ['basic', 'standard', 'premium'],
    icon: (<Users className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'curriculum',
    label: 'Syllabus Customizer',
    tier: ['basic', 'standard', 'premium'],
    icon: (<SlidersHorizontal className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'library',
    label: 'Digital Library',
    tier: ['basic', 'standard', 'premium'],
    icon: (<Library className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'syllabus-tracking',
    label: 'Syllabus Tracking',
    tier: ['basic', 'standard', 'premium'],
    icon: (<ListChecks className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'exam-schedule',
    label: 'Exam Schedule',
    tier: ['basic', 'standard', 'premium'],
    icon: (<NotebookPen className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'students',
    label: 'Student Management',
    tier: ['basic', 'standard', 'premium'],
    icon: (<GraduationCap className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'announcements',
    label: 'Announcements',
    tier: ['basic', 'standard', 'premium'],
    icon: (<Megaphone className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'feedback-management',
    label: 'Feedback',
    tier: ['basic', 'standard', 'premium'],
    icon: (<MessageSquareText className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'export',
    label: 'Export Data',
    tier: ['basic', 'standard', 'premium'],
    icon: (<Download className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'settings',
    label: 'School Profile',
    tier: ['basic', 'standard', 'premium'],
    icon: (<Building2 className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'fee-management',
    label: 'Fee Management',
    tier: ['basic', 'standard', 'premium'],
    icon: (<Wallet className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'expenses',
    label: 'Expenses',
    tier: ['basic', 'standard', 'premium'],
    icon: (<Receipt className="w-4 h-4" aria-hidden="true" />),
  },
  {
    key: 'year-rollover',
    label: 'Year Rollover',
    tier: ['basic', 'standard', 'premium'],
    icon: (<RefreshCcw className="w-4 h-4" aria-hidden="true" />),
  },
]


function SchoolAdmin() {
  const router = useRouter()
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [academicYear, setAcademicYear] = useState('')
  const [tier, setTier] = useState<Tier>('none')
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set())
  // Sidebar section nav lives in the URL's `tab` param — real navigation, so
  // the browser/phone Back button moves through the portal's own screens.
  const { current: requestedNav, navigate: navigateSection, reset: resetSection } = useSectionNav<string>('overview')
  const [visited, setVisited] = useState<Set<string>>(new Set([requestedNav]))
  // Onboarding panels mount on first open of their sub-tab (then stay mounted to keep form state).
  const [onboardOpened, setOnboardOpened] = useState<{ staff: boolean; students: boolean }>({ staff: false, students: false })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [navQuery, setNavQuery] = useState('')
  // Sidebar only renders after the school loads client-side, so reading storage here is hydration-safe
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('wlyl_sa_nav_collapsed') : null
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch { return new Set() }
  })
  const toggleSection = (label: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      try { localStorage.setItem('wlyl_sa_nav_collapsed', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  const [arranging, setArranging] = useState(false)
  const [navOrder, setNavOrder] = useState<NavOrder>(() => {
    const saved = readStored<NavOrder>(NAV_ORDER_KEY, { sections: [], items: {} })
    // 'MANAGEMENT' section was renamed 'MONEY MANAGEMENT' — carry any saved order over
    const items = { ...saved.items }
    if (items['MANAGEMENT']) { items['MONEY MANAGEMENT'] = items['MANAGEMENT']; delete items['MANAGEMENT'] }
    return { sections: saved.sections.map(l => (l === 'MANAGEMENT' ? 'MONEY MANAGEMENT' : l)), items }
  })
  const [recentNav, setRecentNav] = useState<string[]>(() => readStored<string[]>(NAV_RECENT_KEY, []))
  const saveNavOrder = (next: NavOrder) => { setNavOrder(next); writeStored(NAV_ORDER_KEY, next) }
  const resetNavOrder = () => saveNavOrder({ sections: [], items: {} })
  const moveInList = (list: string[], key: string, dir: -1 | 1) => {
    const i = list.indexOf(key), j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return list
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]
    return next
  }
  const moveSection = (visible: string[], label: string, dir: -1 | 1) =>
    saveNavOrder({ ...navOrder, sections: moveInList(visible, label, dir) })
  const moveItem = (sectionLabel: string, visible: string[], key: string, dir: -1 | 1) =>
    saveNavOrder({ ...navOrder, items: { ...navOrder.items, [sectionLabel]: moveInList(visible, key, dir) } })

  const [myRole, setMyRole] = useState<string>('school_admin')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [staffSubTab, setStaffSubTab] = useState<'directory' | 'onboard'>('directory')
  const [studentsSubTab, setStudentsSubTab] = useState<'list' | 'onboard'>('list')
  const [staffRefreshKey, setStaffRefreshKey] = useState(0)
  const [studentRefreshKey, setStudentRefreshKey] = useState(0)

  const requestedFeatureKey = PORTAL_NAV_KEY_ALIASES[requestedNav] ?? requestedNav
  const requestedFeature = ALL_FEATURES.find(feature => feature.key === requestedFeatureKey)
  const requestedAllowed = requestedNav === 'profile'
    ? myRole === 'principal' || myRole === 'vice_principal'
    : enabledFeatures.has(requestedFeatureKey) && (!requestedFeature || requestedFeature.portals.includes('school-admin'))
  const fallbackNav = NAV_ITEMS.find(item => {
    const key = PORTAL_NAV_KEY_ALIASES[item.key] ?? item.key
    const feature = ALL_FEATURES.find(candidate => candidate.key === key)
    return enabledFeatures.has(key) && (!feature || feature.portals.includes('school-admin'))
  })?.key ?? 'overview'
  const activeNav = loading || tier === 'none' || requestedAllowed ? requestedNav : fallbackNav

  useEffect(() => {
    // Persist already-opened lazy modules so tab state survives portal navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisited(prev => (prev.has(activeNav) ? prev : new Set([...prev, activeNav])))
  }, [activeNav])
  useEffect(() => {
    if (!loading && tier !== 'none' && activeNav !== requestedNav) resetSection(activeNav)
  }, [activeNav, loading, requestedNav, resetSection, tier])

  const trackOpen = useFeatureTracking('school-admin')

  // `subTab` lets a caller land directly on a specific sub-tab (e.g. Class
  // Management's "Add Student" jumping straight to Students > Onboard
  // instead of the default List) — optional, existing callers that only
  // pass `key` keep the previous always-reset-to-default behavior.
  const navigateTo = useCallback((key: string, subTab?: string) => {
    setSidebarOpen(false)
    if (key === 'staff') setStaffSubTab((subTab as 'directory' | 'onboard') || 'directory')
    if (key === 'students') setStudentsSubTab((subTab as 'list' | 'onboard') || 'list')
    navigateSection(key)
    trackOpen(key)
    if (key !== 'overview' && key !== 'profile') {
      setRecentNav(prev => {
        const next = [key, ...prev.filter(k => k !== key)].slice(0, NAV_RECENT_MAX + 1)
        writeStored(NAV_RECENT_KEY, next)
        return next
      })
    }
  }, [navigateSection, trackOpen])

  useUsageHeartbeat()

  async function handleLogout() {
    const usageSessionId = getUsageSessionId()
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usageSessionId }),
    })
    clearUsageSessionId()
    router.replace('/login')
  }

  useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch('/api/auth/me')
        if (!meRes.ok) { router.replace('/login?role=school'); return }
        const me = await meRes.json()
        const schoolRoles = ['school_admin', 'principal', 'vice_principal']
        if (!schoolRoles.includes(me.role) || !me.school_id) { router.replace('/login?role=school'); return }
        setMyRole(me.role)

        // School and subscription both depend only on me.school_id, not on each
        // other — fire them together so the dashboard waits one round-trip
        // instead of two. allSettled (not all) so one failing fetch doesn't
        // reject the other's handling: the school fetch still falls back below
        // and the subscription still degrades to tier 'none'.
        const [schoolSettled, subSettled] = await Promise.allSettled([
          fetch(`/api/schools/${me.school_id}`),
          fetch(`/api/schools/${me.school_id}/subscription`),
        ])

        if (schoolSettled.status === 'rejected') throw schoolSettled.reason
        const schoolRes = schoolSettled.value
        const school = schoolRes.ok
          ? await schoolRes.json()
          : { id: me.school_id, name: me.school_name, type: '', city: '', country: '', status: 'active' }
        setSelectedSchool(school)

        // Ambient "which year am I looking at" badge — every feature already
        // scopes its own data to the active academic year server-side, but
        // used to give no visible signal when that year is wrong (silently
        // empty screens). One fetch here, shown once in the header, covers
        // every tab instead of adding it to each one individually.
        fetch(`/api/academic-year/current?school_id=${school.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.label) setAcademicYear(d.label) })
          .catch(() => {})

        // Load subscription + features before showing UI — prevents "No Plan Assigned" flash
        try {
          if (subSettled.status === 'rejected') throw subSettled.reason
          const subData = await subSettled.value.json()
          const t: Tier = subData.tier || 'none'
          setTier(t)
          if (t !== 'none') {
            const featRes = await fetch(`/api/school/enabled-features?school_id=${school.id}&portal=school-admin`, { cache: 'no-store' })
            if (!featRes.ok) throw new Error('Failed to load feature access')
            const fd = await featRes.json()
            setEnabledFeatures(new Set(fd.enabled || []))
          } else setEnabledFeatures(new Set())
        } catch {
          setTier('none')
        }
      } catch {
        setError('Cannot connect to database. Make sure PostgreSQL is running.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  const isStaffAccount = myRole === 'principal' || myRole === 'vice_principal'

  // Only show nav items that are enabled in platform feature config for this tier
  // Staff accounts (principal/vice_principal) don't see Settings — they get a Profile page instead.
  // Syllabus Tracking isn't its own togglable feature — it's not a separate
  // thing a plan can include/exclude on its own, it's just the reporting view
  // over whatever a school already subscribed to via Syllabus Customizer. It
  // rides on 'curriculum's enablement instead of a 'syllabus-tracking' key
  // (which was never in ALL_FEATURES / plan_features, so checking it directly
  // here would have made this tab permanently invisible to every school).
  // A feature can be entitled without belonging in School Admin's own sidebar
  // at all — e.g. a student/parent-only feature whose ALL_FEATURES entry
  // doesn't list 'school-admin' in `portals`. Items with no ALL_FEATURES
  // entry (legacy keys not yet migrated into the catalog) default to visible
  // so nothing existing silently disappears.
  const isSchoolAdminScoped = (key: string) => {
    const featureKey = PORTAL_NAV_KEY_ALIASES[key] ?? key
    const feature = ALL_FEATURES.find(f => f.key === featureKey)
    return !feature || feature.portals.includes('school-admin')
  }

  const navEnabled = (key: string) => enabledFeatures.has(PORTAL_NAV_KEY_ALIASES[key] ?? key)

  const enabledNavItems = NAV_ITEMS.filter(item =>
    tier !== 'none' &&
    navEnabled(item.key) &&
    isSchoolAdminScoped(item.key) &&
    !(isStaffAccount && item.key === 'settings')
  )

  if (loading) return <FullPageLoader portal="school-admin" sub="Setting up your school workspace…" />

  return (
    <MotionConfig reducedMotion="user">
    <div className="portal-root" data-portal="school-admin">
      <a href="#portal-main" className="portal-skip-link">Skip to content</a>
      {/* Top bar */}
      <header className="portal-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => setSidebarOpen(o => !o)} aria-label="Open school navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen} className="portal-icon-button lg:hidden">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </motion.button>
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm hidden sm:inline">← Home</Link>
          <span className="text-gray-200 hidden sm:inline">|</span>

          {/* School name */}
          {selectedSchool && (
            <div className="min-w-0 text-sm font-semibold text-[#202a25]">
              <span className="block truncate">{selectedSchool.name}</span>
            </div>
          )}

          {/* Active academic year — ambient, visible on every tab */}
          {academicYear && (
            <span
              data-testid="academic-year-badge"
              title="Active academic year — all data on this screen is scoped to this year"
              className="hidden xl:inline-flex whitespace-nowrap border-l border-[#dce2db] pl-3 text-xs text-[#67736b]"
            >
              {academicYear}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {tier !== 'none' && (
            <span className="hidden xl:inline-flex px-2 text-xs text-[#67736b] capitalize">
              {tier} plan
            </span>
          )}
          {selectedSchool && (
            <>
              <NotificationBell schoolId={selectedSchool.id} onNavigate={navigateSection} />
              <CommandBar schoolId={selectedSchool.id} onNavigate={navigateTo} />
            </>
          )}
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }); window.dispatchEvent(e) }}
            className="hidden md:flex items-center gap-2 text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
            <kbd className="text-[10px] bg-gray-100 px-1 rounded font-mono">Ctrl K</kbd>
          </motion.button>
          <span className="hidden xl:inline-flex text-xs font-medium px-3 text-[#67736b]">
            {myRole === 'principal' ? 'Principal' : myRole === 'vice_principal' ? 'Vice Principal' : 'School Admin'}
          </span>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleLogout}
            className="min-h-10 text-sm text-gray-600 hover:text-red-700 px-3 rounded-md transition-colors">
            Logout
          </motion.button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-6 py-3 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="portal-icon-button text-red-700 ml-4">✕</button>
        </div>
      )}

      {!selectedSchool ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-400 text-lg">No active schools available.</p>
            <p className="text-gray-300 text-sm mt-2">Go to Platform Admin to create and activate a school first.</p>
            <Link href="/platform-admin" className="inline-block mt-4 bg-[#235b46] text-white px-4 py-2 rounded-lg text-sm font-medium">
              Go to Platform Admin
            </Link>
          </div>
        </div>
      ) : (
        <div className="portal-body">
          {/* Sidebar */}
          <PortalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} label="School navigation" portal="school-admin">
            {/* School branding */}
            <div className="portal-identity">
              <div className="flex items-center gap-3">
                {selectedSchool.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedSchool.logo_url}
                    alt={selectedSchool.name}
                    className="w-9 h-9 rounded-md object-cover flex-shrink-0 shadow-lg bg-white"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-[#235b46] flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
                    {selectedSchool.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight truncate" title={selectedSchool.name}>{selectedSchool.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{[selectedSchool.city, selectedSchool.country].filter(Boolean).join(', ') || selectedSchool.type || 'School'}</p>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 min-h-0 px-3 py-3 overflow-y-auto" aria-label="School sections">
              {tier === 'none' ? (
                <div className="px-4 py-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <div>
                      <p className="text-xs text-foreground font-medium">No plan assigned</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Contact WLYL Admin to activate a plan for your school.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-1 pt-1 pb-2">
                    <input
                      type="search"
                      value={navQuery}
                      onChange={e => setNavQuery(e.target.value)}
                      placeholder="Search menu…"
                      aria-label="Search menu"
                      data-testid="nav-search"
                      className="w-full h-9 px-3 rounded-lg border border-[#dce2db] bg-white text-[13px] text-[#3b4a40] placeholder:text-[#7a867e] focus-visible:outline-2 focus-visible:outline-[#235b46]"
                    />
                  </div>
                  {navQuery.trim() && !enabledNavItems.some(i => i.label.toLowerCase().includes(navQuery.trim().toLowerCase())) && (
                    <p className="px-3 py-2 text-xs text-[#55635a]" data-testid="nav-search-empty">No menu items match “{navQuery.trim()}”.</p>
                  )}
                  {!navQuery.trim() && !arranging && (() => {
                    const recent = recentNav
                      .filter(k => k !== activeNav)
                      .map(k => enabledNavItems.find(i => i.key === k))
                      .filter((i): i is NavItem => i !== undefined)
                      .slice(0, NAV_RECENT_MAX)
                    if (recent.length === 0) return null
                    return (
                      <div className="px-1 pb-1" data-testid="nav-recent">
                        <p className="portal-nav-label !pt-1">Recent</p>
                        <div className="flex flex-wrap gap-1.5 px-2">
                          {recent.map(item => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => navigateTo(item.key)}
                              data-testid={`nav-recent-${item.key}`}
                              className="px-2.5 py-1 rounded-full border border-[#dce2db] bg-white text-xs text-[#3b4a40] hover:bg-[#e3ece4] focus-visible:outline-2 focus-visible:outline-[#235b46]"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                  {(() => {
                    const q = navQuery.trim().toLowerCase()
                    const visibleSections = applyOrder(
                      NAV_SECTIONS.filter(sec => sec.keys.some(k => enabledNavItems.some(i => i.key === k))),
                      navOrder.sections,
                      sec => sec.label,
                    )
                    const visibleLabels = visibleSections.map(sec => sec.label)
                    return visibleSections.map((section, sIdx) => {
                      const orderedKeys = applyOrder(
                        section.keys.filter(k => enabledNavItems.some(i => i.key === k)),
                        navOrder.items[section.label],
                        k => k,
                      )
                      const sectionEnabled = orderedKeys
                        .map(key => enabledNavItems.find(i => i.key === key))
                        .filter((i): i is NavItem => i !== undefined)
                        .filter(i => !q || i.label.toLowerCase().includes(q))
                      if (sectionEnabled.length === 0) return null
                      const collapsed = !q && !arranging && collapsedSections.has(section.label)
                      return (
                        <div key={section.label} className="mb-1">
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => toggleSection(section.label)}
                              aria-expanded={!collapsed}
                              data-testid={`nav-section-${section.label.toLowerCase()}`}
                              className="portal-nav-label flex-1 flex items-center justify-between text-left rounded hover:text-[#235b46] focus-visible:outline-2 focus-visible:outline-[#235b46]"
                            >
                              <span>{section.label}</span>
                              <svg className={`w-3 h-3 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {arranging && (
                              <span className="flex pt-3 pl-1">
                                <MoveButtons
                                  label={`${section.label} section`}
                                  testId={`nav-move-section-${section.label.toLowerCase()}`}
                                  canUp={sIdx > 0}
                                  canDown={sIdx < visibleLabels.length - 1}
                                  onMove={dir => moveSection(visibleLabels, section.label, dir)}
                                />
                              </span>
                            )}
                          </div>
                          {!collapsed && sectionEnabled.map((item, iIdx) => {
                            const isActive = activeNav === item.key
                            if (arranging) {
                              return (
                                <div key={item.key} className="portal-nav-item cursor-default" data-testid={`nav-arrange-${item.key}`}>
                                  <span className="relative flex-shrink-0">{item.icon}</span>
                                  <span className="relative truncate flex-1">{item.label}</span>
                                  <MoveButtons
                                    label={item.label}
                                    testId={`nav-move-${item.key}`}
                                    canUp={iIdx > 0}
                                    canDown={iIdx < sectionEnabled.length - 1}
                                    onMove={dir => moveItem(section.label, orderedKeys, item.key, dir)}
                                  />
                                </div>
                              )
                            }
                            return (
                              <motion.button
                                key={item.key}
                                onClick={() => navigateTo(item.key)}
                                data-testid={`nav-${item.key}`}
                                title={item.label}
                                whileTap={{ scale: 0.98 }}
                                className="portal-nav-item"
                                aria-current={isActive ? 'page' : undefined}
                              >
                                <span className="relative flex-shrink-0">
                                  {item.icon}
                                </span>
                                <span className="relative truncate">{item.label}</span>
                              </motion.button>
                            )
                          })}
                        </div>
                      )
                    })
                  })()}

                  <div className="px-2 pt-2 pb-1 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setArranging(a => !a)}
                      data-testid="nav-arrange-toggle"
                      aria-pressed={arranging}
                      className="text-xs font-medium text-[#235b46] hover:underline focus-visible:outline-2 focus-visible:outline-[#235b46] rounded"
                    >
                      {arranging ? 'Done' : 'Arrange menu'}
                    </button>
                    {arranging && (
                      <button
                        type="button"
                        onClick={resetNavOrder}
                        data-testid="nav-arrange-reset"
                        className="text-xs text-[#55635a] hover:underline focus-visible:outline-2 focus-visible:outline-[#235b46] rounded"
                      >
                        Reset order
                      </button>
                    )}
                  </div>

                  {/* Items with no section mapping */}
                  {(() => {
                    const allSectioned = NAV_SECTIONS.flatMap(s => s.keys)
                    const unsectioned = enabledNavItems.filter(i => !allSectioned.includes(i.key))
                    if (unsectioned.length === 0) return null
                    return (
                      <div className="mb-1">
                        <p className="portal-nav-label">MORE</p>
                        {unsectioned.map(item => {
                          const isActive = activeNav === item.key
                          return (
                            <motion.button
                              key={item.key}
                              onClick={() => navigateTo(item.key)}
                              data-testid={`nav-${item.key}`}
                              title={item.label}
                              whileTap={{ scale: 0.98 }}
                              className="portal-nav-item"
                              aria-current={isActive ? 'page' : undefined}
                            >

                              <span className="relative">{item.icon}</span>
                              <span className="relative truncate">{item.label}</span>
                            </motion.button>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Locked features */}
                  {NAV_ITEMS.filter(item => isSchoolAdminScoped(item.key) && !navEnabled(item.key)).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[#dce2db]">
                      <p className="portal-nav-label">Upgrade to Unlock</p>
                      {NAV_ITEMS.filter(item => isSchoolAdminScoped(item.key) && !navEnabled(item.key)).map(item => (
                        <div key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm text-[#737d75] select-none">
                          <svg className="w-4 h-4 flex-shrink-0 text-[#737d75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span className="truncate text-[13px]">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </nav>

            {/* Sidebar footer */}
            <div className="portal-account">
              {isStaffAccount && (
                <motion.button
                  onClick={() => navigateTo('profile')}

                  whileTap={{ scale: 0.98 }}
                  className="portal-nav-item" aria-current={activeNav === 'profile' ? 'page' : undefined}
                >

                  <svg className="relative w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="relative">My Profile</span>
                </motion.button>
              )}
              <p className="text-xs text-[#55635a] pt-1">WLYL School Management</p>
            </div>
          </PortalSidebar>

          {/* Main content */}
          <main id="portal-main" tabIndex={-1} className="portal-main">
            {tier === 'none' ? (
              <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="text-center max-w-sm">
                  <div className="w-20 h-20 bg-amber-50 border-2 border-amber-200 rounded-full flex items-center justify-center mx-auto mb-5">
                    <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">No Plan Assigned</h3>
                  <p className="text-gray-400 text-sm mb-1">
                    Your school doesn&apos;t have an active plan yet.
                  </p>
                  <p className="text-gray-400 text-sm mb-5">
                    Please contact <span className="font-semibold text-gray-600">WLYL Admin</span> to activate a plan and unlock all features.
                  </p>
                  <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-500">
                    <a href="mailto:support@welearnyoulearn.com" className="text-[#235b46] hover:underline font-medium">support@welearnyoulearn.com</a>
                  </div>
                </div>
              </div>
            ) : (
              <FeaturesProvider value={enabledFeatures}>
                {visited.has('overview')         && <div hidden={activeNav !== 'overview'}><Overview schoolId={selectedSchool.id} onNavigate={navigateTo} /></div>}
                {visited.has('attendance')       && <div hidden={activeNav !== 'attendance'}><AttendanceDashboard schoolId={selectedSchool.id} onNavigate={navigateTo} /></div>}
                {visited.has('academic-calendar') && <div hidden={activeNav !== 'academic-calendar'}><AcademicCalendar schoolId={selectedSchool.id} /></div>}
                {/* ── Staff Hub: Directory + Onboarding combined ── */}
                {visited.has('staff') && (
                  <div hidden={activeNav !== 'staff'}>
                    <div className="mb-5">
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Staff</h2>
                      <div className="flex max-w-full gap-1 overflow-x-auto border-b border-[#dce2db]">
                        {([['directory', 'Staff Directory'], ['onboard', 'Onboard Staff']] as const).map(([key, label]) => (
                          <button key={key} onClick={() => { setStaffSubTab(key); if (key === 'onboard') setOnboardOpened(o => ({ ...o, staff: true })) }}
                            aria-pressed={staffSubTab === key} className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors ${staffSubTab === key ? 'border-[#235b46] text-[#235b46]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div hidden={staffSubTab !== 'directory'}><TeachersManagement schoolId={selectedSchool.id} refreshKey={staffRefreshKey} /></div>
                    <div hidden={staffSubTab !== 'onboard'}>{(onboardOpened.staff || staffSubTab === 'onboard') && <StaffOnboarding schoolId={selectedSchool.id} onRefresh={() => { setStaffRefreshKey(k => k + 1); setStaffSubTab('directory') }} />}</div>
                  </div>
                )}

                {/* ── Students Hub: List + Onboarding combined ── */}
                {visited.has('students') && (
                  <div hidden={activeNav !== 'students'}>
                    <div className="mb-5">
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Student Management</h2>
                      <div className="flex max-w-full gap-1 overflow-x-auto border-b border-[#dce2db]">
                        {([['list', 'Student List'], ['onboard', 'Onboard Students']] as const).map(([key, label]) => (
                          <button key={key} onClick={() => { setStudentsSubTab(key); if (key === 'onboard') setOnboardOpened(o => ({ ...o, students: true })) }}
                            aria-pressed={studentsSubTab === key} className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors ${studentsSubTab === key ? 'border-[#235b46] text-[#235b46]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div hidden={studentsSubTab !== 'list'}><StudentsManagement schoolId={selectedSchool.id} refreshKey={studentRefreshKey} /></div>
                    <div hidden={studentsSubTab !== 'onboard'}>{(onboardOpened.students || studentsSubTab === 'onboard') && <StudentOnboarding schoolId={selectedSchool.id} onRefresh={() => { setStudentRefreshKey(k => k + 1); setStudentsSubTab('list') }} />}</div>
                  </div>
                )}

                {visited.has('class-management') && <div hidden={activeNav !== 'class-management'}><ClassManagement schoolId={selectedSchool.id} onNavigate={navigateTo} /></div>}
                {visited.has('curriculum')       && <div hidden={activeNav !== 'curriculum'}><CurriculumCustomizer schoolId={selectedSchool.id} /></div>}
                {visited.has('library')          && <div hidden={activeNav !== 'library'}><DigitalLibrary apiUrl={`/api/school/library?school_id=${selectedSchool.id}`} /></div>}
                {visited.has('syllabus-tracking') && <div hidden={activeNav !== 'syllabus-tracking'}><AcademicAnalytics schoolId={selectedSchool.id} /></div>}
                {visited.has('exam-schedule')    && <div hidden={activeNav !== 'exam-schedule'}><ExamSchedule schoolId={selectedSchool.id} /></div>}
                {visited.has('announcements')    && <div hidden={activeNav !== 'announcements'}><AnnouncementBoard schoolId={selectedSchool.id} schoolName={selectedSchool.name} /></div>}
                {visited.has('feedback-management') && <div hidden={activeNav !== 'feedback-management'}><FeedbackManagement schoolId={selectedSchool.id} /></div>}
                {visited.has('export')           && <div hidden={activeNav !== 'export'}><ExportCenter schoolId={selectedSchool.id} /></div>}
                {visited.has('settings')         && <div hidden={activeNav !== 'settings'}><SchoolSettings schoolId={selectedSchool.id} /></div>}
                {visited.has('profile')          && <div hidden={activeNav !== 'profile'}><StaffProfile /></div>}
                {visited.has('fee-management')   && <div hidden={activeNav !== 'fee-management'}><FeeManagement schoolId={selectedSchool.id} schoolName={selectedSchool.name} schoolLogoUrl={selectedSchool.logo_url ?? null} schoolLogoAlign={selectedSchool.logo_align ?? 'center'} schoolHeaderBlocks={selectedSchool.receipt_header_blocks ?? []} onGoToYearRollover={() => navigateTo('year-rollover')} /></div>}
                {visited.has('expenses')         && <div hidden={activeNav !== 'expenses'}><ExpenseManagement schoolId={selectedSchool.id} /></div>}
                {visited.has('year-rollover')    && <div hidden={activeNav !== 'year-rollover'}><YearRollover schoolId={selectedSchool.id} onGoToFeeYearEnd={() => navigateTo('fee-management')} /></div>}
              </FeaturesProvider>
            )}
          </main>
        </div>
      )}
    </div>
    </MotionConfig>
  )
}

export default function SchoolAdminPage() {
  return (
    <Suspense>
      <SchoolAdmin />
    </Suspense>
  )
}
