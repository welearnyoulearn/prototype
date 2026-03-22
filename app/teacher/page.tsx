'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SmartSnapshot from './components/SmartSnapshot'
import ClassView from './components/ClassView'
import FullTimetable from './components/FullTimetable'
import TeacherLeave from './components/TeacherLeave'
import TeacherProfile from './components/TeacherProfile'
import Attendance from './components/Attendance'
import NotificationBell from '../components/NotificationBell'

type School = { id: number; name: string; city: string; country: string; status: string }
type TeacherBasic = { id: number; name: string; employee_id: string; subject: string; department: string }
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
}

type NavSection = {
  label: string
  items: { key: string; label: string; icon: React.ReactNode; comingSoon?: boolean }[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'MAIN',
    items: [
      {
        key: 'snapshot',
        label: 'Smart Snapshot',
        icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
      },
    ],
  },
  {
    label: 'MY CLASSES',
    items: [
      {
        key: 'timetable',
        label: 'Timetable',
        icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
      },
      {
        key: 'my-students',
        label: 'My Students',
        comingSoon: true,
        icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      },
      {
        key: 'attendance',
        label: 'Attendance',
        icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
      },
    ],
  },
  {
    label: 'TASKS & LEARNING',
    items: [
      { key: 'daily-tasks', label: 'Daily Tasks', comingSoon: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
      { key: 'task-review', label: 'Task Review', comingSoon: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> },
      { key: 'performance', label: 'Performance', comingSoon: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
    ],
  },
  {
    label: 'COMMUNICATION',
    items: [
      { key: 'doubts', label: 'Doubt Center', comingSoon: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { key: 'suggestions', label: 'Suggestions', comingSoon: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
      { key: 'messages', label: 'Messages', comingSoon: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> },
    ],
  },
  {
    label: 'MY ACCOUNT',
    items: [
      {
        key: 'profile',
        label: 'My Profile',
        icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
      },
      {
        key: 'leave',
        label: 'Teacher Attend.',
        icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
      },
    ],
  },
]

export default function TeacherPortal() {
  const [schools, setSchools] = useState<School[]>([])
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [teachers, setTeachers] = useState<TeacherBasic[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [activeNav, setActiveNav] = useState('snapshot')
  const [selectedClass, setSelectedClass] = useState<{ id: number; grade: string; section: string; class_teacher_name: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/init')
      .then(() => fetch('/api/schools'))
      .then(r => r.json())
      .then((data: School[]) => setSchools(data.filter(s => s.status === 'active')))
      .catch(() => setError('Cannot connect to database'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedSchoolId) { setTeachers([]); setSelectedTeacherId(''); return }
    fetch(`/api/teachers?school_id=${selectedSchoolId}&staff_type=teaching`)
      .then(r => r.json())
      .then(data => { setTeachers(Array.isArray(data) ? data : []); setSelectedTeacherId('') })
  }, [selectedSchoolId])

  useEffect(() => {
    if (!selectedTeacherId) { setTeacher(null); return }
    setProfileLoading(true)
    fetch(`/api/teachers/${selectedTeacherId}`)
      .then(r => r.json())
      .then(data => setTeacher(data))
      .finally(() => setProfileLoading(false))
  }, [selectedTeacherId])

  const selectedSchool = schools.find(s => s.id === parseInt(selectedSchoolId))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  // Selection screen — before teacher is selected
  if (!teacher) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Home</Link>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-900 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">W</span>
            </div>
            <span className="font-bold text-gray-900">WLYL</span>
          </div>
          <span className="bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full ml-auto">Teacher Portal</span>
        </div>
        <div className="max-w-md mx-auto px-6 py-16">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">Teacher Portal</h1>
            <p className="text-sm text-gray-500">Select your school and name to continue</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
              <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">— Select school —</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}
                disabled={!selectedSchoolId || teachers.length === 0}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50">
                <option value="">— Select teacher —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {profileLoading && <p className="text-center text-sm text-gray-400">Loading profile...</p>}
          </div>
        </div>
      </div>
    )
  }

  // Full portal with sidebar
  const pendingLeaves = 0 // Could fetch this separately if needed

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Home</Link>
          <span className="text-gray-200">|</span>
          <nav className="flex items-center gap-1 text-sm text-gray-400">
            <span>Home</span>
            <span>/</span>
            {activeNav === 'class-view' && selectedClass ? (
              <>
                <button onClick={() => setActiveNav('snapshot')} className="hover:text-blue-600 transition-colors">Smart Snapshot</button>
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
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-gray-800">
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {teacher.name}
          </p>
          <NotificationBell teacherId={teacher.id} onNavigate={setActiveNav} />
          <button onClick={() => { setTeacher(null); setSelectedTeacherId('') }}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded">
            Switch
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-52 bg-slate-900 flex-shrink-0 flex flex-col">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">W</span>
              </div>
              <span className="text-white font-bold text-base">WLYL</span>
            </div>
            {selectedSchool && (
              <p className="text-slate-400 text-xs mt-2 leading-tight">{selectedSchool.name}</p>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 overflow-y-auto">
            {NAV_SECTIONS.map(section => (
              <div key={section.label} className="mb-2">
                <p className="px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{section.label}</p>
                {section.items.map(item => (
                  <button
                    key={item.key}
                    onClick={() => !item.comingSoon && setActiveNav(item.key)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                      item.comingSoon
                        ? 'text-slate-600 cursor-not-allowed'
                        : activeNav === item.key
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.comingSoon && (
                      <span className="ml-auto text-[9px] text-slate-600 font-medium">Soon</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Teacher info at bottom */}
          <div className="px-4 py-4 border-t border-slate-700 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {teacher.name.charAt(0).toUpperCase()}
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

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeNav === 'snapshot' && (
            <SmartSnapshot
              teacher={teacher}
              schoolId={parseInt(selectedSchoolId)}
              onNavigate={setActiveNav}
              onViewClass={cls => { setSelectedClass(cls); setActiveNav('class-view') }}
            />
          )}
          {activeNav === 'class-view' && selectedClass && (
            <ClassView
              classId={selectedClass.id}
              grade={selectedClass.grade}
              section={selectedClass.section}
              schoolId={parseInt(selectedSchoolId)}
              teacherName={teacher.name}
              teacherId={teacher.id}
              isClassTeacher={
                teacher.class_teacher_grade === selectedClass.grade &&
                teacher.class_teacher_section === selectedClass.section
              }
              onBack={() => setActiveNav('snapshot')}
            />
          )}
          {activeNav === 'timetable' && (
            <FullTimetable teacherId={teacher.id} schoolId={parseInt(selectedSchoolId)} />
          )}
          {activeNav === 'attendance' && (
            <Attendance teacherId={teacher.id} schoolId={parseInt(selectedSchoolId)} />
          )}
          {activeNav === 'leave' && (
            <TeacherLeave teacherId={teacher.id} schoolId={parseInt(selectedSchoolId)} />
          )}
          {activeNav === 'profile' && (
            <TeacherProfile teacher={teacher} onUpdate={setTeacher} />
          )}
          {/* Coming soon screens */}
          {['my-students', 'attendance', 'daily-tasks', 'task-review', 'performance', 'doubts', 'suggestions', 'messages'].includes(activeNav) && (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
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
