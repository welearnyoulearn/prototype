'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import SmartSnapshot from './components/SmartSnapshot'
import ClassView from './components/ClassView'
import FullTimetable from './components/FullTimetable'
import TeacherLeave from './components/TeacherLeave'
import TeacherProfile from './components/TeacherProfile'
import Attendance from './components/Attendance'
import TasksPage from './components/TasksPage'
import MyStudents from './components/MyStudents'
import MyClasses from './components/MyClasses'
import DoubtsCenter from './components/DoubtsCenter'
import HODSyllabus from './components/HODSyllabus'
import LessonPlanner from './components/LessonPlanner'
import NotificationBell from '../components/NotificationBell'
import TestCalendar from '../components/TestCalendar'
import FloatingAIChat from '../components/FloatingAIChat'

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

type HODAssignment = {
  is_hod: boolean
  assignments: { id: number; department: string; teacher_id: number; class_ids: number[] }[]
}

type NavSection = {
  label: string
  items: { key: string; label: string; icon: React.ReactNode; comingSoon?: boolean }[]
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
      { key: 'timetable', label: 'Timetable', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
      { key: 'attendance', label: 'Attendance', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
    ],
  },
  {
    label: 'HOMEWORK & LEARNING',
    items: [
      { key: 'tasks', label: 'Homework', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l-3 3-1.5-1.5" /></svg> },
      { key: 'doubts', label: 'Doubt Center', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { key: 'syllabus', label: 'Syllabus Mgmt', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
      { key: 'test-calendar', label: 'Test Calendar', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
      { key: 'lesson-planner', label: 'Lesson Planner', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
      { key: 'performance', label: 'Performance', comingSoon: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
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
  const [hodData, setHodData]     = useState<HODAssignment | null>(null)
  const [loading, setLoading]     = useState(true)
  const [activeNav, setActiveNav] = useState('snapshot')
  const [visitedNav, setVisitedNav] = useState<Set<string>>(new Set(['snapshot']))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<{ id: number; grade: string; section: string; class_teacher_name: string | null } | null>(null)
  const [classViewInitialTab, setClassViewInitialTab] = useState<string | undefined>(undefined)
  const [classViewOpenExamId, setClassViewOpenExamId] = useState<number | undefined>(undefined)

  function navigateTo(key: string) {
    setActiveNav(key)
    setVisitedNav(prev => new Set([...prev, key]))
    setSidebarOpen(false)
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

  const handleLogout = useCallback(async () => {
    await fetch('/api/teacher/auth/logout', { method: 'POST' })
    router.push('/teacher/login')
  }, [router])

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
        // Fetch HOD status
        return fetch(`/api/hod?school_id=${data.school_id}&teacher_id=${data.id}`)
          .then(r => r.json())
          .then(hod => setHodData(hod))
          .catch(() => setHodData({ is_hod: false, assignments: [] }))
      })
      .catch(() => router.push('/teacher/login'))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading your portal...</p>
        </div>
      </div>
    )
  }

  if (!teacher) return null

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

  return (
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
              const visibleItems = section.items.filter(item => {
                if (item.key === 'syllabus') return hodData?.is_hod === true
                return true
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
                      {item.key === 'syllabus' && <span className="ml-auto text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-medium">HOD</span>}
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

        <FloatingAIChat mode="teacher" teacherId={teacher.id} teacherName={teacher.name} teacherSubject={teacher.subject} />

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          {visitedNav.has('snapshot')       && <div hidden={activeNav !== 'snapshot'}><SmartSnapshot teacher={teacher} schoolId={teacher.school_id} onNavigate={navigateTo} onViewClass={cls => { setSelectedClass(cls); navigateTo('class-view') }} /></div>}
          {visitedNav.has('class-view') && selectedClass && <div hidden={activeNav !== 'class-view'}><ClassView key={selectedClass.id} classId={selectedClass.id} grade={selectedClass.grade} section={selectedClass.section} schoolId={teacher.school_id} teacherName={teacher.name} teacherId={teacher.id} isClassTeacher={teacher.class_teacher_grade === selectedClass.grade && teacher.class_teacher_section === selectedClass.section} teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} onBack={() => navigateTo('snapshot')} initialTab={classViewInitialTab} openExamId={classViewOpenExamId} /></div>}
          {visitedNav.has('timetable')      && <div hidden={activeNav !== 'timetable'}><FullTimetable teacherId={teacher.id} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('attendance')     && <div hidden={activeNav !== 'attendance'}><Attendance teacherId={teacher.id} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('leave')          && <div hidden={activeNav !== 'leave'}><TeacherLeave teacherId={teacher.id} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('profile')        && <div hidden={activeNav !== 'profile'}><TeacherProfile teacher={teacher} onUpdate={setTeacher as (t: unknown) => void} /></div>}
          {visitedNav.has('tasks')          && <div hidden={activeNav !== 'tasks'}><TasksPage teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('my-classes')     && <div hidden={activeNav !== 'my-classes'}><MyClasses teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} onViewClass={cls => { setSelectedClass(cls); navigateTo('class-view') }} /></div>}
          {visitedNav.has('my-students')    && <div hidden={activeNav !== 'my-students'}><MyStudents teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('doubts')         && <div hidden={activeNav !== 'doubts'}><DoubtsCenter teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject }} schoolId={teacher.school_id} /></div>}
          {visitedNav.has('syllabus') && hodData?.is_hod && hodData.assignments?.length > 0 && (
            <div hidden={activeNav !== 'syllabus'}>
              <HODSyllabus teacher={{ id: teacher.id, name: teacher.name, school_id: teacher.school_id }} hodAssignments={hodData.assignments} />
            </div>
          )}
          {visitedNav.has('test-calendar')  && <div hidden={activeNav !== 'test-calendar'}><TestCalendar mode="teacher" schoolId={teacher.school_id} teacherId={teacher.id} /></div>}
          {visitedNav.has('lesson-planner') && <div hidden={activeNav !== 'lesson-planner'}><LessonPlanner teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject }} schoolId={teacher.school_id} /></div>}
          {['performance', 'messages'].includes(activeNav) && (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Coming Soon</h3>
                <p className="text-gray-400 text-sm">This feature is under development</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
