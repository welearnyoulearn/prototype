'use client'

import { useEffect, useState } from 'react'

type Teacher = {
  id: number
  name: string
  subject: string
  department: string
  class_teacher_grade: string | null
  class_teacher_section: string | null
}

type ClassOption = {
  id: number
  grade: string
  section: string
  class_teacher_name: string | null
  class_teacher_id: number | null
  student_count: number
}

type TimetableSlot = {
  grade: string | null
  section: string | null
  subject_name: string | null
  day_of_week: string
  period_number: number
  time_from: string
  time_to: string
}

type ClassTimetableSlot = {
  id: number
  day_of_week: string
  period_number: number
  subject_name: string | null
  teacher_name: string | null
  time_from: string
  time_to: string
  is_break: boolean
  break_label: string | null
}

type ClassEntry = {
  cls: ClassOption
  subjects: string[]
  isOwn: boolean
}

type Props = {
  teacher: Teacher
  schoolId: number
  onViewClass: (cls: { id: number; grade: string; section: string; class_teacher_name: string | null }) => void
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function todayName() {
  const d = new Date().getDay()
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]
}

export default function MyClasses({ teacher, schoolId, onViewClass }: Props) {
  const [entries, setEntries] = useState<ClassEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Expanded non-own class timetable
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null)
  const [classTimetable, setClassTimetable] = useState<ClassTimetableSlot[]>([])
  const [ttLoading, setTtLoading] = useState(false)
  const [ttDay, setTtDay] = useState(todayName())

  useEffect(() => {
    Promise.all([
      fetch(`/api/timetable?teacher_id=${teacher.id}&school_id=${schoolId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
    ]).then(([timetable, allClasses]: [TimetableSlot[], ClassOption[]]) => {
      const classMap = new Map<string, ClassEntry>()

      // Own class first
      if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const cls = allClasses.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (cls) classMap.set(`${cls.grade}-${cls.section}`, { cls, subjects: [], isOwn: true })
      }

      // Subject teacher classes from timetable
      timetable.forEach((slot: TimetableSlot) => {
        if (!slot.grade || !slot.section) return
        const key = `${slot.grade}-${slot.section}`
        if (!classMap.has(key)) {
          const cls = allClasses.find(c => c.grade === slot.grade && c.section === slot.section)
          if (cls) classMap.set(key, { cls, subjects: [], isOwn: false })
        }
        const entry = classMap.get(key)!
        if (slot.subject_name && !entry.subjects.includes(slot.subject_name)) {
          entry.subjects.push(slot.subject_name)
        }
      })

      setEntries(Array.from(classMap.values()))
    }).finally(() => setLoading(false))
  }, [teacher, schoolId])

  async function expandClass(cls: ClassOption) {
    if (expandedClassId === cls.id) { setExpandedClassId(null); return }
    setExpandedClassId(cls.id)
    setTtLoading(true)
    try {
      const slots: ClassTimetableSlot[] = await fetch(
        `/api/class-timetable?school_id=${schoolId}&class_id=${cls.id}`
      ).then(r => r.json()).catch(() => [])
      setClassTimetable(Array.isArray(slots) ? slots : [])
    } finally {
      setTtLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Classes Assigned</h3>
          <p className="text-gray-400 text-sm">Ask admin to set up your timetable.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">My Classes</h2>
        <p className="text-sm text-gray-500 mt-0.5">{entries.length} class{entries.length !== 1 ? 'es' : ''} assigned</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {entries.map(({ cls, subjects, isOwn }) => (
          <div key={cls.id} className="flex flex-col">
            {/* ── Own class card (Class Teacher) ── */}
            {isOwn ? (
              <div className="bg-white rounded-xl border-2 border-blue-200 p-5 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-3xl font-bold text-gray-900">{cls.grade}-{cls.section}</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Your Class</span>
                    </div>
                    <p className="text-xs text-gray-500">Class Teacher</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600">{cls.student_count}</p>
                    <p className="text-[10px] text-gray-400">Students</p>
                  </div>
                </div>

                {subjects.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {subjects.map(s => (
                      <span key={s} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => onViewClass({ id: cls.id, grade: cls.grade, section: cls.section, class_teacher_name: cls.class_teacher_name })}
                  className="w-full mt-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Open Full Class View
                </button>
              </div>
            ) : (
              /* ── Other class card (Subject Teacher) ── */
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-3xl font-bold text-gray-900">{cls.grade}-{cls.section}</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Subject Teacher</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {cls.class_teacher_name ? `Class Teacher: ${cls.class_teacher_name}` : 'No class teacher assigned'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-700">{cls.student_count}</p>
                      <p className="text-[10px] text-gray-400">Students</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-3">
                    {subjects.length > 0 ? subjects.map(s => (
                      <span key={s} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{s}</span>
                    )) : (
                      <span className="text-xs text-gray-400">No subjects mapped in timetable</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => onViewClass({ id: cls.id, grade: cls.grade, section: cls.section, class_teacher_name: cls.class_teacher_name })}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Open Class View
                    </button>
                    <button
                      onClick={() => expandClass(cls)}
                      className="px-3 py-2 border border-gray-200 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1"
                    >
                      <svg className={`w-3.5 h-3.5 transition-transform ${expandedClassId === cls.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Timetable
                    </button>
                  </div>
                </div>

                {/* Timetable drawer */}
                {expandedClassId === cls.id && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    {/* Day selector */}
                    <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                      {DAYS.map(d => (
                        <button key={d} onClick={() => setTtDay(d)}
                          className={`flex-shrink-0 text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                            ttDay === d ? 'bg-slate-800 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'
                          } ${d === todayName() && ttDay !== d ? 'border-blue-300 text-blue-600' : ''}`}>
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>

                    {ttLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {classTimetable
                          .filter(slot => slot.day_of_week === ttDay)
                          .sort((a, b) => a.period_number - b.period_number)
                          .map(slot => (
                            <div key={slot.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs ${slot.is_break ? 'bg-amber-50 text-amber-700' : 'bg-white border border-gray-100'}`}>
                              <span className="text-gray-400 w-14 flex-shrink-0">{slot.time_from}–{slot.time_to}</span>
                              <span className="font-medium flex-1 text-gray-800">
                                {slot.is_break ? (slot.break_label || 'Break') : (slot.subject_name || '—')}
                              </span>
                              {!slot.is_break && slot.teacher_name && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${slot.teacher_name === teacher.name ? 'bg-blue-100 text-blue-600 font-semibold' : 'bg-gray-100 text-gray-400'}`}>
                                  {slot.teacher_name === teacher.name ? 'You' : slot.teacher_name}
                                </span>
                              )}
                            </div>
                          ))}
                        {classTimetable.filter(s => s.day_of_week === ttDay).length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-3">No periods on {ttDay}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
