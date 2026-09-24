'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

type ExamItem = {
  id: number
  exam_name: string
  exam_type: string
  exam_date: string   // YYYY-MM-DD
  status: string
  grade: string
  section: string
  subjects: string[]
  total_subjects: number
  submitted_subjects: number
  class_id: number
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
    if (mode === 'teacher' || mode === 'admin') params.set('include_draft', 'true')

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
      <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading exam calendar</span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
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
                <button
                  type="button"
                  key={e.id}
                  onClick={() => { setYear(d.getFullYear()); setMonth(d.getMonth()); setSelected(e.exam_date) }}
                  className={`w-40 flex-shrink-0 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
                    isToday ? 'border-red-300 bg-red-50' : days <= 3 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-500">
                      {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                    {days === 0 ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">Today</span>
                    ) : days > 0 ? (
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${days <= 3 ? 'text-orange-700 bg-orange-100' : 'text-gray-600 bg-gray-100'}`}>
                        {days}d
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs font-semibold text-gray-800 truncate">{e.exam_name}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {e.subjects.slice(0, 2).join(', ')}{e.subjects.length > 2 ? ` +${e.subjects.length - 2}` : ''}
                  </p>
                  <span className={`mt-1.5 inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${m.color}`}>
                    {m.label}
                  </span>
                  {mode === 'teacher' || mode === 'admin' ? (
                    <p className="mt-1 text-xs text-gray-500">Grade {e.grade}-{e.section}</p>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button type="button" onClick={prevMonth} aria-label="Previous month" className="flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <h3 className="text-sm font-semibold text-gray-800">{MONTHS[month]} {year}</h3>
            <button type="button" onClick={nextMonth} aria-label="Next month" className="flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">{d}</div>
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
                <button
                  type="button"
                  key={ds}
                  onClick={() => setSelected(isSelected ? null : ds)}
                  aria-label={`${day} ${MONTHS[month]}${dayExams.length ? `, ${dayExams.length} exam${dayExams.length === 1 ? '' : 's'}` : ''}`}
                  className={`min-h-[72px] border-b border-r border-gray-100 p-1.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600 ${
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
                        <div key={e.id} className={`truncate rounded border px-1 py-0.5 text-xs font-medium ${m.color}`}>
                          {e.exam_name}
                        </div>
                      )
                    })}
                    {dayExams.length > 2 && (
                      <div className="pl-1 text-xs text-gray-500">+{dayExams.length - 2}</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-100 flex-wrap">
            {Object.entries(EXAM_TYPE_META).map(([type, m]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-sm ${m.dot}`} />
                <span className="text-xs text-gray-500">{m.label}</span>
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
                          <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${m.color}`}>
                            {m.label}
                          </span>
                        </div>
                        {(mode === 'teacher' || mode === 'admin') && (
                          <span className="rounded border bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-500">
                            {e.grade}-{e.section}
                          </span>
                        )}
                      </div>

                      {e.subjects.length > 0 && (
                        <div className="mb-2">
                          <p className="mb-1 text-xs font-semibold uppercase opacity-60">Subjects</p>
                          <div className="flex flex-wrap gap-1">
                            {e.subjects.map(s => (
                              <span key={s} className="rounded bg-white/60 px-1.5 py-0.5 text-xs font-medium">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {days >= 0 && (
                        <div className={`text-xs font-semibold mt-1 ${
                          days === 0 ? 'text-red-700' : days <= 3 ? 'text-orange-700' : 'opacity-70'
                        }`}>
                          {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow!' : `${days} days to go`}
                        </div>
                      )}

                      {(mode === 'teacher' || mode === 'admin') && e.total_subjects > 0 && (
                        <div className="mt-2 border-t border-white/40 pt-2 text-xs opacity-70">
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
              <Inbox className="mx-auto mb-2 h-7 w-7 text-gray-400" aria-hidden="true" />
              <p className="text-sm text-gray-500">No exams on this day</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <CalendarDays className="mx-auto mb-2 h-7 w-7 text-gray-400" aria-hidden="true" />
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
    </div>
  )
}
