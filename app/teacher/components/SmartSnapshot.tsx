'use client'

import { useEffect, useState } from 'react'

type Teacher = {
  id: number
  name: string
  employee_id: string
  subject: string
  department: string
  qualification: string
  email: string
  phone: string
  class_teacher_grade: string | null
  class_teacher_section: string | null
  teaches_grades: string | null
}

type Period = {
  id: number
  day_of_week: string
  period_number: number
  time_from: string
  time_to: string
  subject: string
  grade: string
  section: string
  room: string
}

type ClassInfo = {
  id: number
  grade: string
  section: string
  class_teacher_id: number | null
  class_teacher_name: string | null
}

type ClassTimetableSlot = {
  id: number
  day_of_week: string
  period_number: number
  time_from: string
  time_to: string
  subject_name: string | null
  teacher_name: string | null
  is_break: boolean
  break_label: string | null
  substitute_teacher_name: string | null
  substitute_teacher_id: number | null
}

type SubstituteDuty = {
  id: number
  period_number: number
  subject_name: string | null
  grade: string
  section: string
  original_teacher_name: string | null
  original_teacher_department: string | null
  substitute_teacher_name: string | null
  time_from: string | null
  time_to: string | null
  date: string
}

type Props = {
  teacher: Teacher
  schoolId: number
  onNavigate: (nav: string) => void
  onViewClass: (cls: ClassInfo) => void
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getWeekDates(offset = 0): Record<string, string> {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  // Sunday → use next Monday; Mon-Sat → use this Monday
  if (dow === 0) monday.setDate(today.getDate() + 1)
  else monday.setDate(today.getDate() - (dow - 1))
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() + offset * 7)
  const result: Record<string, string> = {}
  DAYS.forEach((d, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    result[d] = date.toISOString().split('T')[0]
  })
  return result
}

function getToday() {
  const day = new Date().getDay()
  if (day === 0) return null // Sunday off
  if (day === 6) return 'Saturday'
  return DAYS[day - 1]
}

function timeToMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function getNowMins() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

type LeaveRecord = { id: number; leave_type: string; start_date: string; end_date: string; status: string }

export default function SmartSnapshot({ teacher, schoolId, onNavigate, onViewClass }: Props) {
  const [timetable, setTimetable] = useState<Period[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [nowMins, setNowMins] = useState(getNowMins())
  const [substituteDuties, setSubstituteDuties] = useState<SubstituteDuty[]>([])
  const [todayLeave, setTodayLeave] = useState<LeaveRecord | null>(null)

  // Timetable modal for non-class-teacher classes
  const [modalClass, setModalClass] = useState<ClassInfo | null>(null)
  const [modalSlots, setModalSlots] = useState<ClassTimetableSlot[]>([])
  const [modalSubs, setModalSubs] = useState<SubstituteDuty[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [modalWeekOffset, setModalWeekOffset] = useState(0)

  const today = getToday()

  // Update clock every minute
  useEffect(() => {
    const timer = setInterval(() => setNowMins(getNowMins()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const now = new Date()
    // Use LOCAL date (not UTC) so midnight rollover doesn't flip the date
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    Promise.all([
      fetch(`/api/timetable?teacher_id=${teacher.id}&school_id=${schoolId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/substitutes?school_id=${schoolId}&substitute_teacher_id=${teacher.id}&date=${todayStr}`).then(r => r.json()).catch(() => []),
      // active_date lets SQL do the date comparison server-side (avoids timezone issues)
      fetch(`/api/leave-requests?teacher_id=${teacher.id}&school_id=${schoolId}&status=approved&active_date=${todayStr}`).then(r => r.json()).catch(() => []),
    ]).then(([tt, cls, subs, leaves]) => {
      setTimetable(Array.isArray(tt) ? tt : [])
      setClasses(Array.isArray(cls) ? cls : [])
      setSubstituteDuties(Array.isArray(subs) ? subs : [])
      // API already filters to leaves active on todayStr — first result (if any) is today's leave
      setTodayLeave(Array.isArray(leaves) && leaves.length > 0 ? leaves[0] : null)
    }).finally(() => setLoading(false))
  }, [teacher.id, schoolId])

  const ownTodayPeriods = (today ? timetable.filter(p => p.day_of_week === today) : [])
    .sort((a, b) => a.period_number - b.period_number)

  // Merge own periods + substitute duties into a unified today timeline
  type MergedPeriod = { period_number: number; time_from: string; time_to: string; subject: string; grade: string; section: string; room: string; isSubstitute: boolean; originalTeacher?: string | null; id: number }
  const mergedTodayPeriods: MergedPeriod[] = [
    ...ownTodayPeriods.map(p => ({ ...p, isSubstitute: false })),
    ...substituteDuties.map(d => ({
      id: d.id,
      period_number: d.period_number,
      time_from: d.time_from || '',
      time_to: d.time_to || '',
      subject: d.subject_name || 'Substitute Class',
      grade: d.grade,
      section: d.section,
      room: '',
      isSubstitute: true,
      originalTeacher: d.original_teacher_name,
    })),
  ].sort((a, b) => a.period_number - b.period_number)

  const todayPeriods = mergedTodayPeriods

  const currentClass = todayPeriods.find(p =>
    nowMins >= timeToMinutes(p.time_from) && nowMins < timeToMinutes(p.time_to)
  )
  const nextClass = todayPeriods.find(p => timeToMinutes(p.time_from) > nowMins)
  const minsUntilNext = nextClass ? timeToMinutes(nextClass.time_from) - nowMins : null

  const isClassTeacher = !!(teacher.class_teacher_grade && teacher.class_teacher_section)

  // Build My Classes list
  const classSet = new Map<string, { grade: string; section: string; subjects: string[]; classInfo: ClassInfo | null }>()
  if (isClassTeacher) {
    const key = `${teacher.class_teacher_grade}-${teacher.class_teacher_section}`
    const info = classes.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section) || null
    classSet.set(key, { grade: teacher.class_teacher_grade!, section: teacher.class_teacher_section!, subjects: [], classInfo: info })
  }
  timetable.forEach(p => {
    if (!p.grade || !p.section) return
    const key = `${p.grade}-${p.section}`
    if (!classSet.has(key)) {
      const info = classes.find(c => c.grade === p.grade && c.section === p.section) || null
      classSet.set(key, { grade: p.grade, section: p.section, subjects: [], classInfo: info })
    }
    const cls = classSet.get(key)!
    if (p.subject && !cls.subjects.includes(p.subject)) cls.subjects.push(p.subject)
  })
  const myClasses = Array.from(classSet.values())

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

  async function openTimetableModal(cls: ClassInfo) {
    setModalClass(cls)
    setModalWeekOffset(0)
    setModalLoading(true)
    try {
      const [ttData, subData] = await Promise.all([
        fetch(`/api/class-timetable?class_id=${cls.id}&school_id=${schoolId}`).then(r => r.json()),
        fetch(`/api/substitutes?school_id=${schoolId}&class_id=${cls.id}`).then(r => r.json()),
      ])
      setModalSlots(Array.isArray(ttData) ? ttData : [])
      setModalSubs(Array.isArray(subData) ? subData : [])
    } finally {
      setModalLoading(false)
    }
  }

  const ctDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const ctAllPeriods = [...new Set(modalSlots.map(s => s.period_number))].sort((a, b) => a - b)
  function getCtSlot(day: string, pNum: number) {
    return modalSlots.find(s => s.day_of_week === day && s.period_number === pNum)
  }
  const modalWeekDates = getWeekDates(modalWeekOffset)
  const modalSubLookup = new Map<string, SubstituteDuty>()
  modalSubs.forEach(s => {
    const dateStr = s.date?.toString().slice(0, 10)
    if (dateStr) modalSubLookup.set(`${dateStr}-${s.period_number}`, s)
  })

  return (
    <div className="space-y-6">

      {/* ── On approved leave today banner ── */}
      {todayLeave && !loading && (
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-5 py-4 flex items-start gap-4">
          <div className="w-9 h-9 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-indigo-900 text-sm">You are on approved {todayLeave.leave_type} leave today</p>
            <p className="text-indigo-600 text-xs mt-0.5">
              {todayLeave.start_date.slice(0, 10)} → {todayLeave.end_date.slice(0, 10)} · Your classes are being covered by substitutes
            </p>
          </div>
          <span className="text-[10px] font-semibold bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded-full flex-shrink-0">ON LEAVE</span>
        </div>
      )}

      {/* ── Substitute duty banner ── show prominently at top when duties exist today ── */}
      {substituteDuties.length > 0 && today && !loading && (() => {
        const nowMin = getNowMins()
        const currentDuty = substituteDuties.find(d =>
          d.time_from && d.time_to &&
          nowMin >= timeToMinutes(d.time_from) && nowMin < timeToMinutes(d.time_to)
        )
        const nextDuty = substituteDuties.find(d =>
          d.time_from && timeToMinutes(d.time_from) > nowMin
        )
        const urgentDuty = currentDuty || nextDuty
        return (
          <div className={`rounded-2xl border-2 px-5 py-4 ${currentDuty ? 'bg-amber-600 border-amber-500' : 'bg-amber-50 border-amber-300'}`}>
            {/* Header row */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${currentDuty ? 'bg-amber-500' : 'bg-amber-200'}`}>
                  <svg className={`w-4 h-4 ${currentDuty ? 'text-white' : 'text-amber-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className={`font-bold text-sm ${currentDuty ? 'text-white' : 'text-amber-900'}`}>
                    {currentDuty
                      ? `Substitute in progress — ${currentDuty.subject_name || 'Class'} · Gr.${currentDuty.grade}-${currentDuty.section}`
                      : `You have ${substituteDuties.length} substitute dut${substituteDuties.length > 1 ? 'ies' : 'y'} today`
                    }
                  </p>
                  <p className={`text-xs ${currentDuty ? 'text-amber-100' : 'text-amber-600'}`}>
                    {currentDuty
                      ? `Covering for ${currentDuty.original_teacher_name || 'absent teacher'} · until ${currentDuty.time_to}`
                      : urgentDuty && urgentDuty === nextDuty
                        ? `Next: P${nextDuty.period_number} ${nextDuty.subject_name ? `· ${nextDuty.subject_name}` : ''} at ${nextDuty.time_from} — Gr.${nextDuty.grade}-${nextDuty.section}`
                        : 'All substitute periods done for today'
                    }
                  </p>
                </div>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${currentDuty ? 'bg-amber-500 text-white border-amber-400' : 'bg-amber-200 text-amber-800 border-amber-300'}`}>
                {substituteDuties.length} period{substituteDuties.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Period pills */}
            <div className="flex gap-2 flex-wrap">
              {substituteDuties.map(duty => {
                const fromMin = duty.time_from ? timeToMinutes(duty.time_from) : 0
                const toMin   = duty.time_to   ? timeToMinutes(duty.time_to)   : 0
                const isNow   = !!(duty.time_from && duty.time_to && nowMin >= fromMin && nowMin < toMin)
                const isDone  = !!(duty.time_to && toMin <= nowMin)
                return (
                  <div key={duty.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-xs ${
                    isNow  ? 'bg-white border-amber-300 text-amber-900 font-semibold shadow-sm' :
                    isDone ? (currentDuty ? 'bg-amber-500 border-amber-400 text-amber-100 opacity-60' : 'bg-white border-amber-100 text-gray-400 opacity-60') :
                    currentDuty ? 'bg-amber-500 border-amber-400 text-amber-100' : 'bg-white border-amber-200 text-amber-800'
                  }`}>
                    {isNow && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />}
                    <span className="font-bold">P{duty.period_number}</span>
                    {duty.subject_name && <span className="opacity-80">{duty.subject_name}</span>}
                    <span className="opacity-70">Gr.{duty.grade}-{duty.section}</span>
                    {duty.time_from && <span className="opacity-60">{duty.time_from}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {/* Next Class card */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Next Class</p>
          {currentClass ? (
            <>
              <p className="text-base font-bold text-gray-900 leading-tight">{currentClass.subject}</p>
              <p className="text-xs text-gray-500 mt-0.5">Gr.{currentClass.grade}-{currentClass.section}</p>
              <p className="text-xs text-green-600 font-semibold mt-1">● In progress</p>
            </>
          ) : nextClass ? (
            <>
              <p className="text-base font-bold text-gray-900 leading-tight">{nextClass.subject}</p>
              <p className="text-xs text-gray-500 mt-0.5">Gr.{nextClass.grade}-{nextClass.section}</p>
              <p className="text-xs text-orange-500 font-semibold mt-1">
                in {minsUntilNext! < 60
                  ? `${minsUntilNext} min`
                  : `${Math.floor(minsUntilNext! / 60)}h ${minsUntilNext! % 60}m`
                } · {nextClass.time_from}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-bold text-gray-400">—</p>
              <p className="text-xs text-gray-400 mt-1">No more classes today</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Today&apos;s Classes</p>
          <p className="text-3xl font-bold text-gray-900">{todayPeriods.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">periods scheduled</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Role</p>
          {isClassTeacher ? (
            <>
              <p className="text-base font-bold text-blue-700">Class Teacher</p>
              <p className="text-xs text-blue-500 mt-0.5">Grade {teacher.class_teacher_grade} – Sec {teacher.class_teacher_section}</p>
            </>
          ) : (
            <>
              <p className="text-base font-bold text-gray-700">Subject Teacher</p>
              <p className="text-xs text-gray-400 mt-0.5">{teacher.subject || 'No subject set'}</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Department</p>
          <p className="text-base font-bold text-gray-900">{teacher.department || '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{teacher.employee_id}</p>
        </div>
      </div>

      {/* Today's Timetable */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-gray-900">Today&apos;s Timetable</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{today ?? 'Weekend'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{dateStr}</span>
            <button onClick={() => onNavigate('timetable')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View Full →
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading timetable...</div>
        ) : !today ? (
          <div className="py-10 text-center text-gray-400 text-sm">No school today — enjoy your weekend!</div>
        ) : todayPeriods.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <p className="text-sm">No classes scheduled for today</p>
            <p className="text-xs text-gray-300 mt-1">Ask school admin to generate your timetable</p>
          </div>
        ) : (
          <div className="px-5 py-4 flex gap-3 overflow-x-auto pb-5">
            {todayPeriods.map(p => {
              const isCurrent = p.time_from && p.time_to
                ? nowMins >= timeToMinutes(p.time_from) && nowMins < timeToMinutes(p.time_to)
                : false
              const isPast = p.time_to ? timeToMinutes(p.time_to) <= nowMins : false
              const isSub = p.isSubstitute
              return (
                <div key={`${isSub ? 'sub' : 'own'}-${p.id}`} className={`flex-shrink-0 w-36 rounded-xl p-3 border transition-all ${
                  isCurrent && isSub ? 'bg-amber-600 border-amber-500 text-white shadow-lg' :
                  isCurrent ? 'bg-slate-800 border-slate-700 text-white shadow-lg' :
                  isPast ? 'bg-gray-50 border-gray-200 opacity-50' :
                  isSub ? 'bg-amber-50 border-amber-200' :
                  'bg-white border-gray-200 hover:border-blue-200'
                }`}>
                  <div className="flex items-center gap-1 mb-1.5">
                    {isCurrent && <span className={`inline-block text-white text-[10px] font-bold px-2 py-0.5 rounded-full ${isSub ? 'bg-amber-800' : 'bg-orange-400'}`}>NOW</span>}
                    {isPast && <span className="inline-block text-[10px] text-gray-400">DONE</span>}
                    {isSub && !isCurrent && !isPast && <span className="inline-block bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">SUB</span>}
                  </div>
                  <p className={`text-xs mb-1 ${isCurrent ? 'text-gray-300' : isSub ? 'text-amber-500' : 'text-gray-400'}`}>
                    {p.time_from} – {p.time_to}
                  </p>
                  <p className={`font-bold text-sm leading-tight ${isCurrent ? 'text-white' : isSub ? 'text-amber-800' : 'text-gray-800'}`}>
                    {p.subject || '—'}
                  </p>
                  {p.grade && (
                    <p className={`text-xs mt-1 ${isCurrent ? 'text-gray-300' : isSub ? 'text-amber-700' : 'text-gray-500'}`}>
                      Class {p.grade}-{p.section}
                    </p>
                  )}
                  {isSub && p.originalTeacher && (
                    <p className={`text-[10px] mt-0.5 truncate ${isCurrent ? 'text-amber-200' : 'text-amber-500'}`}>
                      for {p.originalTeacher}
                    </p>
                  )}
                  {!isSub && p.room && <p className="text-xs text-gray-400 mt-0.5">{p.room}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Substitute Duties Today */}
      {substituteDuties.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl">
          <div className="px-5 py-4 flex items-center justify-between border-b border-amber-100">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-amber-800">Substitute Duties Today</span>
              <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">{substituteDuties.length} period{substituteDuties.length > 1 ? 's' : ''}</span>
            </div>
            <p className="text-xs text-amber-600">You are covering for absent teachers</p>
          </div>
          <div className="px-5 py-4 flex gap-3 flex-wrap">
            {substituteDuties.map(duty => {
              const nowMin = getNowMins()
              const fromMin = duty.time_from ? timeToMinutes(duty.time_from) : 0
              const toMin = duty.time_to ? timeToMinutes(duty.time_to) : 0
              const isCurrent = duty.time_from && duty.time_to && nowMin >= fromMin && nowMin < toMin
              const isPast = duty.time_to && toMin <= nowMin
              return (
                <div key={duty.id} className={`rounded-xl border px-4 py-3 min-w-[160px] ${
                  isCurrent ? 'bg-amber-600 border-amber-500 text-white' :
                  isPast ? 'bg-white border-amber-100 opacity-60' :
                  'bg-white border-amber-200'
                }`}>
                  {isCurrent && <span className="inline-block bg-white text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full mb-2">NOW</span>}
                  <p className={`text-sm font-bold leading-tight ${isCurrent ? 'text-white' : 'text-gray-800'}`}>
                    Class {duty.grade}-{duty.section}
                  </p>
                  <p className={`text-xs mt-0.5 ${isCurrent ? 'text-amber-100' : 'text-gray-500'}`}>
                    P{duty.period_number}{duty.subject_name ? ` · ${duty.subject_name}` : ''}
                  </p>
                  {duty.time_from && (
                    <p className={`text-xs mt-0.5 ${isCurrent ? 'text-amber-200' : 'text-gray-400'}`}>
                      {duty.time_from}–{duty.time_to}
                    </p>
                  )}
                  <p className={`text-[10px] mt-1 truncate ${isCurrent ? 'text-amber-200' : 'text-gray-400'}`}>
                    for {duty.original_teacher_name || 'absent teacher'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* My Classes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-900">My Classes</h3>
          <p className="text-xs text-gray-400">
            {isClassTeacher ? 'Your class → full view · Others → timetable' : 'Click to view timetable'}
          </p>
        </div>
        {myClasses.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-8 text-center text-sm text-gray-400">
            No class assignments yet — timetable needed
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {myClasses.map(cls => {
              const isClassTeacherFor = isClassTeacher &&
                cls.grade === teacher.class_teacher_grade &&
                cls.section === teacher.class_teacher_section
              return (
                <button
                  key={`${cls.grade}-${cls.section}`}
                  onClick={() => {
                    if (!cls.classInfo) return
                    if (isClassTeacherFor) onViewClass(cls.classInfo)
                    else openTimetableModal(cls.classInfo)
                  }}
                  className="text-left bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-md hover:border-blue-200">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-2xl font-bold text-gray-900">{cls.grade}-{cls.section}</p>
                    {isClassTeacherFor && (
                      <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">★ CT</span>
                    )}
                  </div>
                  {cls.subjects.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cls.subjects.slice(0, 3).map(s => (
                        <span key={s} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                      {cls.subjects.length > 3 && <span className="text-[10px] text-gray-400">+{cls.subjects.length - 3}</span>}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {isClassTeacherFor ? '★ Class Teacher · click for full view' : 'Subject Teacher · click for timetable'}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Timetable modal for non-class-teacher classes */}
      {modalClass && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-16 overflow-y-auto" onClick={() => setModalClass(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Grade {modalClass.grade} – Section {modalClass.section} · Timetable
                </h3>
                {modalClass.class_teacher_name && (
                  <p className="text-sm text-gray-500">Class Teacher: {modalClass.class_teacher_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalWeekOffset(o => o - 1)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50">← Prev</button>
                <button
                  onClick={() => setModalWeekOffset(0)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${modalWeekOffset === 0 ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  This Week
                </button>
                <button onClick={() => setModalWeekOffset(o => o + 1)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50">Next →</button>
                <button onClick={() => setModalClass(null)} className="ml-2 text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
            </div>
            <div className="p-4">
              {modalLoading ? (
                <div className="py-12 text-center text-gray-400">Loading timetable...</div>
              ) : modalSlots.length === 0 ? (
                <div className="py-12 text-center text-gray-400">No timetable generated for this class yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-28 border-r border-slate-700">Time</th>
                        {ctDays.map(day => (
                          <th key={day} className={`px-3 py-2.5 text-center font-semibold border-r border-slate-700 last:border-r-0 ${day === today ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                            {day.slice(0, 3)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ctAllPeriods.map(pNum => {
                        const breakSlot = modalSlots.find(s => s.period_number === pNum && s.is_break)
                        if (breakSlot) {
                          return (
                            <tr key={pNum} className="bg-amber-50 border-y border-amber-200">
                              <td className="px-3 py-1.5 border-r border-amber-200 text-amber-600 font-semibold">
                                <span className="block">{breakSlot.break_label}</span>
                                <span className="text-amber-400 font-normal">{breakSlot.time_from}–{breakSlot.time_to}</span>
                              </td>
                              <td colSpan={5} className="text-center text-amber-400 italic py-1.5">{breakSlot.break_label}</td>
                            </tr>
                          )
                        }
                        const anySlot = modalSlots.find(s => s.period_number === pNum && !s.is_break)
                        return (
                          <tr key={pNum} className="border-b border-gray-100">
                            <td className="px-3 py-2 border-r border-gray-100 bg-gray-50 font-semibold text-gray-600">
                              <span className="block">P{pNum}</span>
                              <span className="font-normal text-gray-400">{anySlot?.time_from}–{anySlot?.time_to}</span>
                            </td>
                            {ctDays.map(day => {
                              const slot = getCtSlot(day, pNum)
                              const isNow = !!(day === today && slot && nowMins >= timeToMinutes(slot.time_from) && nowMins < timeToMinutes(slot.time_to))
                              const cellDate = modalWeekDates[day]
                              const sub = cellDate ? modalSubLookup.get(`${cellDate}-${pNum}`) : undefined
                              const hasSub = !!sub
                              return (
                                <td key={day} className={`px-2 py-1.5 border-r border-gray-100 last:border-r-0 ${hasSub ? 'bg-amber-50/40' : isNow ? 'bg-orange-50' : ''}`}>
                                  {(slot?.subject_name || hasSub) ? (
                                    <div className={`rounded-lg px-2 py-1.5 ${
                                      hasSub ? 'border-2 border-amber-300 bg-amber-50' :
                                      isNow ? 'border-2 border-orange-400 bg-orange-50' :
                                      'bg-gray-50 border border-gray-100'
                                    }`}>
                                      <div className="flex items-center gap-1">
                                        <p className="font-semibold text-gray-800 text-xs truncate">
                                          {slot?.subject_name || sub?.subject_name || sub?.original_teacher_department || '—'}
                                        </p>
                                        {hasSub && <span className="text-[8px] bg-amber-400 text-white px-1 py-0.5 rounded font-bold flex-shrink-0">SUB</span>}
                                      </div>
                                      {hasSub ? (
                                        <>
                                          <p className="text-gray-300 line-through text-[9px]">{slot?.teacher_name || sub?.original_teacher_name}</p>
                                          <p className="text-amber-600 font-semibold text-[10px] truncate">{sub.substitute_teacher_name || 'Substitute'}</p>
                                        </>
                                      ) : (
                                        slot?.teacher_name && <p className="text-gray-400 mt-0.5 text-[10px]">{slot.teacher_name}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="rounded-lg px-2 py-1.5 bg-gray-50 border border-gray-100 text-gray-300 italic text-center">Free</div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
