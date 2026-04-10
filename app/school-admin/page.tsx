'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FeaturesProvider } from './features-context'
import Overview from './components/Overview'
import ClassAnalytics from './components/ClassAnalytics'
import LeaveRequests from './components/LeaveRequests'
import StaffOnboarding from './components/StaffOnboarding'
import StudentOnboarding from './components/StudentOnboarding'
import ClassManagement from './components/ClassManagement'
import StudentTeacherAnalysis from './components/StudentTeacherAnalysis'
import TeachersManagement from './components/TeachersManagement'
import StudentsManagement from './components/StudentsManagement'
import TimetableManagement from './components/TimetableManagement'
import AttendanceDashboard from './components/AttendanceDashboard'
import EmergencyCover from './components/EmergencyCover'
import ExamSchedule from './components/ExamSchedule'
import AcademicAnalytics from './components/AcademicAnalytics'
import AnnouncementBoard from './components/AnnouncementBoard'
import AcademicCalendar from './components/AcademicCalendar'
import SchoolSettings from './components/SchoolSettings'
import StudentLeaderboard from './components/StudentLeaderboard'
import ExportCenter from './components/ExportCenter'
import ParentEngagement from './components/ParentEngagement'
import YearRollover from './components/YearRollover'
import NotificationCenter from './components/NotificationCenter'
import DailyBriefing from './components/DailyBriefing'
import FeeManagement from './components/FeeManagement'
import YearReview from './components/YearReview'
import CommandBar from './components/CommandBar'
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
  tier?: Tier[]  // kept for reference only — actual visibility driven by platform feature config
}

// Section grouping for sidebar
const NAV_SECTIONS = [
  { label: 'OVERVIEW', keys: ['overview', 'briefing'] },
  { label: 'PEOPLE', keys: ['teachers', 'students', 'staff-onboarding', 'student-onboarding'] },
  { label: 'SCHEDULING', keys: ['timetable', 'attendance', 'leave-requests', 'emergency-cover', 'exam-schedule'] },
  { label: 'MANAGEMENT', keys: ['class-management', 'fee-management', 'parent-engagement', 'year-rollover'] },
  { label: 'ANALYTICS', keys: ['class-analytics', 'academic-analytics', 'analysis', 'year-review'] },
  { label: 'COMMUNICATION', keys: ['announcements', 'notifications', 'leaderboard'] },
  { label: 'TOOLS', keys: ['calendar', 'export', 'settings'] },
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

  function navigateTo(key: string) {
    setActiveNav(key)
    setVisited(prev => new Set([...prev, key]))
  }
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
            <nav className="flex-1 py-2 overflow-y-auto">
              {tier === 'none' ? (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 leading-relaxed">No plan enabled for this school.</p>
                  <Link href={`/platform-admin/schools/${selectedSchool.id}`} className="text-xs text-purple-600 hover:text-purple-800 mt-2 block font-medium">
                    Enable a plan →
                  </Link>
                </div>
              ) : (
                <>
                  {NAV_SECTIONS.map(section => {
                    const sectionEnabled = enabledNavItems.filter(i => section.keys.includes(i.key))
                    if (sectionEnabled.length === 0) return null
                    return (
                      <div key={section.label} className="mb-1">
                        <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-gray-300 uppercase tracking-widest">{section.label}</p>
                        {sectionEnabled.map(item => (
                          <button
                            key={item.key}
                            onClick={() => navigateTo(item.key)}
                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-all text-left rounded-none ${
                              activeNav === item.key
                                ? 'bg-blue-50 text-blue-700 font-semibold border-r-[3px] border-blue-600'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                            }`}
                          >
                            <span className={activeNav === item.key ? 'text-blue-600' : 'text-gray-400'}>
                              {item.icon}
                            </span>
                            <span className="truncate">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })}

                  {/* Items with no section mapping — fallback flat list */}
                  {(() => {
                    const allSectioned = NAV_SECTIONS.flatMap(s => s.keys)
                    const unsectioned = enabledNavItems.filter(i => !allSectioned.includes(i.key))
                    if (unsectioned.length === 0) return null
                    return (
                      <div className="mb-1">
                        <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-gray-300 uppercase tracking-widest">MORE</p>
                        {unsectioned.map(item => (
                          <button
                            key={item.key}
                            onClick={() => navigateTo(item.key)}
                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-all text-left ${
                              activeNav === item.key
                                ? 'bg-blue-50 text-blue-700 font-semibold border-r-[3px] border-blue-600'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                            }`}
                          >
                            <span className={activeNav === item.key ? 'text-blue-600' : 'text-gray-400'}>{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Locked features */}
                  {NAV_ITEMS.filter(item => !enabledFeatures.has(item.key)).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-50">
                      <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-200 uppercase tracking-widest">Not in Plan</p>
                      {NAV_ITEMS.filter(item => !enabledFeatures.has(item.key)).map(item => (
                        <div key={item.key} className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-300 cursor-not-allowed select-none">
                          <svg className="w-4 h-4 flex-shrink-0 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span className="truncate text-gray-300">{item.label}</span>
                        </div>
                      ))}
                    </div>
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
              <FeaturesProvider value={enabledFeatures}>
                <CommandBar schoolId={selectedSchool.id} onNavigate={navigateTo} />
                {visited.has('overview')         && <div hidden={activeNav !== 'overview'}><Overview schoolId={selectedSchool.id} onNavigate={navigateTo} /></div>}
                {visited.has('attendance')       && <div hidden={activeNav !== 'attendance'}><AttendanceDashboard schoolId={selectedSchool.id} /></div>}
                {visited.has('leave-requests')   && <div hidden={activeNav !== 'leave-requests'}><LeaveRequests schoolId={selectedSchool.id} /></div>}
                {visited.has('emergency-cover')  && <div hidden={activeNav !== 'emergency-cover'}><EmergencyCover schoolId={selectedSchool.id} /></div>}
                {visited.has('staff-onboarding') && <div hidden={activeNav !== 'staff-onboarding'}><StaffOnboarding schoolId={selectedSchool.id} /></div>}
                {visited.has('student-onboarding') && <div hidden={activeNav !== 'student-onboarding'}><StudentOnboarding schoolId={selectedSchool.id} /></div>}
                {visited.has('class-management') && <div hidden={activeNav !== 'class-management'}><ClassManagement schoolId={selectedSchool.id} onNavigate={navigateTo} /></div>}
                {visited.has('analysis')         && <div hidden={activeNav !== 'analysis'}><StudentTeacherAnalysis schoolId={selectedSchool.id} /></div>}
                {visited.has('timetable')        && <div hidden={activeNav !== 'timetable'}><TimetableManagement schoolId={selectedSchool.id} /></div>}
                {visited.has('exam-schedule')    && <div hidden={activeNav !== 'exam-schedule'}><ExamSchedule schoolId={selectedSchool.id} /></div>}
                {visited.has('teachers')         && <div hidden={activeNav !== 'teachers'}><TeachersManagement schoolId={selectedSchool.id} /></div>}
                {visited.has('students')         && <div hidden={activeNav !== 'students'}><StudentsManagement schoolId={selectedSchool.id} /></div>}
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
