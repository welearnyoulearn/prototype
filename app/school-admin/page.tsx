'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { FeaturesProvider } from './features-context'
import NotificationBell from '../components/NotificationBell'
import { useRouter } from 'next/navigation'

// Always-loaded (small, needed immediately)
import Overview from './components/Overview'
import CommandBar from './components/CommandBar'

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
const AttendanceDashboard   = dynamic(() => import('./components/AttendanceDashboard'),   { loading: () => <ModuleSkeleton /> })
const LeaveRequests         = dynamic(() => import('./components/LeaveRequests'),          { loading: () => <ModuleSkeleton /> })
const EmergencyCover        = dynamic(() => import('./components/EmergencyCover'),         { loading: () => <ModuleSkeleton /> })
const StaffOnboarding       = dynamic(() => import('./components/StaffOnboarding'),        { loading: () => <ModuleSkeleton /> })
const StudentOnboarding     = dynamic(() => import('./components/StudentOnboarding'),      { loading: () => <ModuleSkeleton /> })
const ClassManagement       = dynamic(() => import('./components/ClassManagement'),        { loading: () => <ModuleSkeleton /> })
const StudentTeacherAnalysis= dynamic(() => import('./components/StudentTeacherAnalysis'), { loading: () => <ModuleSkeleton /> })
const TimetableManagement   = dynamic(() => import('./components/TimetableManagement'),    { loading: () => <ModuleSkeleton /> })
const ExamSchedule          = dynamic(() => import('./components/ExamSchedule'),           { loading: () => <ModuleSkeleton /> })
const TeachersManagement    = dynamic(() => import('./components/TeachersManagement'),     { loading: () => <ModuleSkeleton /> })
const StudentsManagement    = dynamic(() => import('./components/StudentsManagement'),     { loading: () => <ModuleSkeleton /> })
const ClassAnalytics        = dynamic(() => import('./components/ClassAnalytics'),         { loading: () => <ModuleSkeleton /> })
const AcademicAnalytics     = dynamic(() => import('./components/AcademicAnalytics'),      { loading: () => <ModuleSkeleton /> })
const AnnouncementBoard     = dynamic(() => import('./components/AnnouncementBoard'),      { loading: () => <ModuleSkeleton /> })
const AcademicCalendar      = dynamic(() => import('./components/AcademicCalendar'),       { loading: () => <ModuleSkeleton /> })
const StudentLeaderboard    = dynamic(() => import('./components/StudentLeaderboard'),     { loading: () => <ModuleSkeleton /> })
const ExportCenter          = dynamic(() => import('./components/ExportCenter'),           { loading: () => <ModuleSkeleton /> })
const SchoolSettings        = dynamic(() => import('./components/SchoolSettings'),         { loading: () => <ModuleSkeleton /> })
const DailyBriefing         = dynamic(() => import('./components/DailyBriefing'),          { loading: () => <ModuleSkeleton /> })
const NotificationCenter    = dynamic(() => import('./components/NotificationCenter'),     { loading: () => <ModuleSkeleton /> })
const ParentEngagement      = dynamic(() => import('./components/ParentEngagement'),       { loading: () => <ModuleSkeleton /> })
const YearRollover          = dynamic(() => import('./components/YearRollover'),           { loading: () => <ModuleSkeleton /> })
const FeeManagement         = dynamic(() => import('./components/FeeManagement'),          { loading: () => <ModuleSkeleton /> })
const YearReview            = dynamic(() => import('./components/YearReview'),             { loading: () => <ModuleSkeleton /> })

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
  tier?: Tier[]  // kept for reference only — actual visibility driven by platform feature config
}

// Section grouping for sidebar — Management first, then Scheduling
const NAV_SECTIONS = [
  { label: 'OVERVIEW',    keys: ['overview', 'briefing'] },
  { label: 'PEOPLE',      keys: ['staff', 'students', 'class-management'] },
  { label: 'MANAGEMENT',  keys: ['fee-management', 'parent-engagement', 'year-rollover'] },
  { label: 'SCHEDULING',  keys: ['timetable', 'attendance', 'leave-requests', 'emergency-cover', 'exam-schedule'] },
  { label: 'ANALYTICS',   keys: ['class-analytics', 'academic-analytics', 'analysis', 'year-review'] },
  { label: 'COMMUNICATION', keys: ['announcements', 'notifications', 'leaderboard'] },
  { label: 'TOOLS',       keys: ['calendar', 'export', 'settings'] },
]

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
    key: 'staff',
    label: 'Staff Management',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
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
    key: 'exam-schedule',
    label: 'Exam Schedule',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l-3 3-1.5-1.5" />
      </svg>
    ),
  },
  {
    key: 'students',
    label: 'Student Management',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
      </svg>
    ),
  },
  {
    key: 'class-analytics',
    label: 'Class Analytics',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'academic-analytics',
    label: 'Academic Analytics',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    key: 'announcements',
    label: 'Announcements',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    key: 'calendar',
    label: 'Academic Calendar',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
  {
    key: 'export',
    label: 'Export & Reports',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'settings',
    label: 'School Settings',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: 'briefing',
    label: 'Daily Briefing',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: 'notifications',
    label: 'Notifications',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    key: 'parent-engagement',
    label: 'Parent Engagement',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    key: 'year-rollover',
    label: 'Year Rollover',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    key: 'fee-management',
    label: 'Fee Management',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    key: 'year-review',
    label: 'Year-in-Review',
    tier: ['basic', 'standard', 'premium'],
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
]


export default function SchoolAdmin() {
  const router = useRouter()
  const [schools, setSchools] = useState<School[]>([])
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [tier, setTier] = useState<Tier>('none')
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set())
  const [activeNav, setActiveNav] = useState('overview')
  const [visited, setVisited] = useState<Set<string>>(new Set(['overview']))
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function navigateTo(key: string) {
    setActiveNav(key)
    setVisited(prev => new Set([...prev, key]))
    setSidebarOpen(false)
    if (key === 'staff') setStaffSubTab('directory')
    if (key === 'students') setStudentsSubTab('list')
  }
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [staffSubTab, setStaffSubTab] = useState<'directory' | 'onboard'>('directory')
  const [studentsSubTab, setStudentsSubTab] = useState<'list' | 'onboard'>('list')
  const [staffRefreshKey, setStaffRefreshKey] = useState(0)
  const [studentRefreshKey, setStudentRefreshKey] = useState(0)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  useEffect(() => {
    async function init() {
      try {
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
      .then(data => {
        const t = data.tier || 'none'
        setTier(t)
        if (t !== 'none') {
          // Fetch which features are enabled for this plan from platform config
          fetch(`/api/platform/features?tier=${t}`)
            .then(r => r.json())
            .then(fd => setEnabledFeatures(new Set(fd.enabled || [])))
            .catch(() => setEnabledFeatures(new Set(NAV_ITEMS.map(n => n.key))))
        }
      })
      .catch(() => setTier('none'))
  }, [selectedSchool])

  function switchSchool(school: School) {
    setSelectedSchool(school)
    setDropdownOpen(false)
    setActiveNav('overview')
    setVisited(new Set(['overview']))
  }

  // Only show nav items that are enabled in platform feature config for this tier
  const enabledNavItems = NAV_ITEMS.filter(item =>
    tier !== 'none' && enabledFeatures.has(item.key)
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-5">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-slate-700" />
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin absolute inset-0" />
        </div>
        <div className="text-center">
          <p className="text-slate-300 font-medium text-sm">Loading your dashboard</p>
          <p className="text-slate-500 text-xs mt-1">Please wait…</p>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-3 flex items-center justify-between flex-shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(o => !o)} className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm hidden sm:inline">← Home</Link>
          <span className="text-gray-200 hidden sm:inline">|</span>

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
            <span className={`hidden sm:inline-flex text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
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
          <button
            onClick={() => { const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }); window.dispatchEvent(e) }}
            className="hidden md:flex items-center gap-2 text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
            <kbd className="text-[10px] bg-gray-100 px-1 rounded font-mono">Ctrl K</kbd>
          </button>
          <span className="hidden sm:inline-flex bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1 rounded-full">School Admin</span>
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
        <div className="flex flex-1 overflow-hidden relative">
          {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
          {/* Sidebar */}
          <aside className={`fixed inset-y-0 left-0 z-40 lg:relative lg:inset-y-auto lg:left-auto w-60 bg-slate-900 flex-shrink-0 flex flex-col shadow-xl transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
            {/* School branding */}
            <div className="px-4 py-4 border-b border-slate-700/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg">
                  {selectedSchool.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-tight truncate">{selectedSchool.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{[selectedSchool.city, selectedSchool.country].filter(Boolean).join(', ') || selectedSchool.type || 'School'}</p>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
              {tier === 'none' ? (
                <div className="px-4 py-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <div>
                      <p className="text-xs text-slate-300 font-medium">No plan assigned</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Contact WLYL Admin to activate a plan for your school.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {NAV_SECTIONS.map(section => {
                    const sectionEnabled = enabledNavItems.filter(i => section.keys.includes(i.key))
                    if (sectionEnabled.length === 0) return null
                    return (
                      <div key={section.label} className="mb-1">
                        <p className="px-4 pt-4 pb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em]">{section.label}</p>
                        {sectionEnabled.map(item => {
                          const isActive = activeNav === item.key
                          return (
                            <button
                              key={item.key}
                              onClick={() => navigateTo(item.key)}
                              className={`w-full flex items-center gap-3 px-3 mx-1 py-2 text-sm transition-all text-left rounded-lg ${
                                isActive
                                  ? 'bg-indigo-600 text-white font-semibold shadow-md'
                                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                              }`}
                              style={{ width: 'calc(100% - 8px)' }}
                            >
                              <span className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}>
                                {item.icon}
                              </span>
                              <span className="truncate">{item.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}

                  {/* Items with no section mapping */}
                  {(() => {
                    const allSectioned = NAV_SECTIONS.flatMap(s => s.keys)
                    const unsectioned = enabledNavItems.filter(i => !allSectioned.includes(i.key))
                    if (unsectioned.length === 0) return null
                    return (
                      <div className="mb-1">
                        <p className="px-4 pt-4 pb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em]">MORE</p>
                        {unsectioned.map(item => {
                          const isActive = activeNav === item.key
                          return (
                            <button
                              key={item.key}
                              onClick={() => navigateTo(item.key)}
                              className={`w-full flex items-center gap-3 px-3 mx-1 py-2 text-sm transition-all text-left rounded-lg ${
                                isActive ? 'bg-indigo-600 text-white font-semibold shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                              }`}
                              style={{ width: 'calc(100% - 8px)' }}
                            >
                              <span className={isActive ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                              <span className="truncate">{item.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Locked features */}
                  {NAV_ITEMS.filter(item => !enabledFeatures.has(item.key)).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <p className="px-4 pb-1.5 text-[9px] font-bold text-slate-600 uppercase tracking-[0.15em]">Upgrade to Unlock</p>
                      {NAV_ITEMS.filter(item => !enabledFeatures.has(item.key)).map(item => (
                        <div key={item.key} className="flex items-center gap-3 px-4 py-1.5 text-sm text-slate-600 cursor-not-allowed select-none">
                          <svg className="w-4 h-4 flex-shrink-0 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="px-4 py-3 border-t border-slate-700/60">
              <p className="text-[10px] text-slate-600 text-center">WLYL School Management</p>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-3 sm:p-6">
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
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500">
                    📧 <a href="mailto:support@welearnyoulearn.com" className="text-indigo-600 hover:underline font-medium">support@welearnyoulearn.com</a>
                  </div>
                </div>
              </div>
            ) : (
              <FeaturesProvider value={enabledFeatures}>
                <CommandBar schoolId={selectedSchool.id} onNavigate={navigateTo} />
                {visited.has('overview')         && <div hidden={activeNav !== 'overview'}><Overview schoolId={selectedSchool.id} onNavigate={navigateTo} /></div>}
                {visited.has('attendance')       && <div hidden={activeNav !== 'attendance'}><AttendanceDashboard schoolId={selectedSchool.id} /></div>}
                {visited.has('leave-requests')   && <div hidden={activeNav !== 'leave-requests'}><LeaveRequests schoolId={selectedSchool.id} /></div>}
                {visited.has('emergency-cover')  && <div hidden={activeNav !== 'emergency-cover'}><EmergencyCover schoolId={selectedSchool.id} /></div>}
                {/* ── Staff Hub: Directory + Onboarding combined ── */}
                {visited.has('staff') && (
                  <div hidden={activeNav !== 'staff'}>
                    <div className="mb-5">
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Staff</h2>
                      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                        {([['directory', 'Staff Directory'], ['onboard', 'Onboard Staff']] as const).map(([key, label]) => (
                          <button key={key} onClick={() => setStaffSubTab(key)}
                            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-all ${staffSubTab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div hidden={staffSubTab !== 'directory'}><TeachersManagement schoolId={selectedSchool.id} refreshKey={staffRefreshKey} /></div>
                    <div hidden={staffSubTab !== 'onboard'}><StaffOnboarding schoolId={selectedSchool.id} onRefresh={() => { setStaffRefreshKey(k => k + 1); setStaffSubTab('directory') }} /></div>
                  </div>
                )}

                {/* ── Students Hub: List + Onboarding combined ── */}
                {visited.has('students') && (
                  <div hidden={activeNav !== 'students'}>
                    <div className="mb-5">
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Student Management</h2>
                      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                        {([['list', 'Student List'], ['onboard', 'Onboard Students']] as const).map(([key, label]) => (
                          <button key={key} onClick={() => setStudentsSubTab(key)}
                            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-all ${studentsSubTab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div hidden={studentsSubTab !== 'list'}><StudentsManagement schoolId={selectedSchool.id} refreshKey={studentRefreshKey} /></div>
                    <div hidden={studentsSubTab !== 'onboard'}><StudentOnboarding schoolId={selectedSchool.id} onRefresh={() => { setStudentRefreshKey(k => k + 1); setStudentsSubTab('list') }} /></div>
                  </div>
                )}

                {visited.has('class-management') && <div hidden={activeNav !== 'class-management'}><ClassManagement schoolId={selectedSchool.id} onNavigate={navigateTo} /></div>}
                {visited.has('analysis')         && <div hidden={activeNav !== 'analysis'}><StudentTeacherAnalysis schoolId={selectedSchool.id} /></div>}
                {visited.has('timetable')        && <div hidden={activeNav !== 'timetable'}><TimetableManagement schoolId={selectedSchool.id} /></div>}
                {visited.has('exam-schedule')    && <div hidden={activeNav !== 'exam-schedule'}><ExamSchedule schoolId={selectedSchool.id} /></div>}
                {visited.has('class-analytics')    && <div hidden={activeNav !== 'class-analytics'}><ClassAnalytics schoolId={selectedSchool.id} /></div>}
                {visited.has('academic-analytics') && <div hidden={activeNav !== 'academic-analytics'}><AcademicAnalytics schoolId={selectedSchool.id} /></div>}
                {visited.has('announcements')      && <div hidden={activeNav !== 'announcements'}><AnnouncementBoard schoolId={selectedSchool.id} /></div>}
                {visited.has('calendar')           && <div hidden={activeNav !== 'calendar'}><AcademicCalendar schoolId={selectedSchool.id} /></div>}
                {visited.has('leaderboard')        && <div hidden={activeNav !== 'leaderboard'}><StudentLeaderboard schoolId={selectedSchool.id} /></div>}
                {visited.has('export')             && <div hidden={activeNav !== 'export'}><ExportCenter schoolId={selectedSchool.id} /></div>}
                {visited.has('settings')           && <div hidden={activeNav !== 'settings'}><SchoolSettings schoolId={selectedSchool.id} /></div>}
                {visited.has('briefing')           && <div hidden={activeNav !== 'briefing'}><DailyBriefing schoolId={selectedSchool.id} onNavigate={navigateTo} /></div>}
                {visited.has('notifications')      && <div hidden={activeNav !== 'notifications'}><NotificationCenter schoolId={selectedSchool.id} /></div>}
                {visited.has('parent-engagement')  && <div hidden={activeNav !== 'parent-engagement'}><ParentEngagement schoolId={selectedSchool.id} /></div>}
                {visited.has('year-rollover')       && <div hidden={activeNav !== 'year-rollover'}><YearRollover schoolId={selectedSchool.id} /></div>}
                {visited.has('fee-management')      && <div hidden={activeNav !== 'fee-management'}><FeeManagement schoolId={selectedSchool.id} /></div>}
                {visited.has('year-review')         && <div hidden={activeNav !== 'year-review'}><YearReview schoolId={selectedSchool.id} /></div>}
              </FeaturesProvider>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
