'use client'

import { useEffect, useRef, useState } from 'react'

type Notification = {
  id: number
  type: string
  title: string | null
  message: string | null
  is_read: boolean
  created_at: string
  sender_name: string | null
}

type Props =
  | { teacherId: number; schoolId?: never; onNavigate?: (key: string) => void }
  | { schoolId: number; teacherId?: never; onNavigate?: (key: string) => void }

const TYPE_ICONS: Record<string, string> = {
  leave_request: '📋',
  leave_approved: '✅',
  leave_rejected: '❌',
  period_delay: '⏰',
  substitute_needed: '🔄',
  substitute_assigned: '👤',
}

const TYPE_COLORS: Record<string, string> = {
  leave_request: 'text-blue-600 bg-blue-50',
  leave_approved: 'text-green-600 bg-green-50',
  leave_rejected: 'text-red-600 bg-red-50',
  period_delay: 'text-amber-600 bg-amber-50',
  substitute_needed: 'text-orange-600 bg-orange-50',
  substitute_assigned: 'text-teal-600 bg-teal-50',
}

const TYPE_NAV: Record<string, string> = {
  leave_request: 'leave-requests',
  leave_approved: 'leave',
  leave_rejected: 'leave',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationBell({ teacherId, schoolId, onNavigate }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const apiUrl = teacherId
    ? `/api/notifications?teacher_id=${teacherId}`
    : `/api/notifications?recipient_school_id=${schoolId}`

  async function fetchNotifications() {
    try {
      const res = await fetch(apiUrl)
      const data = await res.json()
      setNotifications(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchNotifications()
    const timer = setInterval(fetchNotifications, 30000)
    return () => clearInterval(timer)
  }, [teacherId, schoolId])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function markAllRead() {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teacherId ? { teacher_id: teacherId } : { school_id: schoolId }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch { /* silent */ }
  }

  async function markOneRead(id: number) {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: id }),
      })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch { /* silent */ }
  }

  function handleOpen() {
    setOpen(v => !v)
  }

  function handleClick(n: Notification) {
    markOneRead(n.id)
    const navKey = TYPE_NAV[n.type]
    if (navKey && onNavigate) {
      onNavigate(navKey)
      setOpen(false)
    }
  }

  const unread = notifications.filter(n => !n.is_read).length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-900 text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">No notifications</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3 items-start ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                >
                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0 mt-0.5 ${TYPE_COLORS[n.type] || 'text-gray-500 bg-gray-100'}`}>
                    {TYPE_ICONS[n.type] || '🔔'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-tight ${!n.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {n.title || n.type}
                      </p>
                      {!n.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
                    </div>
                    {n.message && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</p>
                      {TYPE_NAV[n.type] && onNavigate && (
                        <span className="text-[10px] text-blue-500 font-medium">tap to view →</span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-center">
              <span className="text-xs text-gray-400">{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
