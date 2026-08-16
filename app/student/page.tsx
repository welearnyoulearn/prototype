'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import AppLoader from '../components/AppLoader'
import NotificationBell from '../components/NotificationBell'
import { useUsageHeartbeat } from '@/lib/useUsageHeartbeat'
import { useFeatureTracking } from '@/lib/useFeatureTracking'
import { getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'

// Always-loaded (landing tab, and small enough not to be worth its own chunk)
import StudentDashboard from './components/StudentDashboard'
import StudentProfile from './components/StudentProfile'

// Lazy-loaded — only downloaded when first opened
function ModuleSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-100 rounded-xl w-48" />
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
      </div>
      <div className="h-64 bg-gray-100 rounded-2xl" />
    </div>
  )
}
// Turbopack requires inline object literals for next/dynamic options
const StudentTasks     = dynamic(() => import('./components/StudentTasks'),     { loading: () => <ModuleSkeleton /> })
const StudentDoubts    = dynamic(() => import('./components/StudentDoubts'),    { loading: () => <ModuleSkeleton /> })
const StudentMarks     = dynamic(() => import('./components/StudentMarks'),     { loading: () => <ModuleSkeleton /> })
const StudentTimetable = dynamic(() => import('./components/StudentTimetable'), { loading: () => <ModuleSkeleton /> })
const StudentSyllabus  = dynamic(() => import('./components/StudentSyllabus'),  { loading: () => <ModuleSkeleton /> })
const DigitalLibrary    = dynamic(() => import('../components/library/DigitalLibrary'), { loading: () => <ModuleSkeleton /> })

type Student = {
  id: number; name: string; grade: string; section: string; roll_number: string
  email: string | null; phone: string | null; parent_name: string | null; parent_phone: string | null
  school_id: number; school_name: string
}

type NavItem    = { key: string; label: string; icon: string; comingSoon?: boolean }
type NavSection = { label: string; items: NavItem[] }

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'HOME',
    items: [
      { key: 'dashboard', label: 'Dashboard',    icon: '🏠' },
      { key: 'timetable', label: 'My Timetable', icon: '🗓️' },
      { key: 'syllabus',  label: 'Syllabus',     icon: '📚' },
      { key: 'library',   label: 'Digital Library', icon: '📖' },
    ],
  },
  {
    label: 'LEARNING',
    items: [
      { key: 'tasks',  label: 'Homework',    icon: '📝' },
      { key: 'doubts', label: 'Ask a Doubt', icon: '💬' },
    ],
  },
  {
    label: 'ACADEMIC',
    items: [
      { key: 'my-marks', label: 'My Marks', icon: '📊' },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { key: 'profile', label: 'My Profile', icon: '👤' },
    ],
  },
]

const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(s => s.items)

const BOTTOM_NAV = [
  { key: 'dashboard', label: 'Home',    emoji: '🏠' },
  { key: 'tasks',     label: 'Tasks',   emoji: '📝' },
  { key: 'doubts',    label: 'Doubts',  emoji: '💬' },
  { key: 'my-marks',  label: 'Marks',   emoji: '📊' },
  { key: 'profile',   label: 'Profile', emoji: '👤' },
]

export default function StudentPortal() {
  const router = useRouter()
  const [student,     setStudent]     = useState<Student | null>(null)
  const [classId,     setClassId]     = useState(0)
  const [academicYear, setAcademicYear] = useState('')
  const [activeNav,   setActiveNav]   = useState('dashboard')
  const [visitedNav,  setVisitedNav]  = useState<Set<string>>(new Set(['dashboard']))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const logoutInFlight = useRef(false)

  const trackOpen = useFeatureTracking('student')

  function navigateTo(key: string) {
    setActiveNav(key)
    setVisitedNav(prev => new Set([...prev, key]))
    setSidebarOpen(false)
    trackOpen(key)
  }

  useEffect(() => {
    fetch('/api/student/auth/me')
      .then(async r => {
        if (r.status === 401) { router.push('/student/login'); return }
        const data = await r.json()
        setStudent(data)
        const classRes = await fetch(`/api/classes?school_id=${data.school_id}`)
        if (classRes.ok) {
          const classes = await classRes.json()
          const cls = (classes as { id: number; grade: string; section: string }[])
            .find(c => c.grade === data.grade && c.section === data.section)
          if (cls) setClassId(cls.id)
        }
        // Ambient "which year am I looking at" badge — one fetch, shown once
        // in the header, covers every tab (syllabus, marks, timetable, ...).
        fetch(`/api/academic-year/current?school_id=${data.school_id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.label) setAcademicYear(d.label) })
          .catch(() => {})
      })
      .catch(() => router.push('/student/login'))
      .finally(() => setLoading(false))
  }, [router])

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
    router.push('/student/login')
  }

  if (loading) return <AppLoader message="Loading your portal" sub="Fetching your courses and progress…" />

  if (!student) return null

  const firstName   = student.name.split(' ')[0]
  const currentItem = NAV_ITEMS.find(i => i.key === activeNav)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-4 sm:px-6 h-14 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-3">
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="lg:hidden p-2 -ml-1 rounded-xl text-gray-400 hover:bg-gray-100 active:scale-90 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm shadow-orange-200 flex-shrink-0">
              <span className="text-white text-xs font-black">W</span>
            </div>
            <span className="hidden sm:block font-black text-gray-900 text-sm">WLYL</span>
          </div>
          {/* Page title */}
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-gray-400">
            <span>/</span>
            <span className="text-base leading-none">{currentItem?.icon}</span>
            <span className="text-gray-700 font-semibold">{currentItem?.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {academicYear && (
            <span
              data-testid="academic-year-badge"
              title="Active academic year — all data on this screen is scoped to this year"
              className="hidden sm:inline-flex items-center gap-1 bg-gray-100 border border-gray-200 text-gray-500 text-[10px] font-medium px-2.5 py-1 rounded-full"
            >
              📅 {academicYear}
            </span>
          )}
          {/* Student name — desktop */}
          <div className="hidden sm:flex items-center gap-2 border border-gray-200 rounded-full pl-1.5 pr-3 py-1">
            <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-black">{firstName.charAt(0)}</span>
            </div>
            <span className="text-xs font-semibold text-gray-700">{firstName}</span>
            <span className="text-[10px] text-gray-400">Gr {student.grade}{student.section}</span>
          </div>
          <NotificationBell studentId={student.id} onNavigate={navigateTo} />
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-red-500 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 transition-all"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <aside className={`
          fixed inset-y-0 left-0 z-40 w-60
          lg:relative lg:inset-y-auto lg:left-auto
          bg-[#0f172a] flex-shrink-0 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>

          {/* Student info */}
          <div className="px-5 py-5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-900/50">
                <span className="text-white text-lg font-black">{firstName.charAt(0)}</span>
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-tight truncate">{student.name}</p>
                <p className="text-slate-400 text-xs mt-0.5">Grade {student.grade}-{student.section}</p>
              </div>
            </div>
            <p className="text-slate-600 text-[10px] mt-3 truncate">{student.school_name}</p>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-3 overflow-y-auto">
            {NAV_SECTIONS.map(section => (
              <div key={section.label} className="mb-1">
                <p className="px-3 pt-4 pb-1 text-[9px] font-bold text-slate-600 uppercase tracking-[0.15em]">
                  {section.label}
                </p>
                {section.items.map(item => (
                  <button
                    key={item.key}
                    onClick={() => { if (!item.comingSoon) navigateTo(item.key) }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left mb-0.5
                      transition-all duration-200 ease-out
                      ${item.comingSoon
                        ? 'text-slate-700 cursor-not-allowed'
                        : activeNav === item.key
                          ? 'bg-orange-500 text-white font-semibold shadow-lg shadow-orange-900/40 scale-[1.02]'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.07] hover:translate-x-0.5'
                      }
                    `}
                  >
                    <span className="text-base leading-none w-5 flex-shrink-0 text-center">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.comingSoon && (
                      <span className="text-[9px] bg-white/5 text-slate-600 px-1.5 py-0.5 rounded font-bold">SOON</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-3 py-3 border-t border-white/[0.06]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all text-sm"
            >
              <span className="text-base leading-none w-5 text-center">👋</span>
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* ── Main Content ──────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 scroll-smooth">
          <div className="max-w-3xl mx-auto">
            {visitedNav.has('dashboard')   && <div hidden={activeNav !== 'dashboard'}><StudentDashboard student={student} classId={classId} schoolId={student.school_id} onNavigate={navigateTo} /></div>}
            {visitedNav.has('tasks')       && <div hidden={activeNav !== 'tasks'}><StudentTasks student={student} classId={classId} schoolId={student.school_id} /></div>}
            {visitedNav.has('doubts')      && <div hidden={activeNav !== 'doubts'}><StudentDoubts student={student} classId={classId} schoolId={student.school_id} /></div>}
            {visitedNav.has('my-marks')    && <div hidden={activeNav !== 'my-marks'}><StudentMarks studentId={student.id} schoolId={student.school_id} classId={classId} /></div>}
            {visitedNav.has('timetable')   && <div hidden={activeNav !== 'timetable'}><StudentTimetable classId={classId} schoolId={student.school_id} grade={student.grade} section={student.section} /></div>}
            {visitedNav.has('syllabus')    && <div hidden={activeNav !== 'syllabus'}><StudentSyllabus schoolId={student.school_id} classId={classId} grade={student.grade} /></div>}
            {visitedNav.has('library')     && <div hidden={activeNav !== 'library'}><DigitalLibrary apiUrl={`/api/school/library?school_id=${student.school_id}`} /></div>}
            {visitedNav.has('profile')     && <div hidden={activeNav !== 'profile'}><StudentProfile student={student} /></div>}
          </div>
        </main>
      </div>

      {/* ── Bottom Navigation — mobile ────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30">
        <div className="flex">
          {BOTTOM_NAV.map(item => {
            const isActive = activeNav === item.key
            return (
              <button
                key={item.key}
                onClick={() => navigateTo(item.key)}
                className="flex-1 relative flex flex-col items-center py-2.5 gap-0.5 transition-all duration-200 active:scale-75"
              >
                {/* Active top line — slides in */}
                <span className={`absolute top-0 left-1/4 right-1/4 h-[2.5px] rounded-full transition-all duration-300 ${
                  isActive ? 'bg-orange-500 opacity-100' : 'bg-transparent opacity-0'
                }`} />
                {/* Emoji — bounces when active */}
                <span className={`text-xl leading-none transition-all duration-200 ${
                  isActive ? 'scale-125 -translate-y-0.5' : 'opacity-40 scale-100'
                }`}>
                  {item.emoji}
                </span>
                <span className={`text-[9px] font-bold transition-all duration-200 ${
                  isActive ? 'text-orange-500 opacity-100' : 'text-gray-400 opacity-70'
                }`}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

    </div>
  )
}
