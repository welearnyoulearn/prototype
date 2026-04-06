'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
import TeacherSyllabus from './components/TeacherSyllabus'
import NotificationBell from '../components/NotificationBell'
import TestCalendar from '../components/TestCalendar'

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
  school_id: number
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
    label: 'TASKS & LEARNING',
    items: [
      { key: 'tasks', label: 'Tasks', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l-3 3-1.5-1.5" /></svg> },
      { key: 'doubts', label: 'Doubt Center', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { key: 'syllabus', label: 'Syllabus', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
      { key: 'test-calendar', label: 'Test Calendar', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
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

// Wrapper that picks class for TeacherSyllabus
function SyllabusWrapper({
  teacher, schoolId, selectedClass,
}: {
  teacher: Teacher
  schoolId: number
  selectedClass: { id: number; grade: string; section: string } | null
}) {
  const [classes, setClasses] = useState<{ id: number; grade: string; section: string }[]>([])
  const [pickedClassId, setPickedClassId] = useState<string>(selectedClass ? String(selectedClass.id) : '')

  useEffect(() => {
    fetch(`/api/classes?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => {
        const sorted = Array.isArray(data) ? data.sort((a: { grade: string; section: string }, b: { grade: string; section: string }) => {
          const ga = parseInt(a.grade) || 0
          const gb = parseInt(b.grade) || 0
          return ga !== gb ? ga - gb : a.section.localeCompare(b.section)
        }) : []
        setClasses(sorted)
        if (!pickedClassId && sorted.length > 0) {
          // Auto-pick teacher's own class if they're a class teacher
          const ownClass = sorted.find((c: { grade: string; section: string }) =>
            c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section
          )
          setPickedClassId(String(ownClass?.id || sorted[0].id))
        }
      })
  }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  const classId = parseInt(pickedClassId)

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="font-bold text-gray-800 text-xl">Syllabus</h2>
        <select
          value={pickedClassId}
          onChange={e => setPickedClassId(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {classes.map(c => (
            <option key={c.id} value={c.id}>Grade {c.grade}-{c.section}</option>
          ))}
        </select>
      </div>
      {classId > 0 && (
        <TeacherSyllabus
          teacher={{ id: teacher.id, name: teacher.name, school_id: schoolId }}
          classId={classId}
        />
      )}
    </div>
  )
}

export default function TeacherPortal() {
  const [schools, setSchools] = useState<School[]>([])
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [teachers, setTeachers] = useState<TeacherBasic[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [activeNav, setActiveNav] = useState('snapshot')
  const [visitedNav, setVisitedNav] = useState<Set<string>>(new Set(['snapshot']))
  function navigateTo(key: string) { setActiveNav(key); setVisitedNav(prev => new Set([...prev, key])) }
  const [selectedClass, setSelectedClass] = useState<{ id: number; grade: string; section: string; class_teacher_name: string | null } | null>(null)
  const [classViewInitialTab, setClassViewInitialTab] = useState<string | undefined>(undefined)
  const [classViewOpenExamId, setClassViewOpenExamId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [error, setError] = useState('')

  function handleNavigate(key: string, payload?: { examId?: number; classId?: number; tab?: string }) {
    if (key === 'class-view' && payload?.classId) {
      // Deep-link to a specific class + tab from notification
      fetch(`/api/classes/${payload.classId}?school_id=${selectedSchoolId}`)
        .then(r => r.json())
        .then(data => {
          if (data?.id) {
            setSelectedClass({ id: data.id, grade: data.grade, section: data.section, class_teacher_name: null })
            setClassViewInitialTab(payload.tab)
            setClassViewOpenExamId(payload.examId)
            navigateTo('class-view')
          }
        })
        .catch(() => {})
    } else {
      setClassViewInitialTab(undefined)
      setClassViewOpenExamId(undefined)
      navigateTo(key)
    }
  }

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

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Home</Link>
          <span className="text-gray-200">|</span>
          <nav className="flex items-center gap-1 text-sm text-gray-400">
            <span>Home</span>
            <span>/</span>
            {activeNav === 'class-view' && selectedClass ? (
              <>
                <button onClick={() => navigateTo('snapshot')} className="hover:text-blue-600 transition-colors">Smart Snapshot</button>
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
          <NotificationBell teacherId={teacher.id} onNavigate={handleNavigate} />
          <button onClick={() => { setTeacher(null); setSelectedTeacherId('') }}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded">
            Switch
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-52 bg-slate-900 flex-shrink-0 flex flex-col">
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

          <nav className="flex-1 py-3 overflow-y-auto">
            {NAV_SECTIONS.map(section => (
              <div key={section.label} className="mb-2">
                <p className="px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{section.label}</p>
                {section.items.map(item => (
                  <button key={item.key} onClick={() => {
                    if (item.comingSoon) return
                    navigateTo(item.key)
                  }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                      item.comingSoon ? 'text-slate-600 cursor-not-allowed'
                        : activeNav === item.key ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}>
                    {item.icon}
                    <span>{item.label}</span>
                    {item.comingSoon && <span className="ml-auto text-[9px] text-slate-600 font-medium">Soon</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>

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

        <main className="flex-1 overflow-y-auto p-6">
          {visitedNav.has('snapshot') && <div hidden={activeNav !== 'snapshot'}><SmartSnapshot teacher={teacher} schoolId={parseInt(selectedSchoolId)} onNavigate={navigateTo} onViewClass={cls => { setSelectedClass(cls); navigateTo('class-view') }} /></div>}
          {/* class-view remounts on class change via key */}
          {visitedNav.has('class-view') && selectedClass && <div hidden={activeNav !== 'class-view'}><ClassView key={selectedClass.id} classId={selectedClass.id} grade={selectedClass.grade} section={selectedClass.section} schoolId={parseInt(selectedSchoolId)} teacherName={teacher.name} teacherId={teacher.id} isClassTeacher={teacher.class_teacher_grade === selectedClass.grade && teacher.class_teacher_section === selectedClass.section} teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} onBack={() => navigateTo('snapshot')} initialTab={classViewInitialTab} openExamId={classViewOpenExamId} /></div>}
          {visitedNav.has('timetable')     && <div hidden={activeNav !== 'timetable'}><FullTimetable teacherId={teacher.id} schoolId={parseInt(selectedSchoolId)} /></div>}
          {visitedNav.has('attendance')    && <div hidden={activeNav !== 'attendance'}><Attendance teacherId={teacher.id} schoolId={parseInt(selectedSchoolId)} /></div>}
          {visitedNav.has('leave')         && <div hidden={activeNav !== 'leave'}><TeacherLeave teacherId={teacher.id} schoolId={parseInt(selectedSchoolId)} /></div>}
          {visitedNav.has('profile')       && <div hidden={activeNav !== 'profile'}><TeacherProfile teacher={teacher} onUpdate={setTeacher} /></div>}
          {visitedNav.has('tasks')         && <div hidden={activeNav !== 'tasks'}><TasksPage teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={parseInt(selectedSchoolId)} /></div>}
          {visitedNav.has('my-classes')    && <div hidden={activeNav !== 'my-classes'}><MyClasses teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={parseInt(selectedSchoolId)} onViewClass={cls => { setSelectedClass(cls); navigateTo('class-view') }} /></div>}
          {visitedNav.has('my-students')   && <div hidden={activeNav !== 'my-students'}><MyStudents teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject, department: teacher.department, class_teacher_grade: teacher.class_teacher_grade, class_teacher_section: teacher.class_teacher_section }} schoolId={parseInt(selectedSchoolId)} /></div>}
          {visitedNav.has('doubts')        && <div hidden={activeNav !== 'doubts'}><DoubtsCenter teacher={{ id: teacher.id, name: teacher.name, subject: teacher.subject }} schoolId={parseInt(selectedSchoolId)} /></div>}
          {visitedNav.has('syllabus')      && <div hidden={activeNav !== 'syllabus'}><SyllabusWrapper teacher={teacher} schoolId={parseInt(selectedSchoolId)} selectedClass={selectedClass} /></div>}
          {visitedNav.has('test-calendar') && <div hidden={activeNav !== 'test-calendar'}><TestCalendar mode="teacher" schoolId={parseInt(selectedSchoolId)} teacherId={teacher.id} /></div>}
          {['performance', 'messages'].includes(activeNav) && (
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
