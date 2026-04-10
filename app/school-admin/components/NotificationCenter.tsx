'use client'

import { useEffect, useState } from 'react'

type Notification = {
  id: number
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  sender_name: string | null
  data: Record<string, unknown> | null
}

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  leave_request:       { icon: '📅', color: 'bg-blue-100 text-blue-700',   label: 'Leave Request' },
  leave_approved:      { icon: '✅', color: 'bg-green-100 text-green-700', label: 'Leave Approved' },
  leave_rejected:      { icon: '❌', color: 'bg-red-100 text-red-700',     label: 'Leave Rejected' },
  substitute_assigned: { icon: '🔄', color: 'bg-amber-100 text-amber-700', label: 'Substitute' },
  exam_scheduled:      { icon: '📝', color: 'bg-purple-100 text-purple-700',label: 'Exam Scheduled' },
  marks_entry_required:{ icon: '📊', color: 'bg-orange-100 text-orange-700',label: 'Marks Entry' },
  timetable_updated:   { icon: '🗓️', color: 'bg-cyan-100 text-cyan-700',   label: 'Timetable' },
  general:             { icon: '🔔', color: 'bg-gray-100 text-gray-600',   label: 'General' },
}

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? TYPE_META.general
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24)return `${hours}h ago`
  if (days < 7)  return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function NotificationCenter({ schoolId }: { schoolId: number }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState<'all' | 'unread'>('all')
  const [markingAll, setMarkingAll]       = useState(false)

  useEffect(() => { load() }, [schoolId])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/notifications?recipient_school_id=${schoolId}`)
      if (r.ok) setNotifications(await r.json())
    } finally {
      setLoading(false)
    }
  }

  async function markRead(id: number) {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_id: id }),
    })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function markAllRead() {
    setMarkingAll(true)
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setMarkingAll(false)
  }

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications

  const unreadCount = notifications.filter(n => !n.is_read).length

  // Group by date
  type DateGroup = { label: string; items: Notification[] }
  const groups: DateGroup[] = []
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  for (const n of filtered) {
    const d = new Date(n.created_at).toISOString().slice(0, 10)
    const label = d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
    const existing = groups.find(g => g.label === label)
    if (existing) existing.items.push(n)
    else groups.push({ label, items: [n] })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Notification Center</h2>
          <p className="text-sm text-gray-400 mt-0.5">School-wide alerts, approvals and updates</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} disabled={markingAll}
              className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
              {markingAll ? 'Marking…' : `Mark all read (${unreadCount})`}
            </button>
          )}
          <button onClick={load}
            className="px-3 py-1.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setFilter('all')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          All <span className="ml-1 text-xs text-gray-400">{notifications.length}</span>
        </button>
        <button onClick={() => setFilter('unread')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'unread' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Unread {unreadCount > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
        </button>
      </div>

      {loading && <div className="text-center py-12 text-gray-400 text-sm">Loading notifications…</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-xl">
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-gray-500 font-medium">{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
        </div>
      )}

      {/* Notification list */}
      {!loading && groups.map(group => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">{group.label}</p>
          <div className="space-y-1.5">
            {group.items.map(n => {
              const meta = getTypeMeta(n.type)
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`flex items-start gap-4 px-5 py-4 rounded-xl border transition-all cursor-pointer group ${
                    n.is_read
                      ? 'bg-white border-gray-100 hover:bg-gray-50/50'
                      : 'bg-indigo-50/40 border-indigo-100 hover:bg-indigo-50/70'
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0 ${meta.color}`}>
                    {meta.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                      )}
                    </div>
                    {n.title && (
                      <p className={`text-sm font-semibold ${n.is_read ? 'text-gray-700' : 'text-gray-900'}`}>{n.title}</p>
                    )}
                    {n.message && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</span>
                      {n.sender_name && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span className="text-[10px] text-gray-400">from {n.sender_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mark read indicator */}
                  {!n.is_read && (
                    <div className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1">
                      Click to mark read
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
