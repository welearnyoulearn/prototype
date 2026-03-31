'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type Teacher = {
  id: number
  name: string
  subject: string
  class_teacher_grade: string | null
  class_teacher_section: string | null
}

type Doubt = {
  id: number
  subject: string
  question: string
  task_title: string | null
  status: string
  created_at: string
  last_message_at: string | null
  message_count: number
  student_name: string
  roll_number: string
  grade: string
  section: string
  answered_by_name: string | null
}

type Message = {
  id: number
  sender_type: 'student' | 'teacher'
  sender_id: number
  sender_name: string
  message: string
  created_at: string
}

type Props = {
  classId: number
  grade: string
  section: string
  schoolId: number
  teacher: Teacher
}

type Priority = 'high' | 'medium' | 'low'

function getPriority(createdAt: string, lastMsgAt: string | null, status: string): Priority {
  if (status === 'resolved' || status === 'in_progress') return 'low'
  const ref = lastMsgAt || createdAt
  const hours = (Date.now() - new Date(ref).getTime()) / 3600000
  if (hours > 48) return 'high'
  if (hours > 24) return 'medium'
  return 'low'
}

function fmtTime(dt: string) {
  const d = new Date(dt)
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 3600000
  if (diffH < 1) return `${Math.round(diffH * 60)}m ago`
  if (diffH < 24) return `${Math.round(diffH)}h ago`
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function fmtFull(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function canRespond(teacherSubject: string, timetableSubjects: string[], doubtSubject: string): boolean {
  const all = [
    ...teacherSubject.split(/[,&\/]/).map(s => s.trim().toLowerCase()),
    ...timetableSubjects.map(s => s.toLowerCase()),
  ]
  const ds = doubtSubject.toLowerCase()
  return all.some(ts => ts && (ts.includes(ds.slice(0, 4)) || ds.includes(ts.slice(0, 4))))
}

const PriorityDot = ({ p }: { p: Priority }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
    p === 'high' ? 'text-red-600' : p === 'medium' ? 'text-amber-600' : 'text-green-600'
  }`}>
    <span className={`w-2 h-2 rounded-full ${p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-amber-400' : 'bg-green-500'}`} />
    {p.charAt(0).toUpperCase() + p.slice(1)}
  </span>
)

export default function ClassDoubts({ classId, grade, section, schoolId, teacher }: Props) {
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [loading, setLoading] = useState(true)
  const [timetableSubjects, setTimetableSubjects] = useState<string[]>([])
  const [subjectFilter, setSubjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'open' | 'in_progress' | 'resolved' | 'all'>('open')
  const [studentFilter, setStudentFilter] = useState('')
  const [selected, setSelected] = useState<Doubt | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const isClassTeacher = teacher.class_teacher_grade === grade && teacher.class_teacher_section === section

  const fetchDoubts = useCallback(async () => {
    const data = await fetch(`/api/doubts?school_id=${schoolId}&class_id=${classId}`)
      .then(r => r.json()).catch(() => [])
    setDoubts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [schoolId, classId])

  useEffect(() => {
    fetchDoubts()
    fetch(`/api/timetable?school_id=${schoolId}&teacher_id=${teacher.id}`)
      .then(r => r.json()).then(data => {
        if (Array.isArray(data)) {
          const subs = [...new Set(data
            .filter((e: { grade?: string; section?: string }) => e.grade === grade && e.section === section)
            .map((e: { subject: string }) => e.subject).filter(Boolean))] as string[]
          setTimetableSubjects(subs)
        }
      }).catch(() => {})
  }, [fetchDoubts, schoolId, teacher.id, classId, grade, section])

  const fetchMessages = useCallback(async (doubtId: number) => {
    const data = await fetch(`/api/doubts/${doubtId}/messages?school_id=${schoolId}`)
      .then(r => r.json()).catch(() => [])
    setMessages(Array.isArray(data) ? data : [])
  }, [schoolId])

  function openChat(doubt: Doubt) {
    setSelected(doubt)
    setNewMsg('')
    setChatLoading(true)
    fetchMessages(doubt.id).finally(() => {
      setChatLoading(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })
  }

  useEffect(() => {
    if (!selected) { if (pollerRef.current) clearInterval(pollerRef.current); return }
    pollerRef.current = setInterval(() => fetchMessages(selected.id), 4000)
    return () => { if (pollerRef.current) clearInterval(pollerRef.current) }
  }, [selected, fetchMessages])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage() {
    if (!selected || !newMsg.trim()) return
    setSending(true)
    const res = await fetch(`/api/doubts/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, sender_type: 'teacher',
        sender_id: teacher.id, sender_name: teacher.name, message: newMsg.trim(),
      }),
    })
    if (res.ok) {
      setNewMsg('')
      await fetchMessages(selected.id)
      await fetchDoubts()
    }
    setSending(false)
  }

  const subjects = [...new Set(doubts.map(d => d.subject))].sort()
  const students = [...new Set(doubts.map(d => d.student_name))].sort()

  const filtered = doubts.filter(d => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false
    if (subjectFilter && d.subject !== subjectFilter) return false
    if (studentFilter && d.student_name !== studentFilter) return false
    return true
  })

  const myDoubts = filtered.filter(d => canRespond(teacher.subject, timetableSubjects, d.subject))
  // Hide resolved doubts from view-only section — student resolved = conversation over, no need for class teacher to see it
  const viewOnly = filtered.filter(d => !canRespond(teacher.subject, timetableSubjects, d.subject) && d.status !== 'resolved')

  const openCount = doubts.filter(d => d.status === 'open').length
  const overdueCount = doubts.filter(d => {
    if (d.status !== 'open') return false
    return (Date.now() - new Date(d.created_at).getTime()) / 3600000 > 48
  }).length
  const resolvedToday = doubts.filter(d => {
    if (d.status !== 'resolved') return false
    const today = new Date().toDateString()
    return d.last_message_at && new Date(d.last_message_at).toDateString() === today
  }).length

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Chat view ──────────────────────────────────────────────────────────────
  if (selected) {
    const isResolved = selected.status === 'resolved'
    const myDoubt = canRespond(teacher.subject, timetableSubjects, selected.subject)

    return (
      <div className="flex flex-col gap-3 max-h-[65vh]">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <span className="text-orange-600 font-bold text-xs">{selected.student_name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">{selected.student_name}
              <span className="text-gray-400 font-normal text-xs ml-2">Roll {selected.roll_number}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-600 font-medium">{selected.subject}</span>
              <span className="text-xs text-gray-400">{fmtTime(selected.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {selected.status === 'in_progress' && (
              <span className="text-[10px] text-gray-400 hidden md:block">Student resolves</span>
            )}
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              isResolved ? 'bg-green-100 text-green-700' :
              selected.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {isResolved ? 'Resolved by Student' : selected.status === 'in_progress' ? 'In Progress' : 'Open'}
            </span>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex-shrink-0">
          <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide mb-1">Question</p>
          <p className="text-sm text-gray-800 leading-relaxed">{selected.question}</p>
        </div>

        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-y-auto p-4 space-y-3 min-h-[200px]">
          {chatLoading ? (
            <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{myDoubt ? 'No messages yet — start the conversation' : 'View only — not your subject'}</p>
          ) : messages.map(msg => {
            const isTeacher = msg.sender_type === 'teacher'
            return (
              <div key={msg.id} className={`flex gap-2.5 ${isTeacher ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 self-end text-[10px] font-bold ${isTeacher ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                  {msg.sender_name.charAt(0)}
                </div>
                <div className={`max-w-[70%] flex flex-col gap-0.5 ${isTeacher ? 'items-end' : 'items-start'}`}>
                  <p className="text-[10px] text-gray-400">{isTeacher ? 'You' : msg.sender_name} · {fmtFull(msg.created_at)}</p>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${isTeacher ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                    {msg.message}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>

        {isResolved ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mt-1 text-center flex-shrink-0">
            <div className="flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              <p className="text-xs text-green-700 font-semibold">Student resolved · Archived</p>
            </div>
          </div>
        ) : myDoubt ? (
          <div className="flex gap-2 flex-shrink-0">
            <textarea
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Type reply... (Enter to send)"
              rows={2}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
            <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 rounded-lg text-sm font-semibold flex-shrink-0">
              {sending ? '...' : 'Send'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg p-3 text-center flex-shrink-0">
            View only — outside your subject area
          </p>
        )}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  const teacherSubjects = [
    ...teacher.subject.split(/[,&\/]/).map(s => s.trim()).filter(Boolean),
    ...timetableSubjects,
  ]
  const uniqueTeacherSubjects = [...new Set(teacherSubjects)]

  return (
    <div className="flex flex-col gap-4">
      {/* Context banner */}
      {isClassTeacher && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <p className="text-sm text-orange-700">
            As Class Teacher you can view all doubts raised in Class {grade}{section}.
            {uniqueTeacherSubjects.length > 0 && (
              <> You can only respond to <strong>{uniqueTeacherSubjects.join(' & ')}</strong> doubts.</>
            )}
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'TOTAL OPEN', val: openCount, color: 'text-orange-600' },
          { label: 'YOUR DOUBTS', val: myDoubts.length, color: 'text-blue-600' },
          { label: 'OVERDUE 48H', val: overdueCount, color: 'text-red-600' },
          { label: 'RESOLVED TODAY', val: resolvedToday, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-white focus:outline-none">
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-white focus:outline-none">
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="all">All Status</option>
        </select>
        <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-white focus:outline-none">
          <option value="">All Students</option>
          {students.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {openCount > 0 && <span className="text-orange-500 font-semibold">{openCount} Open</span>}
          {overdueCount > 0 && <span className="text-red-500 font-semibold">{overdueCount} Overdue</span>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <p className="text-gray-400 text-sm">{statusFilter === 'open' ? 'No open doubts — all caught up!' : 'No doubts in this category'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {myDoubts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800 text-white text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Student</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Subject</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Doubt Title</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Raised</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Priority</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {myDoubts.map(d => {
                    const priority = getPriority(d.created_at, d.last_message_at, d.status)
                    const isOverdue = priority === 'high' && d.status === 'open'
                    return (
                      <tr key={d.id} className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'border-l-4 border-l-red-400' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-orange-600 text-xs font-bold">{d.student_name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{d.student_name}</p>
                              <p className="text-[10px] text-gray-400">Roll {d.roll_number}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded uppercase">{d.subject}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="text-sm text-gray-800 truncate">{d.question}</p>
                          {d.message_count > 0 && <p className="text-[10px] text-blue-500">{d.message_count} msg{d.message_count !== 1 ? 's' : ''}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtTime(d.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium w-fit ${
                              d.status === 'resolved' ? 'bg-gray-100 text-gray-500' :
                              d.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {d.status === 'in_progress' ? 'In Progress' : d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                            </span>
                            {isOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full w-fit">OVERDUE</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><PriorityDot p={priority} /></td>
                        <td className="px-4 py-3">
                          <button onClick={() => openChat(d)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 ${
                              d.status === 'resolved' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' :
                              isOverdue ? 'bg-red-600 text-white hover:bg-red-700' :
                              'bg-orange-600 text-white hover:bg-orange-700'
                            }`}>
                            {d.status === 'resolved' ? 'View' : isOverdue ? 'Respond Now' : 'Respond'}
                            {d.status !== 'resolved' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {viewOnly.length > 0 && (
            <div>
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">Other Subject Doubts — View Only</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <tbody className="divide-y divide-gray-100">
                    {viewOnly.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50 opacity-80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-gray-500 text-[10px] font-bold">{d.student_name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                            </div>
                            <p className="text-sm text-gray-700">{d.student_name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold bg-purple-100 text-purple-600 px-2 py-0.5 rounded uppercase">{d.subject}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]"><p className="text-sm text-gray-600 truncate">{d.question}</p></td>
                        <td className="px-4 py-3 text-xs text-gray-400">{fmtTime(d.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            d.status === 'resolved' ? 'bg-gray-100 text-gray-500' :
                            d.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {d.status === 'in_progress' ? 'In Progress' : d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openChat(d)}
                            className="text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            View Only
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
