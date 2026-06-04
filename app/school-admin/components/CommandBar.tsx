'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

type Result = {
  type: 'student' | 'teacher' | 'nav' | 'action'
  label: string
  sub?: string
  nav?: string
  action?: () => void
}

const QUICK_ACTIONS: Result[] = [
  { type: 'action', label: 'Add New Teacher',        sub: 'Open staff onboarding',       nav: 'staff' },
  { type: 'action', label: 'Add New Student',         sub: 'Open student onboarding',     nav: 'students' },
  { type: 'action', label: 'Create Announcement',     sub: 'Post to students & teachers', nav: 'announcements' },
  { type: 'action', label: 'Mark Attendance',         sub: 'Today\'s register',           nav: 'attendance' },
  { type: 'action', label: 'Collect Fee Payment',     sub: 'Record a payment',            nav: 'fee-management' },
  { type: 'action', label: 'Review Leave Requests',   sub: 'Pending approvals',           nav: 'leave-requests' },
  { type: 'action', label: 'View Timetable',          sub: 'Manage class schedules',      nav: 'timetable' },
  { type: 'action', label: 'Exam Schedule',           sub: 'Upcoming exams',              nav: 'exam-schedule' },
  { type: 'action', label: 'Fee Defaulters',          sub: 'Students with overdue fees',  nav: 'fee-management' },
  { type: 'action', label: 'School Settings',         sub: 'Configure school details',    nav: 'settings' },
]

const NAV_SEARCH: Result[] = [
  { type: 'nav', label: 'Overview',         sub: 'Dashboard',           nav: 'overview' },
  { type: 'nav', label: 'Attendance',       sub: 'Daily register',      nav: 'attendance' },
  { type: 'nav', label: 'Teachers',         sub: 'Staff management',    nav: 'staff' },
  { type: 'nav', label: 'Students',         sub: 'Student management',  nav: 'students' },
  { type: 'nav', label: 'Class Management', sub: 'Manage classes',      nav: 'class-management' },
  { type: 'nav', label: 'Timetable',        sub: 'Class schedules',     nav: 'timetable' },
  { type: 'nav', label: 'Exam Schedule',    sub: 'Exams & marks',       nav: 'exam-schedule' },
  { type: 'nav', label: 'Fee Management',   sub: 'Ledger, payments',    nav: 'fee-management' },
  { type: 'nav', label: 'Fee Ledger',       sub: 'View all entries',    nav: 'fee-management' },
  { type: 'nav', label: 'Fee Structure',    sub: 'Configure amounts',   nav: 'fee-management' },
  { type: 'nav', label: 'Defaulters',       sub: 'Overdue fees',        nav: 'fee-management' },
  { type: 'nav', label: 'Leave Requests',   sub: 'Staff leaves',        nav: 'leave-requests' },
  { type: 'nav', label: 'Announcements',    sub: 'Notice board',        nav: 'announcements' },
  { type: 'nav', label: 'Export & Reports', sub: 'Download data',       nav: 'export' },
  { type: 'nav', label: 'School Settings',  sub: 'Configuration',       nav: 'settings' },
  { type: 'nav', label: 'Emergency Cover',  sub: 'Substitute teachers', nav: 'emergency-cover' },
]

const TYPE_ICON: Record<string, string> = {
  student: '🎓',
  teacher: '👨‍🏫',
  nav:     '→',
  action:  '⚡',
}

const TYPE_COLOR: Record<string, string> = {
  student: 'text-blue-600 bg-blue-50',
  teacher: 'text-green-600 bg-green-50',
  nav:     'text-gray-600 bg-gray-100',
  action:  'text-purple-600 bg-purple-50',
}

type Props = {
  schoolId: number
  onNavigate: (key: string) => void
}

export default function CommandBar({ schoolId, onNavigate }: Props) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Recent nav history stored in sessionStorage
  const [recent, setRecent] = useState<Result[]>([])

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('cmd_recent') || '[]')
      setRecent(stored.slice(0, 5))
    } catch { setRecent([]) }
  }, [open])

  function addRecent(r: Result) {
    const stored = JSON.parse(sessionStorage.getItem('cmd_recent') || '[]') as Result[]
    const next = [r, ...stored.filter(x => x.label !== r.label)].slice(0, 5)
    sessionStorage.setItem('cmd_recent', JSON.stringify(next))
  }

  // Global Ctrl+K listener
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
        setResults([])
        setCursor(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)

    // Local nav/action search
    const lower = q.toLowerCase()
    const navMatches = NAV_SEARCH.filter(n => n.label.toLowerCase().includes(lower) || n.sub?.toLowerCase().includes(lower))

    // API search for students and teachers in parallel
    const [stuRes, tchRes] = await Promise.all([
      fetch(`/api/students?school_id=${schoolId}&search=${encodeURIComponent(q)}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/teachers?school_id=${schoolId}&search=${encodeURIComponent(q)}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ])

    const studentResults: Result[] = (Array.isArray(stuRes) ? stuRes.slice(0, 5) : []).map((s: { name: string; grade: string; section: string; roll_number: string }) => ({
      type: 'student' as const,
      label: s.name,
      sub: `Grade ${s.grade}-${s.section} · ${s.roll_number}`,
      nav: 'students',
    }))

    const teacherResults: Result[] = (Array.isArray(tchRes) ? tchRes.slice(0, 3) : []).map((t: { name: string; department?: string; subject?: string }) => ({
      type: 'teacher' as const,
      label: t.name,
      sub: t.department || t.subject || 'Teacher',
      nav: 'teachers',
    }))

    setResults([...studentResults, ...teacherResults, ...navMatches.slice(0, 6)])
    setCursor(0)
    setLoading(false)
  }, [schoolId])

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!query.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    searchTimeout.current = setTimeout(() => search(query), 200)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [query, search])

  function selectResult(r: Result) {
    addRecent(r)
    if (r.nav) onNavigate(r.nav)
    if (r.action) r.action()
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const list = query ? results : (recent.length ? recent : QUICK_ACTIONS.slice(0, 6))
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, list.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && list[cursor]) { e.preventDefault(); selectResult(list[cursor]) }
  }

  if (!open) return null

  const displayList = query ? results : (recent.length ? recent : QUICK_ACTIONS.slice(0, 6))
  const groupLabel  = query ? (loading ? 'Searching…' : `${results.length} result${results.length !== 1 ? 's' : ''}`) :
                      recent.length ? 'Recent' : 'Quick Actions'

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search anything — students, teachers, fees, timetable…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
          />
          {loading && <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin shrink-0" />}
          <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono shrink-0">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {displayList.length > 0 ? (
            <>
              <div className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                {groupLabel}
              </div>
              {displayList.map((r, i) => (
                <button
                  key={`${r.type}-${r.label}-${i}`}
                  onClick={() => selectResult(r)}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                    cursor === i ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${TYPE_COLOR[r.type]}`}>
                    {TYPE_ICON[r.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${cursor === i ? 'text-blue-700' : 'text-gray-800'}`}>{r.label}</div>
                    {r.sub && <div className="text-xs text-gray-400 truncate mt-0.5">{r.sub}</div>}
                  </div>
                  {cursor === i && <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono shrink-0">↵</kbd>}
                </button>
              ))}
            </>
          ) : query && !loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">No results for &quot;{query}&quot;</div>
          ) : null}

          {/* Quick actions when no query */}
          {!query && recent.length > 0 && (
            <>
              <div className="px-4 py-2 border-t border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Quick Actions
              </div>
              {QUICK_ACTIONS.slice(0, 4).map((r, i) => {
                const idx = recent.length + i
                return (
                  <button key={r.label} onClick={() => selectResult(r)} onMouseEnter={() => setCursor(idx)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${cursor === idx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${TYPE_COLOR.action}`}>⚡</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${cursor === idx ? 'text-blue-700' : 'text-gray-700'}`}>{r.label}</div>
                      {r.sub && <div className="text-xs text-gray-400">{r.sub}</div>}
                    </div>
                  </button>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
          <span><kbd className="bg-gray-100 px-1 rounded font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="bg-gray-100 px-1 rounded font-mono">↵</kbd> select</span>
          <span><kbd className="bg-gray-100 px-1 rounded font-mono">ESC</kbd> close</span>
          <span className="ml-auto">Ctrl+K to toggle</span>
        </div>
      </div>
    </div>
  )
}
