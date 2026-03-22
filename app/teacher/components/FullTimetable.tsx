'use client'

import React, { useEffect, useState } from 'react'

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

type SubDuty = {
  id: number
  period_number: number
  subject_name: string | null
  grade: string
  section: string
  original_teacher_name: string | null
  time_from: string | null
  time_to: string | null
}

type TeacherInfo = {
  class_teacher_grade: string | null
  class_teacher_section: string | null
  name: string
}

type ClassInfo = {
  id: number
  grade: string
  section: string
  class_teacher_id: number | null
}

type Props = {
  teacherId: number
  schoolId: number
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Break is shown client-side after period 3
const ALL_PERIODS = [1, 2, 3, 4, 5, 6]
const PERIOD_TIMES: Record<number, { from: string; to: string }> = {
  1: { from: '08:00', to: '08:45' },
  2: { from: '08:50', to: '09:35' },
  3: { from: '09:40', to: '10:25' },
  4: { from: '10:45', to: '11:30' },
  5: { from: '11:35', to: '12:20' },
  6: { from: '12:25', to: '13:10' },
}
const BREAK_AFTER_PERIOD = 3
const BREAK_TIME = { from: '10:25', to: '10:45', label: 'Break Time' }

function timeToMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function getToday() {
  const day = new Date().getDay()
  if (day === 0) return null // Sunday only is off
  if (day === 6) return 'Saturday'
  return DAYS[day - 1] // Mon=1→index 0 … Fri=5→index 4
}

function getNowMinutes() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export default function FullTimetable({ teacherId, schoolId }: Props) {
  const [timetable, setTimetable] = useState<Period[]>([])
  const [teacherInfo, setTeacherInfo] = useState<TeacherInfo | null>(null)
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(getNowMinutes())
  const [substituteDuties, setSubstituteDuties] = useState<SubDuty[]>([])

  const [notifModal, setNotifModal] = useState<{ period: Period; classTeacherId: number | null } | null>(null)
  const [notifType, setNotifType] = useState<'delay' | 'absent'>('delay')
  const [delayMinutes, setDelayMinutes] = useState(10)
  const [notifSending, setNotifSending] = useState(false)
  const [notifSent, setNotifSent] = useState(false)

  const [unavailSlots, setUnavailSlots] = useState<{ day_of_week: string; period_number: number }[]>([])
  const [showAvail, setShowAvail] = useState(false)
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null)

  const today = getToday()

  useEffect(() => {
    const timer = setInterval(() => setNow(getNowMinutes()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toISOString().split('T')[0]
      try {
        const [tt, teacher, clsList, avail, subs] = await Promise.all([
          fetch(`/api/timetable?teacher_id=${teacherId}&school_id=${schoolId}`).then(r => r.json()),
          fetch(`/api/teachers/${teacherId}`).then(r => r.json()),
          fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
          fetch(`/api/teacher-availability?teacher_id=${teacherId}&school_id=${schoolId}`).then(r => r.json()),
          fetch(`/api/substitutes?school_id=${schoolId}&substitute_teacher_id=${teacherId}&date=${todayStr}`).then(r => r.json()),
        ])
        setTimetable(Array.isArray(tt) ? tt : [])
        setTeacherInfo(teacher || null)
        setClasses(Array.isArray(clsList) ? clsList : [])
        setUnavailSlots(Array.isArray(avail) ? avail : [])
        setSubstituteDuties(Array.isArray(subs) ? subs : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [teacherId, schoolId])

  const byDay: Record<string, Period[]> = {}
  DAYS.forEach(d => { byDay[d] = [] })
  timetable.forEach(p => { if (byDay[p.day_of_week]) byDay[p.day_of_week].push(p) })
  DAYS.forEach(d => byDay[d].sort((a, b) => a.period_number - b.period_number))

  function isCurrentPeriod(timeFrom: string, timeTo: string) {
    return now >= timeToMinutes(timeFrom) && now < timeToMinutes(timeTo)
  }

  function isClassTeacherClass(grade: string, section: string) {
    return teacherInfo?.class_teacher_grade === grade && teacherInfo?.class_teacher_section === section
  }

  function getClassTeacherId(grade: string, section: string) {
    return classes.find(c => c.grade === grade && c.section === section)?.class_teacher_id ?? null
  }

  async function toggleMySlot(day: string, pNum: number) {
    const key = `${day}-${pNum}`
    setTogglingSlot(key)
    const isUnavail = unavailSlots.some(s => s.day_of_week === day && s.period_number === pNum)
    try {
      if (isUnavail) {
        await fetch(`/api/teacher-availability?teacher_id=${teacherId}&school_id=${schoolId}&day_of_week=${day}&period_number=${pNum}`, { method: 'DELETE' })
        setUnavailSlots(prev => prev.filter(s => !(s.day_of_week === day && s.period_number === pNum)))
      } else {
        const res = await fetch('/api/teacher-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacherId, school_id: schoolId, day_of_week: day, period_number: pNum }),
        })
        const data = await res.json()
        if (!data.already_set) setUnavailSlots(prev => [...prev, { day_of_week: day, period_number: pNum }])
      }
    } finally { setTogglingSlot(null) }
  }

  async function sendNotification() {
    if (!notifModal) return
    setNotifSending(true)
    try {
      const isAbsent = notifType === 'absent'
      const ctId = notifModal.classTeacherId
      if (ctId) {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId,
            recipient_teacher_id: ctId,
            sender_teacher_id: teacherId,
            type: isAbsent ? 'substitute_needed' : 'period_delay',
            title: isAbsent
              ? `Substitute needed — Period ${notifModal.period.period_number}`
              : `Delay ${delayMinutes}min — Period ${notifModal.period.period_number}`,
            message: isAbsent
              ? `Unable to attend Period ${notifModal.period.period_number} (${notifModal.period.subject}) for Grade ${notifModal.period.grade}-${notifModal.period.section}. Please arrange a substitute.`
              : `Period ${notifModal.period.period_number} (${notifModal.period.subject}) for Gr.${notifModal.period.grade}-${notifModal.period.section} will be delayed by ${delayMinutes} minutes.`,
            data: {
              period_number: notifModal.period.period_number,
              subject: notifModal.period.subject,
              grade: notifModal.period.grade,
              section: notifModal.period.section,
              delay_minutes: isAbsent ? null : delayMinutes,
            }
          })
        })
      }
      setNotifSent(true)
      setTimeout(() => { setNotifModal(null); setNotifSent(false) }, 2000)
    } finally {
      setNotifSending(false)
    }
  }

  const todayPeriods = today ? (byDay[today] || []) : []
  const ctClass = teacherInfo?.class_teacher_grade
    ? `${teacherInfo.class_teacher_grade}-${teacherInfo.class_teacher_section}`
    : null
  const freeTodayCount = ALL_PERIODS.length - todayPeriods.length

  if (loading) return <div className="py-12 text-center text-gray-400">Loading timetable...</div>

  if (timetable.length === 0) {
    if (substituteDuties.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-500 font-medium">No timetable assigned yet</p>
          <p className="text-gray-400 text-sm mt-1">Contact school admin to generate your timetable</p>
        </div>
      )
    }
    // No permanent timetable but has substitute duties today — show just those
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 py-8 text-center">
          <p className="text-gray-400 text-sm">No permanent timetable assigned yet</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl">
          <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-2">
            <span className="font-bold text-amber-800">Substitute Duties Today</span>
            <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">{substituteDuties.length} period{substituteDuties.length > 1 ? 's' : ''}</span>
          </div>
          <div className="px-5 py-4 flex gap-3 flex-wrap">
            {substituteDuties.map(duty => {
              const fromMin = duty.time_from ? timeToMinutes(duty.time_from) : 0
              const toMin = duty.time_to ? timeToMinutes(duty.time_to) : 0
              const isCurrent = !!(duty.time_from && duty.time_to && now >= fromMin && now < toMin)
              return (
                <div key={duty.id} className={`rounded-xl border px-4 py-3 min-w-[160px] ${isCurrent ? 'bg-amber-600 border-amber-500 text-white' : 'bg-white border-amber-200'}`}>
                  {isCurrent && <span className="inline-block bg-white text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full mb-2">NOW</span>}
                  <p className={`text-sm font-bold ${isCurrent ? 'text-white' : 'text-gray-800'}`}>Class {duty.grade}-{duty.section}</p>
                  <p className={`text-xs mt-0.5 ${isCurrent ? 'text-amber-100' : 'text-gray-500'}`}>P{duty.period_number}{duty.subject_name ? ` · ${duty.subject_name}` : ''}</p>
                  {duty.time_from && <p className={`text-xs mt-0.5 ${isCurrent ? 'text-amber-200' : 'text-gray-400'}`}>{duty.time_from}–{duty.time_to}</p>}
                  <p className={`text-[10px] mt-1 truncate ${isCurrent ? 'text-amber-200' : 'text-gray-400'}`}>for {duty.original_teacher_name || 'absent teacher'}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Full Timetable</h2>
          <p className="text-sm text-gray-500 mt-0.5">Click any period to report a delay or absence</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-900 inline-block border border-blue-700"></span> Your Class ★
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block"></span> Subject
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block"></span> Free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border-2 border-orange-400 inline-block"></span> Now
          </span>
          {substituteDuties.length > 0 && (
            <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
              <span className="w-3 h-3 rounded bg-amber-200 border border-amber-400 inline-block"></span>
              Substitute ({substituteDuties.length} period{substituteDuties.length > 1 ? 's' : ''} today)
            </span>
          )}
        </div>
      </div>

      {/* Timetable Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="bg-slate-800 text-slate-200 px-4 py-3 text-left font-semibold w-36 border-r border-slate-700">Time</th>
                {DAYS.map(day => (
                  <th key={day} className={`px-3 py-3 text-center font-semibold border-r border-slate-700 last:border-r-0 ${day === today ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    <span className="block">{day.slice(0, 3)}</span>
                    {day === today && <span className="text-[10px] font-normal text-blue-200">Today</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PERIODS.map(pNum => {
                const { from, to } = PERIOD_TIMES[pNum]
                const isNowRow = today !== null && isCurrentPeriod(from, to)
                return (
                  <React.Fragment key={pNum}>
                    <tr className={`border-b border-gray-100 ${isNowRow ? 'bg-orange-50/40' : ''}`}>
                      <td className={`px-4 py-2 border-r border-gray-100 font-semibold ${isNowRow ? 'bg-orange-50 text-orange-700 border-r-orange-200' : 'bg-gray-50 text-gray-600'}`}>
                        <span className="block text-sm">P{pNum}</span>
                        <span className="font-normal text-gray-400 text-xs">{from}–{to}</span>
                        {isNowRow && <span className="block text-[10px] text-orange-500 font-bold mt-0.5">● NOW</span>}
                      </td>
                      {DAYS.map(day => {
                        const period = byDay[day].find(p => p.period_number === pNum)
                        const isNowCell = day === today && isNowRow
                        const subDuty = day === today
                          ? substituteDuties.find(s => s.period_number === pNum)
                          : undefined

                        if (!period && subDuty) {
                          return (
                            <td key={day} className={`px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 ${isNowCell ? 'bg-amber-50/50' : ''}`}>
                              <div className={`rounded-lg px-2.5 py-2 min-h-[52px] bg-amber-50 border-2 border-amber-300 ${isNowCell ? 'ring-2 ring-orange-400 ring-offset-1' : ''}`}>
                                <div className="flex items-start justify-between gap-0.5 mb-0.5">
                                  <span className="font-bold text-xs text-amber-800 leading-tight">{subDuty.subject_name || 'Class'}</span>
                                  <span className="text-[9px] bg-amber-400 text-white px-1 py-0.5 rounded font-bold flex-shrink-0">SUB</span>
                                </div>
                                <p className="text-xs text-amber-700">Gr.{subDuty.grade}-{subDuty.section}</p>
                                <p className="text-[10px] text-amber-500 truncate">for {subDuty.original_teacher_name || 'absent teacher'}</p>
                              </div>
                            </td>
                          )
                        }

                        if (!period) {
                          return (
                            <td key={day} className={`px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 ${isNowCell ? 'bg-orange-50/50' : ''}`}>
                              <div className={`rounded-lg min-h-[52px] flex items-center justify-center ${isNowCell ? 'bg-orange-100/50 border border-orange-200' : 'bg-gray-100 border border-gray-200'}`}>
                                <span className="text-gray-300 italic text-xs">Free</span>
                              </div>
                            </td>
                          )
                        }

                        const isCT = isClassTeacherClass(period.grade, period.section)
                        const ctId = getClassTeacherId(period.grade, period.section)

                        return (
                          <td key={day} className={`px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 align-top ${isNowCell ? 'bg-orange-50/30' : ''}`}>
                            <button
                              onClick={() => { setNotifModal({ period, classTeacherId: ctId }); setNotifType('delay'); setDelayMinutes(10); setNotifSent(false) }}
                              title="Click to report delay or absence"
                              className={`w-full text-left rounded-lg px-2.5 py-2 min-h-[52px] transition-all hover:opacity-90 hover:shadow-md group ${isNowCell ? 'ring-2 ring-orange-400 ring-offset-1' : ''} ${isCT ? 'bg-blue-900 border border-blue-800 text-white' : 'bg-emerald-50 border border-emerald-200 text-gray-800'}`}>
                              <div className="flex items-start justify-between gap-0.5">
                                <span className={`font-bold text-xs leading-tight ${isCT ? 'text-white' : 'text-gray-800'}`}>{period.subject}</span>
                                {isCT && <span className="text-yellow-300 text-xs leading-none">★</span>}
                              </div>
                              <p className={`text-xs mt-0.5 ${isCT ? 'text-blue-300' : 'text-gray-500'}`}>Gr.{period.grade}-{period.section}</p>
                              {period.room && <p className={`text-xs ${isCT ? 'text-blue-400' : 'text-gray-400'}`}>{period.room}</p>}
                              <p className={`text-[10px] mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isCT ? 'text-blue-400' : 'text-gray-400'}`}>tap to report</p>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                    {pNum === BREAK_AFTER_PERIOD && (
                      <tr className="bg-amber-50 border-y border-amber-200">
                        <td className="px-4 py-1.5 border-r border-amber-200 text-amber-600 font-semibold text-xs">
                          <span className="block">{BREAK_TIME.label}</span>
                          <span className="text-amber-400 font-normal">{BREAK_TIME.from}–{BREAK_TIME.to}</span>
                        </td>
                        <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-1.5 font-medium text-xs">
                          {BREAK_TIME.label}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats */}
      <div className={`grid gap-3 mb-5 ${ctClass ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{ALL_PERIODS.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Periods/Day</p>
        </div>
        {ctClass && (
          <div className="bg-blue-900 rounded-xl px-4 py-3 text-center">
            <p className="text-lg font-bold text-white">Class {ctClass} ★</p>
            <p className="text-xs text-blue-300 mt-0.5">Class Teacher</p>
          </div>
        )}
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{todayPeriods.length}</p>
          <p className="text-xs text-emerald-500 mt-0.5">Today's Classes</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-400">{Math.max(0, freeTodayCount)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Free Periods Today</p>
        </div>
      </div>

      {/* My Availability */}
      <div className="bg-white rounded-xl border border-gray-200 mb-5 overflow-hidden">
        <button
          onClick={() => setShowAvail(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors">
          <div>
            <p className="font-semibold text-gray-800">My Availability</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {unavailSlots.length > 0
                ? `${unavailSlots.length} slot${unavailSlots.length !== 1 ? 's' : ''} marked unavailable — admin uses this when generating timetable`
                : 'Mark slots where you cannot teach — timetable generator will respect these'}
            </p>
          </div>
          <span className="text-gray-400 text-lg">{showAvail ? '▲' : '▼'}</span>
        </button>

        {showAvail && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 mt-3 mb-3">
              <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300 mr-1" />Available
              <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300 mr-1 ml-3" />Unavailable (blocked from timetable)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="bg-slate-800 text-slate-200 px-3 py-2 text-left font-semibold w-16">P</th>
                    {DAYS.map(d => (
                      <th key={d} className={`px-2 py-2 text-center font-semibold ${d === today ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                        {d.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PERIODS.map(pNum => (
                    <tr key={pNum} className="border-b border-gray-100">
                      <td className="px-3 py-1.5 bg-gray-50 font-semibold text-gray-500 border-r border-gray-100 text-center">
                        <span className="block">P{pNum}</span>
                        <span className="text-gray-300 font-normal text-[10px]">{PERIOD_TIMES[pNum].from}</span>
                      </td>
                      {DAYS.map(day => {
                        const blocked = unavailSlots.some(s => s.day_of_week === day && s.period_number === pNum)
                        const key = `${day}-${pNum}`
                        const toggling = togglingSlot === key
                        const hasPeriod = byDay[day].some(p => p.period_number === pNum)
                        return (
                          <td key={day} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                            <button
                              onClick={() => toggleMySlot(day, pNum)}
                              disabled={toggling}
                              title={hasPeriod ? 'Period already assigned — mark unavailable to flag for next regeneration' : ''}
                              className={`w-full rounded px-1 py-2 text-center transition-colors border text-xs font-medium ${
                                blocked
                                  ? 'bg-red-100 border-red-300 text-red-600 hover:bg-red-200'
                                  : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                              } ${toggling ? 'opacity-50' : ''}`}
                            >
                              {toggling ? '...' : blocked ? 'Busy' : 'Free'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-teal-600 mt-3 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
              Changes take effect the next time admin regenerates the timetable.
            </p>
          </div>
        )}
      </div>

      {/* Notification Modal */}
      {notifModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setNotifModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            {notifSent ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 text-2xl">✓</span>
                </div>
                <p className="font-bold text-gray-900">Notification Sent!</p>
                <p className="text-sm text-gray-500 mt-1">Class teacher has been notified</p>
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-gray-900">Report Issue</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Period {notifModal.period.period_number} · <span className="font-semibold">{notifModal.period.subject}</span>
                  </p>
                  <p className="text-xs text-gray-400">
                    Gr.{notifModal.period.grade}-{notifModal.period.section} · {notifModal.period.time_from}–{notifModal.period.time_to}
                  </p>
                </div>

                <div className="flex gap-2 mb-5">
                  <button onClick={() => setNotifType('delay')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${notifType === 'delay' ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    Report Delay
                  </button>
                  <button onClick={() => setNotifType('absent')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${notifType === 'absent' ? 'bg-red-500 border-red-500 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    Not Attending
                  </button>
                </div>

                {notifType === 'delay' && (
                  <div className="mb-5">
                    <p className="text-sm font-medium text-gray-700 mb-2">Delay duration</p>
                    <div className="flex gap-2">
                      {[5, 10, 15, 20, 30].map(min => (
                        <button key={min} onClick={() => setDelayMinutes(min)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${delayMinutes === min ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          {min}m
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {notifType === 'absent' && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-5">
                    <p className="text-sm text-red-700 font-medium">Substitute request</p>
                    <p className="text-xs text-red-500 mt-0.5">The class teacher will be notified to arrange a substitute for this period.</p>
                  </div>
                )}

                {!notifModal.classTeacherId && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
                    <p className="text-xs text-amber-700">No class teacher assigned for this class — notification cannot be delivered.</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setNotifModal(null)}
                    className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={sendNotification} disabled={notifSending || !notifModal.classTeacherId}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${notifType === 'absent' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
                    {notifSending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
