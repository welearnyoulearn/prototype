'use client'

import { useEffect, useState } from 'react'

type Student = {
  id: number; name: string; grade: string; section: string; roll_number: string
}
type AnnouncementItem = {
  id: number; title: string; content: string; announcement_type: string
  priority: string; created_by_name: string; expires_at: string | null; created_at: string
}
type AttSummary = {
  total_days: number; present_days: number; absent_days: number; attendance_pct: number
}
type Props = {
  student: Student; classId: number; schoolId: number; onNavigate?: (key: string) => void
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good Morning', emoji: '☀️' }
  if (h < 17) return { text: 'Good Afternoon', emoji: '👋' }
  return { text: 'Good Evening', emoji: '🌙' }
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function StudentDashboard({ student, classId, schoolId, onNavigate }: Props) {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [attSummary, setAttSummary]       = useState<AttSummary | null>(null)
  const [loading, setLoading]             = useState(true)

  const greeting = getGreeting()

  useEffect(() => {
    Promise.all([
      fetch(`/api/announcements?school_id=${schoolId}&audience=students`).then(r => r.json()).catch(() => []),
      fetch(`/api/attendance/analytics?school_id=${schoolId}&student_id=${student.id}&months=1`).then(r => r.json()).catch(() => null),
    ]).then(([ann, att]) => {
      setAnnouncements(Array.isArray(ann) ? ann.slice(0, 5) : [])
      setAttSummary(att?.summary || null)
      setLoading(false)
    })
  }, [student.id, schoolId, classId])

  const quickLinks = [
    { key: 'timetable', label: 'My Timetable', emoji: '🗓️', color: 'from-blue-500 to-blue-600' },
    { key: 'my-marks',  label: 'My Marks',     emoji: '📊', color: 'from-amber-500 to-orange-500' },
    { key: 'profile',   label: 'My Profile',   emoji: '👤', color: 'from-purple-500 to-purple-600' },
  ]

  return (
    <div className="space-y-5 pb-6">
      {/* Greeting header */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-indigo-200 text-sm font-medium">{greeting.emoji} {greeting.text}</p>
            <h2 className="text-xl font-black mt-1">{student.name.split(' ')[0]}</h2>
            <p className="text-indigo-200 text-xs mt-0.5">
              Grade {student.grade}-{student.section} · Roll {student.roll_number}
            </p>
          </div>
          <div className="text-4xl">{greeting.emoji}</div>
        </div>

        {/* Attendance summary pill */}
        {attSummary && attSummary.total_days > 0 && (
          <div className="mt-4 bg-white/15 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-200 font-medium">This Month — Attendance</p>
              <p className="text-lg font-black mt-0.5">{attSummary.attendance_pct}%</p>
            </div>
            <div className="text-right text-xs text-indigo-200 space-y-0.5">
              <p>Present: <span className="text-white font-bold">{attSummary.present_days}</span></p>
              <p>Absent: <span className="text-white font-bold">{attSummary.absent_days}</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Quick navigation links */}
      <div className="grid grid-cols-3 gap-3">
        {quickLinks.map(link => (
          <button key={link.key} onClick={() => onNavigate?.(link.key)}
            className={`bg-gradient-to-br ${link.color} rounded-2xl p-4 text-white text-center shadow-sm hover:shadow-md transition-all active:scale-95`}>
            <div className="text-2xl mb-1">{link.emoji}</div>
            <p className="text-xs font-bold leading-tight">{link.label}</p>
          </button>
        ))}
      </div>

      {/* Announcements */}
      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : announcements.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">Announcements</p>
          {announcements.map(a => {
            const colorMap: Record<string, string> = {
              urgent:  'border-l-red-500 bg-red-50',
              holiday: 'border-l-green-500 bg-green-50',
              exam:    'border-l-amber-500 bg-amber-50',
              general: 'border-l-blue-500 bg-blue-50',
            }
            const color = colorMap[a.announcement_type] || colorMap.general
            return (
              <div key={a.id} className={`border-l-4 ${color} rounded-r-xl px-4 py-3`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-gray-800 leading-snug">{a.title}</p>
                  {a.priority === 'urgent' && (
                    <span className="text-[10px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full shrink-0">Urgent</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{a.content}</p>
                <p className="text-[10px] text-gray-400 mt-1.5">{a.created_by_name} · {relTime(a.created_at)}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-12 text-center">
          <div className="text-3xl mb-2">📢</div>
          <p className="text-sm text-gray-400 font-medium">No announcements right now</p>
          <p className="text-xs text-gray-300 mt-1">Check back later for school updates</p>
        </div>
      )}
    </div>
  )
}
