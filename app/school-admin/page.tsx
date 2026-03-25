'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Overview from './components/Overview'
import LeaveRequests from './components/LeaveRequests'
import StaffOnboarding from './components/StaffOnboarding'
import StudentOnboarding from './components/StudentOnboarding'
import ClassManagement from './components/ClassManagement'
import StudentTeacherAnalysis from './components/StudentTeacherAnalysis'
import TeachersManagement from './components/TeachersManagement'
import StudentsManagement from './components/StudentsManagement'
import CurriculumManagement from './components/CurriculumManagement'
import TimetableManagement from './components/TimetableManagement'
import AttendanceDashboard from './components/AttendanceDashboard'
import EmergencyCover from './components/EmergencyCover'
import NotificationBell from '../components/NotificationBell'
import { useRouter } from 'next/navigation'

type School = {
  id: number
  name: string
  type: string
  city: string
  country: string
  status: string
}

type Tier = 'none' | 'basic' | 'standard' | 'premium'

type NavItem = {
  key: string
  label: string
  icon: React.ReactNode
  tier: Tier[]
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'overview',
    label: 'Overview',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    key: 'attendance',
    label: 'Attendance',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'leave-requests',
    label: 'Leave Requests',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'emergency-cover',
    label: 'Emergency Cover',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  {
    key: 'staff-onboarding',
    label: 'Staff Onboarding',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    key: 'student-onboarding',
    label: 'Student Onboarding',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: 'class-management',
    label: 'Class Management',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    key: 'analysis',
    label: 'Analysis',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: 'curriculum',
    label: 'Curriculum',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'timetable',
    label: 'Timetable',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'teachers',
    label: 'Teachers',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: 'students',
    label: 'Students',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
      </svg>
    ),
  },
]

const LOCKED_FEATURES = [
  { label: 'Parent Communication', tier: 'Standard' },
  { label: 'Fee Management', tier: 'Standard' },
  { label: 'Exam & Marks Management', tier: 'Standard' },
  { label: 'Report Card Generation', tier: 'Standard' },
  { label: 'AI-Powered Analytics', tier: 'Premium' },
  { label: 'Multi-Branch Management', tier: 'Premium' },
]

export default function SchoolAdmin() {
  const router = useRouter()
  const [schools, setSchools] = useState<School[]>([])
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [tier, setTier] = useState<Tier>('none')
  const [activeNav, setActiveNav] = useState('overview')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  useEffect(() => {
    async function init() {
      try {
        await fetch('/api/init')
        const res = await fetch('/api/schools')
        const data: School[] = await res.json()
        const active = data.filter(s => s.status === 'active')
        setSchools(active)
        if (active.length > 0) {
          setSelectedSchool(active[0])
        }
      } catch {
        setError('Cannot connect to database. Make sure PostgreSQL is running.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!selectedSchool) return
    fetch(`/api/schools/${selectedSchool.id}/subscription`)
      .then(r => r.json())
      .then(data => setTier(data.tier || 'none'))
      .catch(() => setTier('none'))
  }, [selectedSchool])

  function switchSchool(school: School) {
    setSelectedSchool(school)
    setDropdownOpen(false)
    setActiveNav('overview')
  }

  const enabledNavItems = NAV_ITEMS.filter(item => tier !== 'none' && item.tier.includes(tier))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-5 py-3.5 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Home</Link>
          <span className="text-gray-200">|</span>

          {/* School switcher */}
          {schools.length > 0 ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                {selectedSchool?.name || 'Select School'}
                <svg className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Switch School</p>
                  </div>
                  {schools.map(school => (
                    <button
                      key={school.id}
                      onClick={() => switchSchool(school)}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                        selectedSchool?.id === school.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedSchool?.id === school.id ? 'bg-blue-500' : 'bg-gray-300'}`} />
                      <div>
                        <div className="font-medium">{school.name}</div>
                        <div className="text-xs text-gray-400">{[school.city, school.country].filter(Boolean).join(', ') || school.type}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm text-gray-400">No active schools</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {tier !== 'none' && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
              tier === 'basic' ? 'bg-green-100 text-green-700' :
              tier === 'standard' ? 'bg-blue-100 text-blue-700' :
              'bg-purple-100 text-purple-700'
            }`}>
              {tier} plan
            </span>
          )}
          {selectedSchool && (
            <NotificationBell schoolId={selectedSchool.id} onNavigate={setActiveNav} />
          )}
          <span className="bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1 rounded-full">School Admin</span>
          <button onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors">
            Logout
          </button>
        </div>
      </div>

      {dropdownOpen && <div className="fixed inset-0 z-20" onClick={() => setDropdownOpen(false)} />}

      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-6 py-3 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {!selectedSchool ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-400 text-lg">No active schools available.</p>
            <p className="text-gray-300 text-sm mt-2">Go to Platform Admin to create and activate a school first.</p>
            <Link href="/platform-admin" className="inline-block mt-4 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Go to Platform Admin
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <aside className="w-56 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col">
            {/* School info in sidebar */}
            <div className="px-4 py-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm mb-2">
                {selectedSchool.name.charAt(0).toUpperCase()}
              </div>
              <p className="text-sm font-semibold text-gray-800 leading-tight">{selectedSchool.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{[selectedSchool.city, selectedSchool.country].filter(Boolean).join(', ') || selectedSchool.type}</p>
            </div>

            {/* Nav */}
            <nav className="flex-1 py-3 overflow-y-auto">
              {tier === 'none' ? (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 leading-relaxed">No plan enabled for this school.</p>
                  <Link href={`/platform-admin/schools/${selectedSchool.id}`} className="text-xs text-purple-600 hover:text-purple-800 mt-2 block font-medium">
                    Enable a plan →
                  </Link>
                </div>
              ) : (
                <>
                  <p className="px-4 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Basic Features</p>
                  {enabledNavItems.map(item => (
                    <button
                      key={item.key}
                      onClick={() => setActiveNav(item.key)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                        activeNav === item.key
                          ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}

                  {/* Locked features */}
                  {(tier === 'basic' || tier === 'standard') && (
                    <>
                      <div className="px-4 pt-4 pb-1">
                        <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">Locked Features</p>
                      </div>
                      {LOCKED_FEATURES.filter(f => tier === 'basic' || f.tier === 'Premium').map(f => (
                        <div key={f.label} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 cursor-not-allowed select-none">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span>{f.label}</span>
                          <span className="ml-auto text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-medium">{f.tier}</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6">
            {tier === 'none' ? (
              <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="text-center max-w-sm">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">No Plan Enabled</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    This school doesn&apos;t have an active plan. Enable a Basic, Standard, or Premium plan from Platform Admin to unlock features.
                  </p>
                  <Link
                    href={`/platform-admin/schools/${selectedSchool.id}`}
                    className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    Enable Plan for {selectedSchool.name}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {activeNav === 'overview' && <Overview schoolId={selectedSchool.id} onNavigate={setActiveNav} />}
                {activeNav === 'attendance' && <AttendanceDashboard schoolId={selectedSchool.id} />}
                {activeNav === 'leave-requests' && <LeaveRequests schoolId={selectedSchool.id} />}
                {activeNav === 'emergency-cover' && <EmergencyCover schoolId={selectedSchool.id} />}
                {activeNav === 'staff-onboarding' && <StaffOnboarding schoolId={selectedSchool.id} />}
                {activeNav === 'student-onboarding' && <StudentOnboarding schoolId={selectedSchool.id} />}
                {activeNav === 'class-management' && <ClassManagement schoolId={selectedSchool.id} />}
                {activeNav === 'analysis' && <StudentTeacherAnalysis schoolId={selectedSchool.id} />}
                {activeNav === 'curriculum' && <CurriculumManagement schoolId={selectedSchool.id} />}
                {activeNav === 'timetable' && <TimetableManagement schoolId={selectedSchool.id} />}
                {activeNav === 'teachers' && <TeachersManagement schoolId={selectedSchool.id} />}
                {activeNav === 'students' && <StudentsManagement schoolId={selectedSchool.id} />}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
