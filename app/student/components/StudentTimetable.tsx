'use client'

import React, { useEffect, useState } from 'react'
import { SCHEDULE, ACADEMIC_SLOTS, DAYS } from '@/lib/schedule'

type TimetableSlot = {
  id: number
  day_of_week: string
  period_number: number
  time_from: string
  time_to: string
  subject_name: string | null
  teacher_name: string | null
  room: string | null
  is_break: boolean
  break_label: string | null
}

type Props = {
  classId: number
  schoolId: number
  grade: string
  section: string
}

function getToday(): string | null {
  const day = new Date().getDay()
  if (day === 0) return null
  if (day === 6) return 'Saturday'
  return DAYS[day - 1] ?? null
}

function getNowMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export default function StudentTimetable({ classId, schoolId, grade, section }: Props) {
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(getNowMinutes())
  const today = getToday()

  useEffect(() => {
    const timer = setInterval(() => setNow(getNowMinutes()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetch(`/api/class-timetable?class_id=${classId}&school_id=${schoolId}`)
      .then(r => r.json())
      .then(d => setTimetable(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [classId, schoolId])

  const academicFilled = timetable.filter(s => !s.is_break && s.subject_name).length
  const totalAcademic = ACADEMIC_SLOTS.length * DAYS.length

  const todaySlots = timetable
    .filter(s => s.day_of_week === today && !s.is_break)
    .sort((a, b) => a.period_number - b.period_number)

  const currentSlot = todaySlots.find(s => {
    const from = timeToMinutes(s.time_from)
    const to = timeToMinutes(s.time_to)
    return now >= from && now < to
  })

  if (loading) return <div className="py-12 text-center text-gray-400">Loading timetable...</div>

  if (timetable.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-gray-500 font-medium">Timetable not generated yet</p>
        <p className="text-gray-400 text-sm mt-1">Check back once school admin generates the timetable</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">My Timetable</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Grade {grade}–{section} · 08:30 – 17:00 · 8 periods/day
        </p>
      </div>

      {/* Current period callout */}
      {currentSlot && (
        <div className="bg-yellow-500 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-yellow-900 uppercase tracking-wide mb-0.5">Happening Now</p>
            <p className="text-xl font-bold text-white">{currentSlot.subject_name}</p>
            <p className="text-yellow-100 text-sm mt-0.5">
              {currentSlot.time_from} – {currentSlot.time_to}
              {currentSlot.teacher_name && ` · ${currentSlot.teacher_name}`}
              {currentSlot.room && ` · ${currentSlot.room}`}
            </p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">📚</span>
          </div>
        </div>
      )}

      {/* Today's schedule strip */}
      {today && todaySlots.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Today — {today}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {todaySlots.map(slot => {
              const isCurrent = slot === currentSlot
              const isPast = timeToMinutes(slot.time_to) < now && today !== null
              return (
                <div key={slot.id} className={`px-4 py-3 flex items-center gap-4 ${isCurrent ? 'bg-yellow-50' : isPast ? 'opacity-50' : ''}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isCurrent ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {SCHEDULE.find(s => s.slot === Math.round(Number(slot.period_number)))?.short ?? `P${slot.period_number}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${isCurrent ? 'text-yellow-800' : 'text-gray-800'}`}>
                      {slot.subject_name || <span className="text-gray-300 italic">Free Period</span>}
                      {isCurrent && <span className="ml-2 text-[10px] bg-yellow-500 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">Now</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {slot.time_from} – {slot.time_to}
                      {slot.teacher_name && ` · ${slot.teacher_name}`}
                      {slot.room && ` · ${slot.room}`}
                    </p>
                  </div>
                  {isPast && !isCurrent && <span className="text-[10px] text-gray-300">Done</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Full weekly grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Weekly Schedule</p>
          <p className="text-xs text-gray-400">{academicFilled}/{totalAcademic} periods filled</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-24 border-r border-slate-700 sticky left-0 z-10">
                  Slot
                </th>
                {DAYS.map(day => (
                  <th key={day} className={`px-2 py-2.5 text-center font-semibold border-r border-slate-700 last:border-r-0 min-w-[90px] ${
                    day === today ? 'bg-yellow-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {day.slice(0, 3)}
                    {day === today && <span className="block text-[10px] font-normal text-yellow-200">Today</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE.map(schedSlot => {
                if (schedSlot.is_break) {
                  return (
                    <tr key={schedSlot.slot} className="bg-amber-50 border-y border-amber-100">
                      <td className="px-3 py-1.5 border-r border-amber-100 sticky left-0 bg-amber-50 z-10">
                        <span className="font-semibold text-amber-600 text-[11px]">{schedSlot.break_label}</span>
                        <span className="block text-amber-400 text-[10px]">{schedSlot.time_from}–{schedSlot.time_to}</span>
                      </td>
                      <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-1.5 text-[11px]">
                        {schedSlot.break_label}
                      </td>
                    </tr>
                  )
                }

                const isNowRow = today !== null && getNowMinutes() >= timeToMinutes(schedSlot.time_from) && getNowMinutes() < timeToMinutes(schedSlot.time_to)

                return (
                  <tr key={schedSlot.slot} className={`border-b border-gray-100 ${isNowRow ? 'bg-yellow-50/40' : ''}`}>
                    <td className={`px-3 py-1.5 border-r border-gray-100 sticky left-0 z-10 ${isNowRow ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                      <span className="font-bold text-gray-700 text-[11px] block">{schedSlot.short}</span>
                      <span className="text-gray-400 text-[10px]">{schedSlot.time_from}–{schedSlot.time_to}</span>
                    </td>
                    {DAYS.map(day => {
                      const slot = timetable.find(s =>
                        s.day_of_week === day && Math.round(Number(s.period_number)) === schedSlot.slot && !s.is_break
                      )
                      const isNowCell = day === today && isNowRow
                      return (
                        <td key={day} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                          {slot?.subject_name ? (
                            <div className={`rounded px-1.5 py-1.5 min-h-[40px] ${
                              isNowCell ? 'bg-yellow-100 border border-yellow-300' : 'bg-blue-50 border border-blue-100'
                            }`}>
                              <p className={`font-semibold text-[11px] leading-tight ${isNowCell ? 'text-yellow-800' : 'text-gray-800'}`}>
                                {slot.subject_name}
                              </p>
                              {slot.teacher_name && <p className="text-gray-500 text-[10px] mt-0.5">{slot.teacher_name}</p>}
                              {slot.room && <p className="text-gray-400 text-[10px]">{slot.room}</p>}
                            </div>
                          ) : (
                            <div className="rounded px-1.5 py-1.5 bg-gray-50 border border-gray-100 min-h-[40px] flex items-center justify-center">
                              <span className="text-gray-200 text-[10px] italic">Free</span>
                            </div>
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
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] text-gray-400 px-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-100 border border-blue-200 rounded inline-block" />Period with teacher</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-50 border border-amber-100 rounded inline-block" />Break slot</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-100 border border-yellow-300 rounded inline-block" />Current period</span>
      </div>
    </div>
  )
}
