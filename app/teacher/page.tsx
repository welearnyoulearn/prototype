'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import AppLoader from '../components/AppLoader'
import { FeaturesProvider } from '@/lib/features-context'
import NotificationBell from '../components/NotificationBell'
import { useUsageHeartbeat } from '@/lib/useUsageHeartbeat'
import { useFeatureTracking } from '@/lib/useFeatureTracking'
import { getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'

// Always-loaded (landing tab, and small enough not to be worth its own chunk)
import SmartSnapshot from './components/SmartSnapshot'
import TeacherSyllabus from './components/TeacherSyllabus'

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
const ClassView      = dynamic(() => import('./components/ClassView'),      { loading: () => <ModuleSkeleton /> })
const FullTimetable  = dynamic(() => import('./components/FullTimetable'),  { loading: () => <ModuleSkeleton /> })
const TeacherLeave   = dynamic(() => import('./components/TeacherLeave'),   { loading: () => <ModuleSkeleton /> })
const TeacherProfile = dynamic(() => import('./components/TeacherProfile'), { loading: () => <ModuleSkeleton /> })
const Attendance     = dynamic(() => import('./components/Attendance'),     { loading: () => <ModuleSkeleton /> })
const MyStudents     = dynamic(() => import('./components/MyStudents'),     { loading: () => <ModuleSkeleton /> })
const MyClasses      = dynamic(() => import('./components/MyClasses'),      { loading: () => <ModuleSkeleton /> })

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
}


type NavSection = {
  label: string
  items: { key: string; label: string; icon: React.ReactNode; comingSoon?: boolean }[]
}

// Maps a sidebar nav key to the school-plan feature key that gates it —
// same feature keys school-admin's sidebar and Class Management already use.
const NAV_KEY_TO_FEATURE: Record<string, string> = {
  timetable: 'timetable',
  attendance: 'attendance',
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'MAIN',
    items: [
      { key: 'snapshot', label: 'Smart Snapshot', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
    ],
  },
  {
    label: 'MY CLASSES',
    items: [
      { key: 'my-classes', label: 'My Classes', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
      { key: 'my-students', label: 'My Students', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
      { key: 'syllabus', label: 'Syllabus', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
      { key: 'timetable', label: 'Timetable', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
      { key: 'attendance', label: 'Attendance', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
    ],
  },
  {
    label: 'MY ACCOUNT',
    items: [
      { key: 'profile', label: 'My Profile', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
      { key: 'leave', label: 'Teacher Attend.', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    ],
  },
]

export default function TeacherPortal() {
  const router = useRouter()
  const [teacher, setTeacher]     = useState<Teacher | null>(null)
  const [loading, setLoading]     = useState(true)
  const [activeNav, setActiveNav] = useState('snapshot')
  const [visitedNav, setVisitedNav] = useState<Set<string>>(new Set(['snapshot']))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<{ id: number; grade: string; section: string; class_teacher_name: string | null } | null>(null)
  const [classViewInitialTab, setClassViewInitialTab] = useState<string | undefined>(undefined)
  const [classViewOpenExamId, setClassViewOpenExamId] = useState<number | undefined>(undefined)

  const trackOpen = useFeatureTracking('teacher')

  function navigateTo(key: string) {
    setActiveNav(key)
    setVisitedNav(prev => new Set([...prev, key]))
    setSidebarOpen(false)
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
    router.push('/teacher/login')
  }, [router])

  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set())
  const [academicYear, setAcademicYear] = useState('')

  // Fetch teacher identity from session cookie
  useEffect(() => {
    fetch('/api/teacher/auth/me')
      .then(async r => {
        if (r.status === 401) { router.push('/teacher/login'); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setTeacher(data)
      })
      .catch(() => router.push('/teacher/login'))
      .finally(() => setLoading(false))
  }, [router])

  // A teacher belongs to a school, and the school's plan decides which
  // features exist — same gate school-admin already applies (e.g. Timetable
  // tab hidden on the Basic plan). Without this, the teacher portal shows
  // Timetable/Attendance nav items and tabs regardless of the school's plan.
  useEffect(() => {
    if (!teacher?.school_id) return
    fetch(`/api/schools/${teacher.school_id}/subscription`)
      .then(r => r.json())
      .then(async subData => {
        const tier = subData.tier || 'none'
        if (tier === 'none') return
        const featRes = await fetch(`/api/platform/features?tier=${tier}`)
        if (featRes.ok) {
          const fd = await featRes.json()
          setEnabledFeatures(new Set(fd.enabled || []))
        }
      })
      .catch(() => {})
  }, [teacher?.school_id])

  // Ambient "which year am I looking at" badge — every syllabus/class screen
  // already scopes its own data to the school's active academic year, but
  // gave no visible signal when that year is wrong. One fetch here, shown
  // once in the header, covers every tab.
  useEffect(() => {
    if (!teacher?.school_id) return
    fetch(`/api/academic-year/current?school_id=${teacher.school_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.label) setAcademicYear(d.label) })
      .catch(() => {})
  }, [teacher?.school_id])

  if (loading) return <AppLoader message="Loading your portal" sub="Getting your classes and schedule ready…" />

  if (!teacher) return null

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

  return (
    <FeaturesProvider value={enabledFeatures}>
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setSidebarOpen(o => !o)} className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <nav className="hidden sm:flex items-center gap-1 text-sm text-gray-400">
            <span>Teacher Portal</span>
            <span>/</span>
            {activeNav === 'class-view' && selectedClass ? (
              <>
                <button onClick={() => navigateTo('snapshot')} className="hover:text-emerald-600 transition-colors">Smart Snapshot</button>
                <span>/</span>
                <span className="text-gray-700 font-medium">Class {selectedClass.grade}{selectedClass.section}</span>
              </>
            ) : (
              <span className="text-gray-700 font-medium">
                {NAV_SECTIONS.flatMap(s => s.items).find(i => i.key === activeNav)?.label || 'Smart Snapshot'}
              </span>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {academicYear && (
            <span
              data-testid="academic-year-badge"
              title="Active academic year — all data on this screen is scoped to this year"
              className="hidden sm:inline-flex items-center gap-1 bg-gray-100 border border-gray-200 text-gray-500 text-xs font-medium px-2.5 py-1 rounded-full"
            >
              📅 {academicYear}
            </span>
          )}
          <p className="hidden sm:block text-sm font-medium text-gray-800">{greeting}, {teacher.name}</p>
          <NotificationBell teacherId={teacher.id} onNavigate={handleNavigate} />
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Logout
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        <aside className={`fixed inset-y-0 left-0 z-40 lg:relative lg:inset-y-auto lg:left-auto w-52 bg-slate-900 flex-shrink-0 flex flex-col transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="px-4 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">W</span>
              </div>
              <span className="text-white font-bold text-base">WLYL</span>
            </div>
            <p className="text-slate-400 text-xs mt-2 leading-tight">{teacher.school_name}</p>
          </div>

          <nav className="flex-1 py-3 overflow-y-auto">
            {NAV_SECTIONS.map(section => {
              // Only these nav keys correspond to a school-plan feature gate —
              // the rest (My Classes, My Students, Syllabus, Profile, Leave)
              // aren't plan-gated features and always show.
              const visibleItems = section.items.filter(item => {
                const featureKey = NAV_KEY_TO_FEATURE[item.key]
                return !featureKey || enabledFeatures.size === 0 || enabledFeatures.has(featureKey)
              })
              if (visibleItems.length === 0) return null
              return (
                <div key={section.label} className="mb-2">
                  <p className="px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{section.label}</p>
                  {visibleItems.map(item => (
                    <button key={item.key}
                      onClick={() => { if (!item.comingSoon) navigateTo(item.key) }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                        item.comingSoon ? 'text-slate-600 cursor-not-allowed'
                          : activeNav === item.key ? 'bg-emerald-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}>
                      {item.icon}
                      <span>{item.label}</span>
                      {item.comingSoon && <span className="ml-auto text-[9px] text-slate-600 font-medium">Soon</span>}
                    </button>
                  ))}
                </div>
              )
            })}
          </nav>

          <div className="px-4 py-4 border-t border-slate-700 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {teacher.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">{teacher.name}</p>
              <p className="text-slate-400 text-[10px] truncate">
                {teacher.class_teacher_grade && teacher.class_teacher_section
                  ? `Class Teacher · Grade ${teacher.class_teacher_grade}`
                  : teacher.department || 'Teacher'}
              </p>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          {visitedNav.has('snapshot')       && <div hidden={activeNav !== 'snapshot'}><SmartSnapshot teacher={teacher} schoolId={teacher.school_id} onNavigate={navigateTo} onViewClass={cls => { setSelectedClass(cls); navigateTo('class-view') }} /></div>}
          {visitedNav.has('class-view') && selectedClass && <div hidden={activeNav !== 'class-view'}><ClassView key={selectedClass.id} classId={selectedClass.id} grade={selectedClass.grade} section={selectedClass.section} schoolId={teacher.school_id} teacherName={teacher.name} teacherId={teacher.id} isClassTeacher={teacher.class_teacher_grade === selectedClass.grade && teacher.class_teacher_section === selectedClass.section} teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} onBack={() => navigateTo('snapshot')} initialTab={classViewInitialTab} openExamId={classViewOpenExamId} /></div>}
          {visitedNav.has('timetable')      && <div hidden={activeNav !== 'timetable'}><FullTimetable teacherId={teacher.id} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('attendance')     && <div hidden={activeNav !== 'attendance'}><Attendance teacherId={teacher.id} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('leave')          && <div hidden={activeNav !== 'leave'}><TeacherLeave teacherId={teacher.id} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('profile')        && <div hidden={activeNav !== 'profile'}><TeacherProfile teacher={teacher} onUpdate={setTeacher as (t: unknown) => void} /></div>}
          {visitedNav.has('my-classes')     && <div hidden={activeNav !== 'my-classes'}><MyClasses teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} onViewClass={cls => { setSelectedClass(cls); navigateTo('class-view') }} onGoToSyllabus={cls => handleNavigate('class-view', { classId: cls.id, tab: 'Syllabus' })} /></div>}
          {visitedNav.has('my-students')    && <div hidden={activeNav !== 'my-students'}><MyStudents teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('syllabus')       && <div hidden={activeNav !== 'syllabus'}><TeacherSyllabus teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} onGoToHomework={classId => handleNavigate('class-view', { classId, tab: 'Homework' })} /></div>}
        </main>
      </div>
    </div>
    </FeaturesProvider>
  )
}
