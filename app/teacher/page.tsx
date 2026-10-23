'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { FullPageLoader } from '@/components/loaders'
import { FeaturesProvider } from '@/lib/features-context'
import NotificationBell from '../components/NotificationBell'
import { useUsageHeartbeat } from '@/lib/useUsageHeartbeat'
import { useFeatureTracking } from '@/lib/useFeatureTracking'
import { useSectionNav } from '@/lib/useSectionNav'
import { getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'
import PortalSidebar from '@/components/portal/PortalSidebar'
import { CalendarDays, Eye, Home, LogOut, Menu } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// Always-loaded (landing tab, and small enough not to be worth its own chunk)
import SmartSnapshot from './components/SmartSnapshot'
import TeacherSyllabus from './components/TeacherSyllabus'

// Lazy-loaded — only downloaded when first opened
function ModuleSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading section</span>
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
// Turbopack requires inline object literals for next/dynamic options
const ClassView      = dynamic(() => import('./components/ClassView'),      { loading: () => <ModuleSkeleton /> })
const TeacherProfile = dynamic(() => import('./components/TeacherProfile'), { loading: () => <ModuleSkeleton /> })
const Attendance     = dynamic(() => import('./components/Attendance'),     { loading: () => <ModuleSkeleton /> })
const SchoolCalendarView = dynamic(() => import('../components/SchoolCalendarView'), { loading: () => <ModuleSkeleton /> })
const MyStudents     = dynamic(() => import('./components/MyStudents'),     { loading: () => <ModuleSkeleton /> })
const MyClasses      = dynamic(() => import('./components/MyClasses'),      { loading: () => <ModuleSkeleton /> })
const TeacherLibrary = dynamic(() => import('./components/TeacherLibrary'), { loading: () => <ModuleSkeleton /> })

type Teacher = {
  id: number
  name: string
  employee_id: string
  subject: string
  department: string
  qualification: string
  email: string
  phone: string
  staff_type: string
  date_of_joining: string | null
  teaches_grades: string | null
  class_teacher_grade: string | null
  class_teacher_section: string | null
  status: string
  school_id: number
  school_name: string
  school_city: string
  date_of_birth?: string | null
}


type NavSection = {
  label: string
  items: { key: string; label: string; icon: React.ReactNode; comingSoon?: boolean }[]
}

// Maps a sidebar nav key to the school-plan feature key that gates it —
// same feature keys school-admin's sidebar and Class Management already use.
const NAV_KEY_TO_FEATURE: Record<string, string> = {
  attendance: 'attendance',
  calendar: 'calendar',
  library: 'library',
  syllabus: 'curriculum',
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'MAIN',
    items: [
      { key: 'snapshot', label: 'Overview', icon: <Home size={18} /> },
    ],
  },
  {
    label: 'MY CLASSES',
    items: [
      { key: 'my-classes', label: 'My Classes', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
      { key: 'my-students', label: 'My Students', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
      { key: 'syllabus', label: 'Syllabus', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
      { key: 'library', label: 'Digital Library', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253m0-13v13" /></svg> },
      { key: 'attendance', label: 'Attendance', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
      { key: 'calendar', label: 'School Calendar', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    ],
  },
  {
    label: 'MY ACCOUNT',
    items: [
      { key: 'profile', label: 'My Profile', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
    ],
  },
]

function TeacherPortal() {
  const router = useRouter()
  const [teacher, setTeacher]     = useState<Teacher | null>(null)
  const [loading, setLoading]     = useState(true)
  // Sidebar section nav lives in the URL's `tab` param — real navigation, so
  // the browser/phone Back button moves through the portal's own screens.
  const { current: activeNav, navigate: navigateSection } = useSectionNav<string>('snapshot')
  const [visitedNav, setVisitedNav] = useState<Set<string>>(new Set([activeNav]))
  useEffect(() => {
    setVisitedNav(prev => (prev.has(activeNav) ? prev : new Set([...prev, activeNav])))
  }, [activeNav])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<{ id: number; grade: string; section: string; class_teacher_name: string | null } | null>(null)
  const [classViewInitialTab, setClassViewInitialTab] = useState<string | undefined>(undefined)
  const [classViewOpenExamId, setClassViewOpenExamId] = useState<number | undefined>(undefined)

  const trackOpen = useFeatureTracking('teacher')

  function navigateTo(key: string) {
    setSidebarOpen(false)
    navigateSection(key)
    trackOpen(key)
  }

  function handleNavigate(key: string, payload?: { examId?: number; classId?: number; tab?: string }) {
    if (key === 'class-view' && payload?.classId && teacher) {
      fetch(`/api/classes/${payload.classId}?school_id=${teacher.school_id}`)
        .then(r => r.json())
        .then(data => {
          if (data?.id) {
            setSelectedClass({ id: data.id, grade: data.grade, section: data.section, class_teacher_name: null })
            setClassViewInitialTab(payload.tab)
            setClassViewOpenExamId(payload.examId)
            navigateTo('class-view')
          }
        }).catch(() => {})
    } else {
      setClassViewInitialTab(undefined)
      setClassViewOpenExamId(undefined)
      navigateTo(key)
    }
  }

  useUsageHeartbeat()

  const handleLogout = useCallback(async () => {
    const usageSessionId = getUsageSessionId()
    await fetch('/api/teacher/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usageSessionId }),
    })
    clearUsageSessionId()
    router.replace('/teacher/login')
  }, [router])

  // null = still loading (show everything so the sidebar doesn't flash
  // empty); an actually-empty Set once loaded means the school genuinely has
  // none of these features and must fail closed — see the nav filter below,
  // which checks this distinction directly rather than through useFeature()
  // (which can't tell "loading" from "genuinely zero" once handed a Set).
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string> | null>(null)
  const [academicYear, setAcademicYear] = useState('')
  // The school's own current year — never changes based on what the teacher
  // is viewing, used only to tell whether selectedAcademicYear is read-only.
  const [schoolCurrentYear, setSchoolCurrentYear] = useState('')
  const [availableYears, setAvailableYears] = useState<{ id: number; label: string; is_current: boolean }[]>([])
  // What the teacher has chosen to VIEW — independent of school admin's
  // active year. Resets to the school's current year on every fresh login
  // (session-only state, never persisted), and every read-heavy tab passes
  // this as ?academic_year= on its fetches. Any year other than the school's
  // current one is read-only throughout the portal.
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('')
  const isViewingPastYear = !!selectedAcademicYear && !!schoolCurrentYear && selectedAcademicYear !== schoolCurrentYear

  // Fetch teacher identity from session cookie
  useEffect(() => {
    fetch('/api/teacher/auth/me')
      .then(async r => {
        if (r.status === 401) { router.replace('/teacher/login'); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setTeacher(data)
      })
      .catch(() => router.replace('/teacher/login'))
      .finally(() => setLoading(false))
  }, [router])

  // A teacher belongs to a school, and the school's plan decides which
  // features exist — same gate school-admin already applies (e.g. the
  // Attendance tab hidden when it is not in the plan). Without this, the teacher portal shows
  // Attendance nav items and tabs regardless of the school's plan.
  // Reads the same override-aware endpoint Student/Parent use (checks
  // school_feature_overrides before falling back to tier) — a previous
  // tier-only fetch here ignored per-school overrides entirely and, on a
  // 'none'-tier school, left enabledFeatures empty forever, which
  // useFeature() treats as "still loading" and fails OPEN (shows
  // everything) rather than closed.
  useEffect(() => {
    if (!teacher?.school_id) return
    fetch(`/api/school/enabled-features?school_id=${teacher.school_id}&portal=teacher`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.enabled) setEnabledFeatures(new Set<string>(d.enabled)) })
      .catch(() => {})
  }, [teacher?.school_id])

  // Ambient "which year am I looking at" badge — every syllabus/class screen
  // already scopes its own data to the school's active academic year, but
  // gave no visible signal when that year is wrong. One fetch here, shown
  // once in the header, covers every tab. Also seeds the teacher's own year
  // selector (Profile tab) to the school's current year on every fresh
  // login — the teacher's choice is session-only and never persisted, so it
  // always starts here, never wherever they left it last time.
  useEffect(() => {
    if (!teacher?.school_id) return
    fetch(`/api/academic-year/current?school_id=${teacher.school_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.label) {
          setAcademicYear(d.label)
          setSchoolCurrentYear(d.label)
          setSelectedAcademicYear(d.label)
        }
      })
      .catch(() => {})
    fetch(`/api/academic-years?school_id=${teacher.school_id}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => setAvailableYears(Array.isArray(rows) ? rows.map((r: { id: number; label: string; is_current: boolean }) => ({ id: r.id, label: r.label, is_current: r.is_current })) : []))
      .catch(() => {})
  }, [teacher?.school_id])

  if (loading) return <FullPageLoader portal="teacher" sub="Getting your classes and schedule ready…" />

  if (!teacher) return null

  return (
    <FeaturesProvider value={enabledFeatures ?? new Set()}>
    <div className="portal-root" data-portal="teacher">
      <a href="#teacher-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      <header className="portal-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => setSidebarOpen(o => !o)} className="portal-icon-button lg:hidden" aria-label="Open navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <nav className="flex min-w-0 items-center gap-2 text-sm" aria-label="Current location">
            <span className="hidden shrink-0 font-semibold text-[#235b46] sm:block">Teacher workspace</span>
            <span className="hidden text-[#a5afa8] sm:block" aria-hidden="true">/</span>
            {activeNav === 'class-view' && selectedClass ? (
              <>
                <button onClick={() => navigateTo('snapshot')} className="hidden min-h-10 text-[#647068] hover:text-[#235b46] md:block">Overview</button>
                <span className="hidden text-[#a5afa8] md:block" aria-hidden="true">/</span>
                <span className="truncate font-medium text-[#202a25]">Class {selectedClass.grade}{selectedClass.section}</span>
              </>
            ) : (
              <span className="truncate font-medium text-[#202a25]">
                {NAV_SECTIONS.flatMap(s => s.items).find(i => i.key === activeNav)?.label || 'Overview'}
              </span>
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {(selectedAcademicYear || academicYear) && (
            <span data-testid="academic-year-badge"
              title={isViewingPastYear
                ? `Viewing ${selectedAcademicYear} (closed) — read-only. Switch back to ${schoolCurrentYear} in Profile to make changes.`
                : 'Active academic year — all data on this screen is scoped to this year'}
              className={`hidden items-center gap-1.5 text-xs sm:inline-flex ${isViewingPastYear ? 'text-amber-800' : 'text-[#647068]'}`}>
              {isViewingPastYear ? <Eye size={14} aria-hidden="true" /> : <CalendarDays size={14} aria-hidden="true" />}
              {selectedAcademicYear || academicYear}{isViewingPastYear && <span>· Read only</span>}
            </span>
          )}
          <NotificationBell teacherId={teacher.id} onNavigate={handleNavigate} />
          <button onClick={handleLogout} className="portal-icon-button text-[#647068] hover:text-red-700" aria-label="Sign out">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="portal-body">
        <PortalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} label="Teacher navigation" portal="teacher">
          <div className="portal-identity">
            <p className="text-base font-semibold tracking-tight text-[#235b46]">WeLearnYouLearn</p>
            <p className="mt-1 text-xs leading-relaxed text-[#647068]">{teacher.school_name}</p>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Teacher sections">
            {NAV_SECTIONS.map(section => {
              const visibleItems = section.items.filter(item => {
                const featureKey = NAV_KEY_TO_FEATURE[item.key]
                return !featureKey || enabledFeatures === null || enabledFeatures.has(featureKey)
              })
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#e6eee8] text-sm font-semibold text-[#235b46]" aria-hidden="true">{teacher.name.charAt(0)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#202a25]">{teacher.name}</p>
                <p className="mt-0.5 text-xs text-[#647068]">
                  {teacher.class_teacher_grade && teacher.class_teacher_section
                    ? `Class teacher · Grade ${teacher.class_teacher_grade}`
                    : teacher.department || 'Teacher'}
                </p>
              </div>
            </div>
          </div>
        </PortalSidebar>

        <main id="teacher-content" tabIndex={-1} className="portal-main">
          <div className="mx-auto w-full max-w-7xl">
          {visitedNav.has('snapshot')       && <div hidden={activeNav !== 'snapshot'}><SmartSnapshot teacher={teacher} schoolId={teacher.school_id} onNavigate={navigateTo} onViewClass={cls => { setSelectedClass(cls); navigateTo('class-view') }} /></div>}
          {visitedNav.has('class-view') && selectedClass && <div hidden={activeNav !== 'class-view'}><ClassView key={selectedClass.id} classId={selectedClass.id} grade={selectedClass.grade} section={selectedClass.section} schoolId={teacher.school_id} teacherName={teacher.name} teacherId={teacher.id} isClassTeacher={teacher.class_teacher_grade === selectedClass.grade && teacher.class_teacher_section === selectedClass.section} teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} onBack={() => navigateTo('snapshot')} initialTab={classViewInitialTab} openExamId={classViewOpenExamId} /></div>}
          {visitedNav.has('attendance')     && <div hidden={activeNav !== 'attendance'}><Attendance teacherId={teacher.id} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('calendar')       && <div hidden={activeNav !== 'calendar'}><SchoolCalendarView /></div>}
          {visitedNav.has('profile')        && <div hidden={activeNav !== 'profile'}><TeacherProfile teacher={teacher} onUpdate={setTeacher as (t: unknown) => void} availableYears={availableYears} selectedAcademicYear={selectedAcademicYear} schoolCurrentYear={schoolCurrentYear} onSelectYear={setSelectedAcademicYear} /></div>}
          {visitedNav.has('my-classes')     && <div hidden={activeNav !== 'my-classes'}><MyClasses teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} onViewClass={cls => { setSelectedClass(cls); navigateTo('class-view') }} onGoToSyllabus={cls => handleNavigate('class-view', { classId: cls.id, tab: 'Syllabus' })} /></div>}
          {visitedNav.has('my-students')    && <div hidden={activeNav !== 'my-students'}><MyStudents teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('syllabus')       && <div hidden={activeNav !== 'syllabus'}><TeacherSyllabus teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} academicYear={selectedAcademicYear} readOnly={isViewingPastYear} /></div>}
          {visitedNav.has('library')        && <div hidden={activeNav !== 'library'}><TeacherLibrary teacher={{ id: teacher.id, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} /></div>}
          </div>
        </main>
      </div>
    </div>
    </FeaturesProvider>
  )
}

export default function TeacherPortalPage() {
  return (
    <Suspense>
      <TeacherPortal />
    </Suspense>
  )
}
