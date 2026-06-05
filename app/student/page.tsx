'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import StudentDashboard from './components/StudentDashboard'
import StudentTasks from './components/StudentTasks'
import StudentDoubts from './components/StudentDoubts'
import StudentNewspaper from './components/StudentNewspaper'
import StudentRewards from './components/StudentRewards'
import StudentSyllabus from './components/StudentSyllabus'
import StudentProfile from './components/StudentProfile'
import StudentMarks from './components/StudentMarks'
import StudentTimetable from './components/StudentTimetable'
import WeeklyTest from './components/WeeklyTest'
import StudentHub from './components/StudentHub'
import NotificationBell from '../components/NotificationBell'
import TestCalendar from '../components/TestCalendar'
import FloatingAIChat from '../components/FloatingAIChat'

type School = { id: number; name: string; city: string; country: string; status: string }
type ClassOption = { id: number; grade: string; section: string }
type StudentBasic = { id: number; name: string; roll_number: string }
type Student = {
  id: number; name: string; grade: string; section: string; roll_number: string
  email: string | null; phone: string | null; parent_name: string | null; parent_phone: string | null
  school_id: number
}

type NavItem = { key: string; label: string; icon: React.ReactNode; comingSoon?: boolean }

type NavSection = { label: string; items: NavItem[] }

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'HOME',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
      { key: 'timetable', label: 'My Timetable', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    ],
  },
  {
    label: 'LEARNING',
    items: [
      { key: 'tasks', label: 'Homework', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l-3 3-1.5-1.5" /></svg> },
      { key: 'syllabus', label: 'Syllabus', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
      { key: 'doubts', label: 'My Doubts', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { key: 'newspaper', label: 'Daily Knowledge', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg> },
    ],
  },
  {
    label: 'ACADEMIC',
    items: [
      { key: 'my-marks', label: 'My Marks', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
      { key: 'weekly-test', label: 'Weekly Test', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
      { key: 'rewards', label: 'Rewards', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
    ],
  },
  {
    label: 'STUDENT HUB',
    items: [
      { key: 'hub', label: 'Daily Hub', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { key: 'profile', label: 'Profile', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
    ],
  },
]

// Flat list for visited tracking compatibility
const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(s => s.items)

export default function StudentPortal() {
  const [schools, setSchools] = useState<School[]>([])
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [students, setStudents] = useState<StudentBasic[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [student, setStudent] = useState<Student | null>(null)
  const [activeNav, setActiveNav] = useState('dashboard')
  const [visitedNav, setVisitedNav] = useState<Set<string>>(new Set(['dashboard']))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  function navigateTo(key: string) { setActiveNav(key); setVisitedNav(prev => new Set([...prev, key])); setSidebarOpen(false) }
  const [showSandbox, setShowSandbox] = useState(false)
  const [loading, setLoading] = useState(true)
  const [studentLoading, setStudentLoading] = useState(false)
  const [error, setError] = useState('')
  const [sandboxSchoolName, setSandboxSchoolName] = useState('')
  const [sandboxGrade, setSandboxGrade] = useState('')
  const [sandboxSection, setSandboxSection] = useState('A')
  const [sandboxStudentName, setSandboxStudentName] = useState('')
  const [sandboxCreating, setSandboxCreating] = useState(false)
  const [sandboxError, setSandboxError] = useState('')

  async function handleSandboxCreate() {
    if (!sandboxSchoolName.trim() || !sandboxGrade.trim() || !sandboxStudentName.trim()) {
      setSandboxError('Please fill in School Name, Grade, and Student Name.')
      return
    }
    setSandboxCreating(true)
    setSandboxError('')
    try {
      // 1. Create school
      const schoolRes = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sandboxSchoolName.trim(),
          tier: 'premium',
          city: 'Sandbox',
          country: 'India'
        })
      })
      const schoolData = await schoolRes.json()
      if (!schoolRes.ok) throw new Error(schoolData.error || 'Failed to create school')

      // Refresh schools list
      const schoolsRes = await fetch('/api/schools')
      const schoolsData = await schoolsRes.json()
      const activeSchools = schoolsData.filter((s: School) => s.status === 'active')
      setSchools(activeSchools)

      // 2. Create student
      const studentRes = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolData.id,
          name: sandboxStudentName.trim(),
          grade: sandboxGrade.trim(),
          section: (sandboxSection || 'A').trim(),
          roll_number: 'SB' + Math.floor(100 + Math.random() * 900)
        })
      })
      const studentData = await studentRes.json()
      if (!studentRes.ok) throw new Error(studentData.error || 'Failed to create student')

      // 3. Fetch classes
      const classRes = await fetch(`/api/classes?school_id=${schoolData.id}`)
      const classData = await classRes.json()
      setClasses(classData)
      const matchedClass = classData.find((c: ClassOption) => c.grade === sandboxGrade.trim() && c.section === (sandboxSection || 'A').trim())

      // 4. Log in
      setSelectedSchoolId(String(schoolData.id))
      if (matchedClass) {
        setSelectedClassId(String(matchedClass.id))
      }
      setSelectedStudentId(String(studentData.id))
      setStudent(studentData)

      // Reset sandbox form
      setSandboxSchoolName('')
      setSandboxGrade('')
      setSandboxSection('A')
      setSandboxStudentName('')
      setShowSandbox(false)
    } catch (err: any) {
      setSandboxError(err.message || 'An error occurred during sandbox creation.')
    } finally {
      setSandboxCreating(false)
    }
  }

  const LS_KEY = 'wlyl_student_session'
  const pendingRestore = useRef<{ schoolId: string; classId: string; studentId: string } | null>(null)

  useEffect(() => {
    fetch('/api/schools')
      .then(r => r.json())
      .then((data: School[]) => {
        const active = data.filter((s: School) => s.status === 'active')
        setSchools(active)
        try {
          const saved = localStorage.getItem(LS_KEY)
          if (saved) {
            const sess = JSON.parse(saved)
            if (active.find((s: School) => s.id === parseInt(sess.schoolId))) {
              pendingRestore.current = sess
              setSelectedSchoolId(String(sess.schoolId))
            }
          }
        } catch { }
      })
      .catch(() => setError('Cannot connect to database'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedSchoolId) { setClasses([]); setSelectedClassId(''); return }
    fetch(`/api/classes?school_id=${selectedSchoolId}`)
      .then(r => r.json())
      .then(data => {
        const sorted = Array.isArray(data) ? data.sort((a: ClassOption, b: ClassOption) => {
          const ga = parseInt(a.grade) || 0
          const gb = parseInt(b.grade) || 0
          if (ga !== gb) return ga - gb
          return a.section.localeCompare(b.section)
        }) : []
        setClasses(sorted)
        const pr = pendingRestore.current
        if (pr && pr.schoolId === selectedSchoolId && sorted.find((c: ClassOption) => c.id === parseInt(pr.classId))) {
          setSelectedClassId(pr.classId)
        } else {
          setSelectedClassId('')
        }
      })
  }, [selectedSchoolId])

  useEffect(() => {
    if (!selectedSchoolId || !selectedClassId) { setStudents([]); setSelectedStudentId(''); return }
    const cls = classes.find(c => c.id === parseInt(selectedClassId))
    if (!cls) return
    fetch(`/api/students?school_id=${selectedSchoolId}&grade=${cls.grade}&section=${cls.section}`)
      .then(r => r.json())
      .then(data => {
        const sorted = Array.isArray(data) ? data.sort((a: StudentBasic & { roll_number: string }, b: StudentBasic & { roll_number: string }) => {
          const ra = parseInt(a.roll_number) || 999
          const rb = parseInt(b.roll_number) || 999
          return ra - rb
        }) : []
        setStudents(sorted)
        const pr = pendingRestore.current
        if (pr && pr.classId === selectedClassId && sorted.find((s: StudentBasic) => s.id === parseInt(pr.studentId))) {
          setSelectedStudentId(pr.studentId)
        } else {
          setSelectedStudentId('')
        }
      })
  }, [selectedSchoolId, selectedClassId, classes])

  useEffect(() => {
    if (!selectedStudentId) { setStudent(null); return }
    setStudentLoading(true)
    fetch(`/api/students/${selectedStudentId}`)
      .then(r => r.json())
      .then(data => {
        setStudent({ ...data, school_id: parseInt(selectedSchoolId) })
        pendingRestore.current = null
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ schoolId: selectedSchoolId, classId: selectedClassId, studentId: selectedStudentId }))
        } catch { }
      })
      .finally(() => setStudentLoading(false))
  }, [selectedStudentId, selectedSchoolId, selectedClassId])

  const selectedSchool = schools.find(s => s.id === parseInt(selectedSchoolId))
  const selectedClass = classes.find(c => c.id === parseInt(selectedClassId))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!student) {
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
          <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-3 py-1 rounded-full ml-auto">Student Portal</span>
        </div>

        <div className="max-w-md mx-auto px-6 py-16">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-6">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">Student Portal</h1>
            <p className="text-sm text-gray-500">Select your school, class, and name to continue</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
              <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-300">
                <option value="">— Select school —</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                disabled={!selectedSchoolId || classes.length === 0}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-300 disabled:opacity-50">
                <option value="">— Select class —</option>
                {classes.map(c => <option key={c.id} value={c.id}>Grade {c.grade}-{c.section}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}
                disabled={!selectedClassId || students.length === 0}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-300 disabled:opacity-50">
                <option value="">— Select student —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}{s.roll_number ? ` (${s.roll_number})` : ''}</option>)}
              </select>
            </div>
            {studentLoading && <p className="text-center text-sm text-gray-400">Loading profile...</p>}
          </div>

          {/* Developer Sandbox Helper */}
          <div className="mt-6 bg-slate-900 rounded-xl border border-slate-800 text-white overflow-hidden shadow-xl transition-all">
            <button
              onClick={() => setShowSandbox(!showSandbox)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-lg">🧪</span>
                <span className="font-semibold text-sm tracking-wide text-slate-200 uppercase">Developer Sandbox Helper</span>
              </div>
              <svg
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${showSandbox ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showSandbox && (
              <div className="px-6 pb-6 pt-2 border-t border-slate-800 space-y-4 text-left">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Use this sandbox tool to quickly register a new school (Premium) and onboard a student. You will be logged in immediately.
                </p>

                {sandboxError && (
                  <div className="bg-red-950/60 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-xs">
                    {sandboxError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">School Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Westside Academy"
                      value={sandboxSchoolName}
                      onChange={e => setSandboxSchoolName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-yellow-400 transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">Grade</label>
                      <input
                        type="text"
                        placeholder="e.g. 9"
                        value={sandboxGrade}
                        onChange={e => setSandboxGrade(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-yellow-400 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">Section</label>
                      <input
                        type="text"
                        placeholder="e.g. A"
                        value={sandboxSection}
                        onChange={e => setSandboxSection(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-yellow-400 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">Student Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Elena Rostova"
                      value={sandboxStudentName}
                      onChange={e => setSandboxStudentName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-yellow-400 transition"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={sandboxCreating}
                  onClick={handleSandboxCreate}
                  className="w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-slate-950 font-bold py-2.5 rounded-lg text-sm transition shadow-lg hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sandboxCreating ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating Account...
                    </>
                  ) : (
                    <span>✨ Auto-Create & Log In</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setSidebarOpen(o => !o)} className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm hidden sm:inline">← Home</Link>
          <span className="text-gray-200 hidden sm:inline">|</span>
          <nav className="hidden sm:flex items-center gap-1 text-sm text-gray-400">
            <span>Home</span>
            <span>/</span>
            <span className="text-gray-700 font-medium">
              {NAV_ITEMS.find(i => i.key === activeNav)?.label || 'Dashboard'}
            </span>
          </nav>
          <span className="sm:hidden text-sm font-medium text-gray-700">
            {NAV_ITEMS.find(i => i.key === activeNav)?.label || 'Dashboard'}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <p className="hidden sm:block text-sm font-medium text-gray-800">
            {student.name} · Grade {student.grade}-{student.section}
          </p>
          <NotificationBell
            studentId={student.id}
            onNavigate={navigateTo}
          />
          <button onClick={() => { setStudent(null); setSelectedStudentId('') }}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded">
            Switch
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-40 lg:relative lg:inset-y-auto lg:left-auto w-56 bg-gradient-to-b from-slate-950 via-[#0e1320] to-slate-950 border-r border-slate-900/60 shadow-[4px_0_24px_-4px_rgba(0,0,0,0.4)] flex-shrink-0 flex flex-col transform transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="px-5 py-5 border-b border-slate-900/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-yellow-500/20">
                <span className="text-slate-950 text-sm font-black tracking-wider">W</span>
              </div>
              <span className="text-white font-extrabold text-base tracking-wide">WLYL</span>
            </div>
            
            {/* School & Class Glassmorphism Card */}
            {(selectedSchool || selectedClass) && (
              <div className="mt-4 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm shadow-inner">
                {selectedSchool && (
                  <p className="text-slate-200 text-xs font-semibold truncate leading-tight flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                    {selectedSchool.name}
                  </p>
                )}
                {selectedClass && (
                  <p className="text-slate-400 text-[11px] font-medium mt-1 pl-3">
                    Grade {selectedClass.grade}-{selectedClass.section}
                  </p>
                )}
              </div>
            )}
          </div>

          <nav className="flex-1 py-3 overflow-y-auto px-2 space-y-1">
            {NAV_SECTIONS.map(section => (
              <div key={section.label} className="mb-2">
                <p className="px-3 pt-3 pb-1 text-[9px] font-bold text-slate-500/90 tracking-widest uppercase select-none">{section.label}</p>
                {section.items.map(item => {
                  const isActive = activeNav === item.key
                  return (
                    <button key={item.key}
                      onClick={() => { if (!item.comingSoon) navigateTo(item.key) }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 text-left group ${
                        item.comingSoon
                          ? 'text-slate-600 cursor-not-allowed'
                          : isActive
                            ? 'bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent text-yellow-400 border-r-2 border-yellow-500 shadow-[inset_-6px_0_12px_-6px_rgba(234,179,8,0.2)] pl-4 scale-[1.01]'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 hover:pl-4 hover:scale-[1.01]'
                      }`}>
                      <span className={`transition-colors duration-200 ${isActive ? 'text-yellow-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.comingSoon && (
                        <span className="text-[8px] bg-slate-900 border border-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-bold tracking-wider">SOON</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* Profile block */}
          <div className="px-5 py-4 border-t border-slate-900/60 bg-slate-950/40 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 rounded-full flex items-center justify-center shadow-md">
                  <span className="text-yellow-400 text-xs font-black uppercase">{student.name.charAt(0)}</span>
                </div>
                {/* Active online status light */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-950 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-slate-100 text-xs font-semibold truncate leading-tight">{student.name}</p>
                <p className="text-slate-500 text-[10px] font-medium mt-0.5">Roll No: {student.roll_number || '—'}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Floating AI Tutor */}
        <FloatingAIChat
          mode="student"
          studentId={student.id}
          studentName={student.name}
          grade={student.grade}
          schoolId={student.school_id}
          classId={parseInt(selectedClassId)}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="max-w-4xl mx-auto">
            {visitedNav.has('dashboard')   && <div hidden={activeNav !== 'dashboard'}><StudentDashboard student={student} classId={parseInt(selectedClassId)} schoolId={parseInt(selectedSchoolId)} onNavigate={navigateTo} /></div>}
            {visitedNav.has('tasks')       && <div hidden={activeNav !== 'tasks'}><StudentTasks student={student} classId={parseInt(selectedClassId)} schoolId={parseInt(selectedSchoolId)} /></div>}
            {visitedNav.has('doubts')      && <div hidden={activeNav !== 'doubts'}><StudentDoubts student={student} classId={parseInt(selectedClassId)} schoolId={parseInt(selectedSchoolId)} /></div>}
            {visitedNav.has('newspaper')   && <div hidden={activeNav !== 'newspaper'}><StudentNewspaper studentId={student.id} schoolId={parseInt(selectedSchoolId)} /></div>}
            {visitedNav.has('rewards')     && <div hidden={activeNav !== 'rewards'}><StudentRewards studentId={student.id} schoolId={parseInt(selectedSchoolId)} classId={parseInt(selectedClassId)} grade={student.grade} /></div>}
            {visitedNav.has('syllabus')    && <div hidden={activeNav !== 'syllabus'}><StudentSyllabus schoolId={parseInt(selectedSchoolId)} classId={parseInt(selectedClassId)} /></div>}
            {visitedNav.has('my-marks')    && <div hidden={activeNav !== 'my-marks'}><StudentMarks studentId={student.id} schoolId={parseInt(selectedSchoolId)} classId={parseInt(selectedClassId)} /></div>}
            {visitedNav.has('weekly-test') && (
                <div hidden={activeNav !== 'weekly-test'}>
                  <div className="space-y-6">
                    <WeeklyTest student={student} classId={parseInt(selectedClassId)} schoolId={parseInt(selectedSchoolId)} />
                    <div className="border-t border-gray-100 pt-6">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Exam Calendar</p>
                      <TestCalendar mode="student" schoolId={parseInt(selectedSchoolId)} classId={parseInt(selectedClassId)} studentId={student.id} />
                    </div>
                  </div>
                </div>
              )}
            {visitedNav.has('timetable')   && <div hidden={activeNav !== 'timetable'}><StudentTimetable classId={parseInt(selectedClassId)} schoolId={parseInt(selectedSchoolId)} grade={student.grade} section={student.section} /></div>}
            {visitedNav.has('hub')         && <div hidden={activeNav !== 'hub'}><StudentHub studentId={student.id} schoolId={parseInt(selectedSchoolId)} grade={student.grade} /></div>}
            {visitedNav.has('profile')     && <div hidden={activeNav !== 'profile'}><StudentProfile student={student} /></div>}
          </div>
        </main>
      </div>
    </div>
  )
}
