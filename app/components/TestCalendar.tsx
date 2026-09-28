'use client'

import { useEffect, useState } from 'react'

type ExamItem = {
  id: number
  exam_name: string
  exam_type: string
  exam_date: string   // YYYY-MM-DD
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  room: string | null
  syllabus?: string | null
  instructions?: string | null
  status: string
  grade: string
  section: string
  subjects: string[]
  total_subjects: number
  submitted_subjects: number
  class_id: number
}

function timeLabel(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function durationLabel(startTime: string | null, endTime: string | null, minutes: number | null) {
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins > 0) return mins % 60 === 0 ? `${mins / 60} Hour${mins / 60 !== 1 ? 's' : ''}` : `${mins} min`
  }
  if (minutes) return minutes % 60 === 0 ? `${minutes / 60} Hour${minutes / 60 !== 1 ? 's' : ''}` : `${minutes} min`
  return null
}

// "2 Days Left" / "Starts in 45 Minutes" — the spec's exam countdown, sharp
// down to the minute once the exam is today and has a start_time.
function countdownLabel(exam: ExamItem): string | null {
  const days = daysUntil(exam.exam_date)
  if (days > 0) return `${days} Day${days !== 1 ? 's' : ''} Left`
  if (days < 0) return null
  if (!exam.start_time) return 'Today'
  const [h, m] = exam.start_time.split(':').map(Number)
  const start = new Date(); start.setHours(h, m, 0, 0)
  const diffMin = Math.round((start.getTime() - Date.now()) / 60000)
  if (diffMin > 60) return `Starts in ${Math.round(diffMin / 60)} Hours`
  if (diffMin > 0) return `Starts in ${diffMin} Minutes`
  const endMin = exam.end_time ? (() => {
    const [eh, em] = exam.end_time!.split(':').map(Number)
    const end = new Date(); end.setHours(eh, em, 0, 0)
    return Math.round((end.getTime() - Date.now()) / 60000)
  })() : null
  if (endMin !== null && endMin > 0) return 'In Progress'
  return 'Today'
}

type Props = {
  schoolId: number
  classId?: number
  studentId?: number
  teacherId?: number
  mode: 'student' | 'teacher' | 'parent' | 'admin'
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const EXAM_TYPE_META: Record<string, { label: string; color: string; dot: string }> = {
  unit_test:  { label: 'Unit Test',   color: 'bg-red-100 text-red-700 border-red-200',     dot: 'bg-red-500' },
  mid_term:   { label: 'Mid Term',    color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  final_exam: { label: 'Final Exam',  color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  practical:  { label: 'Practical',   color: 'bg-blue-100 text-blue-700 border-blue-200',  dot: 'bg-blue-500' },
}

function meta(type: string) {
  return EXAM_TYPE_META[type] ?? { label: type, color: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' }
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(dateStr); d.setHours(0,0,0,0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

export default function TestCalendar({ schoolId, classId, studentId, teacherId, mode }: Props) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [exams, setExams] = useState<ExamItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ school_id: String(schoolId) })
    if (classId)   params.set('class_id',   String(classId))
    if (studentId) params.set('student_id', String(studentId))
    if (teacherId) params.set('teacher_id', String(teacherId))

    fetch(`/api/exams/calendar?${params}`)
      .then(r => r.json())
      .then(data => { setExams(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [schoolId, classId, studentId, teacherId, mode])

  const byDate = new Map<string, ExamItem[]>()
  for (const e of exams) {
    const key = e.exam_date?.slice(0, 10)
    if (!key) continue
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(e)
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
    setSelected(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
    setSelected(null)
  }
  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const todayStr = today.toISOString().slice(0, 10)
  const in60 = new Date(today); in60.setDate(in60.getDate() + 60)
  const in60Str = in60.toISOString().slice(0, 10)

  const upcoming = exams
    .filter(e => e.exam_date >= todayStr && e.exam_date <= in60Str)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))

  const selectedExams = selected ? (byDate.get(selected) ?? []) : []

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-10 bg-gray-100 rounded-xl w-64" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  const ago60 = new Date(today); ago60.setDate(ago60.getDate() - 60)
  const ago60Str = ago60.toISOString().slice(0, 10)
  const todaysExams = exams.filter(e => e.exam_date === todayStr)
  const completed = exams
    .filter(e => e.exam_date < todayStr && e.exam_date >= ago60Str)
    .sort((a, b) => b.exam_date.localeCompare(a.exam_date))
    .slice(0, 10)

  return (
    <div className="space-y-5">
      {/* Today's Exams — spec's "📝 Maths Exam – Starts in 45 Minutes" banner */}
      {todaysExams.length > 0 && (mode === 'student' || mode === 'parent') && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          {todaysExams.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-red-800">📝 {e.exam_name} — {countdownLabel(e)}</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {timeLabel(e.start_time) ?? ''}{e.end_time ? `–${timeLabel(e.end_time)}` : ''}{e.room ? ` · Room ${e.room}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming strip */}
      {upcoming.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Upcoming Exams — next 60 days
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {upcoming.map(e => {
              const d = new Date(e.exam_date)
              const days = daysUntil(e.exam_date)
              const m = meta(e.exam_type)
              const isToday = e.exam_date === todayStr
              return (
                <div
                  key={e.id}
                  onClick={() => { setYear(d.getFullYear()); setMonth(d.getMonth()); setSelected(e.exam_date) }}
                  className={`flex-shrink-0 cursor-pointer rounded-xl border p-3 w-44 transition-all hover:shadow-md ${
                    isToday ? 'border-red-300 bg-red-50' : days <= 3 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-gray-400">
                      {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                    {days === 0 ? (
                      <span className="text-[9px] font-black text-red-600 bg-red-100 px-1 rounded">TODAY</span>
                    ) : days > 0 ? (
                      <span className={`text-[9px] font-bold px-1 rounded ${days <= 3 ? 'text-orange-700 bg-orange-100' : 'text-gray-500 bg-gray-100'}`}>
                        {days}d
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs font-semibold text-gray-800 truncate">{e.exam_name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                    {e.subjects.slice(0, 2).join(', ')}{e.subjects.length > 2 ? ` +${e.subjects.length - 2}` : ''}
                  </p>
                  {(timeLabel(e.start_time) || e.room) && (
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                      {timeLabel(e.start_time) ?? ''}{e.room ? `${timeLabel(e.start_time) ? ' · ' : ''}Room ${e.room}` : ''}
                    </p>
                  )}
                  <span className={`inline-block mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${m.color}`}>
                    {m.label}
                  </span>
                  {mode === 'teacher' || mode === 'admin' ? (
                    <p className="text-[9px] text-gray-400 mt-1">Grade {e.grade}-{e.section}</p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="text-sm font-bold text-gray-800">{MONTHS[month]} {year}</h3>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS.map(d => (
              <div key={d} className="text-center py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="min-h-[64px] border-b border-r border-gray-50" />
              const ds = dateStr(day)
              const dayExams = byDate.get(ds) ?? []
              const isToday = ds === todayStr
              const isPast = ds < todayStr
              const isSelected = ds === selected

              return (
                <div
                  key={ds}
                  onClick={() => setSelected(isSelected ? null : ds)}
                  className={`min-h-[64px] border-b border-r border-gray-50 p-1.5 cursor-pointer transition-all ${
                    isSelected ? 'bg-indigo-50' :
                    isToday ? 'bg-blue-50' :
                    isPast ? 'bg-gray-50/50' :
                    'hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-blue-600 text-white' :
                    isPast ? 'text-gray-300' : 'text-gray-700'
                  }`}>{day}</div>

                  <div className="space-y-0.5">
                    {dayExams.slice(0, 2).map(e => {
                      const m = meta(e.exam_type)
                      return (
                        <div key={e.id} className={`text-[9px] truncate px-1 py-0.5 rounded font-medium border ${m.color}`}>
                          {e.exam_name}
                        </div>
                      )
                    })}
                    {dayExams.length > 2 && (
                      <div className="text-[9px] text-gray-400 pl-1">+{dayExams.length - 2}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-100 flex-wrap">
            {Object.entries(EXAM_TYPE_META).map(([type, m]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-sm ${m.dot}`} />
                <span className="text-[10px] text-gray-500">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-3">
          {selected && selectedExams.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {new Date(selected).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div className="space-y-3">
                {selectedExams.map(e => {
                  const m = meta(e.exam_type)
                  const days = daysUntil(e.exam_date)
                  return (
                    <div key={e.id} className={`rounded-xl border p-3 ${m.color}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-bold">{e.exam_name}</p>
                          <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border mt-1 ${m.color}`}>
                            {m.label}
                          </span>
                        </div>
                        {(mode === 'teacher' || mode === 'admin') && (
                          <span className="text-[10px] font-semibold text-gray-500 bg-white px-1.5 py-0.5 rounded border">
                            {e.grade}-{e.section}
                          </span>
                        )}
                      </div>

                      {(timeLabel(e.start_time) || e.room || durationLabel(e.start_time, e.end_time, e.duration_minutes)) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-medium opacity-80 mb-2">
                          {timeLabel(e.start_time) && <span>🕐 {timeLabel(e.start_time)}{e.end_time ? `–${timeLabel(e.end_time)}` : ''}</span>}
                          {durationLabel(e.start_time, e.end_time, e.duration_minutes) && <span>⏱ {durationLabel(e.start_time, e.end_time, e.duration_minutes)}</span>}
                          {e.room && <span>📍 Room {e.room}</span>}
                        </div>
                      )}

                      {e.subjects.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold opacity-60 uppercase mb-1">Subjects</p>
                          <div className="flex flex-wrap gap-1">
                            {e.subjects.map(s => (
                              <span key={s} className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded font-medium">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Syllabus/instructions only ever arrive from the API for
                          student/admin/teacher callers — the parent response
                          strips both server-side, so this simply renders nothing
                          for a parent session. */}
                      {e.syllabus && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold opacity-60 uppercase mb-1">Syllabus</p>
                          <p className="text-[11px] opacity-80 whitespace-pre-wrap">{e.syllabus}</p>
                        </div>
                      )}
                      {e.instructions && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold opacity-60 uppercase mb-1">Instructions</p>
                          <p className="text-[11px] opacity-80 whitespace-pre-wrap">{e.instructions}</p>
                        </div>
                      )}

                      {days >= 0 && (
                        <div className={`text-xs font-semibold mt-1 ${
                          days === 0 ? 'text-red-700' : days <= 3 ? 'text-orange-700' : 'opacity-70'
                        }`}>
                          {countdownLabel(e)}
                        </div>
                      )}

                      {(mode === 'teacher' || mode === 'admin') && e.total_subjects > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/40 text-[10px] opacity-70">
                          Marks: {e.submitted_subjects}/{e.total_subjects} subjects submitted
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-2xl mb-2">📭</p>
              <p className="text-sm text-gray-500">No exams on this day</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-2xl mb-2">📅</p>
              <p className="text-sm text-gray-500">Click a date to see exam details</p>
              <p className="text-xs text-gray-400 mt-1">{exams.length} exams scheduled</p>
            </div>
          )}

          {/* Month summary */}
          {(() => {
            const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
            const monthExams = exams.filter(e => e.exam_date?.startsWith(monthKey))
            if (monthExams.length === 0) return null
            const byType = monthExams.reduce<Record<string, number>>((acc, e) => {
              acc[e.exam_type] = (acc[e.exam_type] || 0) + 1; return acc
            }, {})
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {MONTHS[month]} Summary
                </p>
                <div className="space-y-1.5">
                  {Object.entries(byType).map(([type, count]) => {
                    const m = meta(type)
                    return (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${m.dot}`} />
                          <span className="text-xs text-gray-600">{m.label}</span>
                        </div>
                        <span className="text-xs font-bold text-gray-700">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Completed Exams — student/parent only, spec's "Completed Exams" list */}
      {(mode === 'student' || mode === 'parent') && completed.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Completed Exams</p>
          </div>
          <div className="divide-y divide-gray-50">
            {completed.map(e => {
              const m = meta(e.exam_type)
              return (
                <div key={e.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-700 truncate">{e.exam_name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {e.subjects.length > 0 ? ` · ${e.subjects.slice(0, 2).join(', ')}${e.subjects.length > 2 ? ` +${e.subjects.length - 2}` : ''}` : ''}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase flex-shrink-0 ${m.color}`}>{m.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
