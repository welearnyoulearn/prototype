'use client'

import React, { useEffect, useState } from 'react'

type Props = { schoolId: number }

// ─── Types ────────────────────────────────────────────────────────────────────
type ClassRow = { id: number; grade: string; section: string; class_teacher_name: string | null }
type Teacher  = { id: number; name: string; subject: string; staff_type: string }
type TimetableSlot = {
  id: number; day_of_week: string; period_number: number
  time_from: string; time_to: string
  subject_name?: string; subject?: string
  grade?: string; section?: string; room?: string
  teacher_name?: string | null; teacher_id?: number | null
}
type UnavailSlot = { day_of_week: string; period_number: number }
type CurriculumAssignment = { grade: string; curriculum_type: string }
type ClassSubstitute = {
  id: number
  period_number: number
  subject_name: string | null
  original_teacher_name: string | null
  original_teacher_department: string | null
  substitute_teacher_name: string | null
  substitute_teacher_subject?: string | null
  substitute_teacher_department?: string | null
  date: string
}

// ─── Schedule constants ───────────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ALL_PERIODS = [1, 2, 3, 4, 5, 6]
const PERIOD_TIMES: Record<number, { from: string; to: string }> = {
  1: { from: '08:00', to: '08:45' },
  2: { from: '08:50', to: '09:35' },
  3: { from: '09:40', to: '10:25' },
  4: { from: '10:45', to: '11:30' },
  5: { from: '11:35', to: '12:20' },
  6: { from: '12:25', to: '13:10' },
}
const BREAK_AFTER = 3
const BREAK_TIME = '10:25 – 10:45'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getAnchorMonday(): Date {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  if (dow === 0) monday.setDate(today.getDate() + 1)
  else monday.setDate(today.getDate() - (dow - 1))
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getWeekDates(weekOffset = 0): Record<string, string> {
  const monday = getAnchorMonday()
  monday.setDate(monday.getDate() + weekOffset * 7)
  const result: Record<string, string> = {}
  DAYS.forEach((day, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    result[day] = d.toISOString().split('T')[0]
  })
  return result
}

function getToday() {
  const d = new Date().getDay()
  if (d === 0) return null
  if (d === 6) return 'Saturday'
  return DAYS[d - 1]
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TimetableManagement({ schoolId }: Props) {
  const [tab, setTab] = useState<'generate' | 'classes' | 'teachers'>('generate')

  const tabs = [
    { key: 'generate', label: 'Generate', icon: '⚡' },
    { key: 'classes',  label: 'Class Timetables', icon: '📅' },
    { key: 'teachers', label: 'Teacher Timetables', icon: '👩‍🏫' },
  ] as const

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Timetable Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">Generate, view, and manage class & teacher timetables</p>
        </div>
      </div>

      {/* Top tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'generate'  && <GenerateTab schoolId={schoolId} />}
      {tab === 'classes'   && <ClassesTab  schoolId={schoolId} />}
      {tab === 'teachers'  && <TeachersTab schoolId={schoolId} />}
    </div>
  )
}

// ─── Generate Tab ─────────────────────────────────────────────────────────────
function GenerateTab({ schoolId }: { schoolId: number }) {
  const [classes, setClasses]         = useState<ClassRow[]>([])
  const [curriculum, setCurriculum]   = useState<CurriculumAssignment[]>([])
  const [loading, setLoading]         = useState(true)
  const [generating, setGenerating]   = useState(false)
  const [msg, setMsg]                 = useState('')
  const [isError, setIsError]         = useState(false)
  const [selectedClass, setSelectedClass] = useState('')   // '' = all
  const [replaceExisting, setReplaceExisting] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/curriculum?school_id=${schoolId}`).then(r => r.json()),
    ]).then(([cls, cur]) => {
      setClasses(Array.isArray(cls) ? cls : [])
      setCurriculum(Array.isArray(cur) ? cur : [])
    }).finally(() => setLoading(false))
  }, [schoolId])

  const gradesWithCurriculum = new Set(curriculum.map(c => c.grade))
  const eligibleClasses = classes.filter(c => gradesWithCurriculum.has(c.grade))

  async function generate() {
    setGenerating(true); setMsg(''); setIsError(false)
    try {
      const body: Record<string, unknown> = { school_id: schoolId, replace_existing: replaceExisting }
      if (selectedClass) body.class_id = parseInt(selectedClass)
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setIsError(true); setMsg(data.error || 'Generation failed'); return }
      setMsg(`✓ Generated ${data.slots} slots across ${data.classes} class(es). Teacher timetables updated.`)
    } catch { setIsError(true); setMsg('Generation failed') }
    finally { setGenerating(false) }
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading...</div>

  return (
    <div className="grid grid-cols-2 gap-6 max-w-4xl">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h3 className="font-semibold text-gray-800">Timetable Generator</h3>

        {/* Curriculum status */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Curriculum assigned to</p>
          {curriculum.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No curriculum assigned yet. Go to Curriculum section first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {curriculum.map(c => (
                <span key={c.grade} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                  Grade {c.grade} · {c.curriculum_type}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Scope */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Scope</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
            <option value="">All eligible classes ({eligibleClasses.length})</option>
            {eligibleClasses.map(c => (
              <option key={c.id} value={c.id}>Grade {c.grade} – {c.section}{c.class_teacher_name ? ` (${c.class_teacher_name})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Options */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)}
            className="mt-0.5 rounded text-blue-600" />
          <div>
            <p className="text-sm font-medium text-gray-800">Replace existing timetable</p>
            <p className="text-xs text-gray-400 mt-0.5">Clear and regenerate. Uncheck to fill only empty slots.</p>
          </div>
        </label>

        <button onClick={generate} disabled={generating || curriculum.length === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
          {generating ? 'Generating...' : '⚡ Generate Timetable'}
        </button>

        {msg && (
          <p className={`text-sm rounded-lg px-3 py-2 border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {msg}
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="font-semibold text-gray-700 text-sm mb-3">Hard Constraints</h4>
          <ul className="space-y-2 text-xs text-gray-600">
            {[
              'Teacher cannot be in 2 classes at the same time',
              'A class cannot have 2 subjects in the same slot',
              'Subject meets its configured periods/week target',
              'Teacher unavailability slots are always blocked',
            ].map(c => (
              <li key={c} className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5 flex-shrink-0">🔴</span>{c}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="font-semibold text-gray-700 text-sm mb-3">Soft Constraints</h4>
          <ul className="space-y-2 text-xs text-gray-600">
            {[
              'No consecutive same subject in a day',
              'Core subjects (Math, English, Science…) in morning slots',
              'Max 2 periods/day per subject',
              'Balance teacher workload across teachers',
              'Prefer gaps for teachers (avoid filling isolated free slots)',
            ].map(c => (
              <li key={c} className="flex items-start gap-2">
                <span className="text-yellow-500 mt-0.5 flex-shrink-0">🟡</span>{c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─── Class Timetables Tab ─────────────────────────────────────────────────────
function ClassesTab({ schoolId }: { schoolId: number }) {
  const [classes, setClasses]   = useState<ClassRow[]>([])
  const [selected, setSelected] = useState<ClassRow | null>(null)
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [loading, setLoading]   = useState(true)
  const [ttLoading, setTtLoading] = useState(false)
  const [classSubstitutes, setClassSubstitutes] = useState<ClassSubstitute[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const today = getToday()

  useEffect(() => {
    fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json())
      .then(d => setClasses(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [schoolId])

  async function selectClass(cls: ClassRow) {
    setSelected(cls); setTtLoading(true); setClassSubstitutes([])
    const [ttRes, subRes] = await Promise.all([
      fetch(`/api/class-timetable?class_id=${cls.id}&school_id=${schoolId}`),
      fetch(`/api/substitutes?school_id=${schoolId}&class_id=${cls.id}`),
    ])
    const ttData = await ttRes.json()
    const subData = await subRes.json()
    setTimetable(Array.isArray(ttData) ? ttData : [])
    setClassSubstitutes(Array.isArray(subData) ? subData : [])
    setTtLoading(false)
  }

  // Group classes by grade
  const byGrade: Record<string, ClassRow[]> = {}
  for (const c of classes) {
    if (!byGrade[c.grade]) byGrade[c.grade] = []
    byGrade[c.grade].push(c)
  }

  const weekDates = getWeekDates(weekOffset)
  const subsThisWeek = classSubstitutes.filter(s => s.date >= weekDates['Monday'] && s.date <= weekDates['Saturday'])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading classes...</div>

  return (
    <div className="flex gap-5">
      {/* Class list */}
      <div className="w-52 flex-shrink-0 space-y-3">
        {classes.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">No classes yet</p>
        ) : (
          Object.entries(byGrade).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([grade, gradeClasses]) => (
            <div key={grade} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grade {grade}</span>
              </div>
              {gradeClasses.map(c => (
                <button key={c.id} onClick={() => selectClass(c)}
                  className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 last:border-b-0 transition-colors ${
                    selected?.id === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  Section {c.section}
                  {c.class_teacher_name && <span className="block text-xs text-gray-400 font-normal">{c.class_teacher_name}</span>}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Timetable grid */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <p className="text-gray-400">Select a class to view its timetable</p>
          </div>
        ) : ttLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <p className="text-gray-400">Loading timetable...</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-gray-800">Grade {selected.grade} – Section {selected.section}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{timetable.filter(s => s.subject_name).length} periods assigned · Mon–Sat · 6 periods/day</p>
              </div>
              <div className="flex items-center gap-2">
                {subsThisWeek.length > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full font-medium">
                    {subsThisWeek.length} sub period{subsThisWeek.length > 1 ? 's' : ''} this week
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <button onClick={() => setWeekOffset(w => w - 1)} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">← Prev</button>
                  <button onClick={() => setWeekOffset(0)} className={`px-2 py-1 text-xs border rounded-lg ${weekOffset === 0 ? 'border-orange-300 bg-orange-50 text-orange-700 font-medium' : 'border-gray-200 hover:bg-gray-50'}`}>This Week</button>
                  <button onClick={() => setWeekOffset(w => w + 1)} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Next →</button>
                </div>
              </div>
            </div>

            {timetable.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <p>No timetable generated yet</p>
                <p className="text-xs text-gray-300 mt-1">Go to Generate tab to create one</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-slate-800 text-slate-200 px-3 py-3 text-left font-semibold w-28 border-r border-slate-700">Period</th>
                      {DAYS.map(d => (
                        <th key={d} className={`px-2 py-3 text-center font-semibold border-r border-slate-700 last:border-r-0 ${d === today ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                          {d.slice(0, 3)}
                          {d === today && <span className="block text-[10px] font-normal text-blue-200">Today</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_PERIODS.map(pNum => {
                      const { from, to } = PERIOD_TIMES[pNum]
                      return (
                        <React.Fragment key={pNum}>
                          <tr className="border-b border-gray-100">
                            <td className="px-3 py-2 bg-gray-50 border-r border-gray-100">
                              <span className="font-semibold text-gray-700">P{pNum}</span>
                              <span className="block text-gray-400 font-normal">{from}–{to}</span>
                            </td>
                            {DAYS.map(day => {
                              const slot = timetable.find(s => s.day_of_week === day && s.period_number === pNum)
                              const cellDate = weekDates[day]
                              const sub = cellDate ? classSubstitutes.find(s => s.date.slice(0, 10) === cellDate && s.period_number === pNum) : undefined
                              const hasSub = !!sub
                              return (
                                <td key={day} className={`px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 align-top ${hasSub ? 'bg-amber-50/30' : ''}`}>
                                  {(slot?.subject_name || hasSub) ? (
                                    <div className={`rounded-lg px-2 py-2 min-h-[52px] ${hasSub ? 'border-2 border-amber-300 bg-amber-50' : 'bg-emerald-50 border border-emerald-200'}`}>
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {hasSub ? (
                                          <p className="font-semibold text-gray-400 line-through leading-tight text-xs">
                                            {slot?.subject_name || sub?.subject_name || '—'}
                                          </p>
                                        ) : (
                                          <p className="font-semibold text-gray-800 leading-tight text-xs">
                                            {slot?.subject_name || '—'}
                                          </p>
                                        )}
                                        {hasSub && <span className="text-[9px] font-bold bg-amber-400 text-white px-1 py-0.5 rounded uppercase">SUB</span>}
                                      </div>
                                      {hasSub ? (
                                        <>
                                          <p className="text-[10px] text-amber-700 font-semibold leading-tight">
                                            {sub.substitute_teacher_subject || sub.substitute_teacher_department || sub.subject_name || '—'}
                                          </p>
                                          <p className="text-[10px] text-gray-400 line-through mt-0.5">{slot?.teacher_name || sub?.original_teacher_name}</p>
                                          <p className="text-[10px] text-amber-700 font-medium">{sub.substitute_teacher_name}</p>
                                        </>
                                      ) : (
                                        slot?.teacher_name && <p className="text-gray-500 text-[10px] mt-0.5">{slot.teacher_name}</p>
                                      )}
                                      {slot?.room && <p className="text-gray-400 text-[10px]">{slot.room}</p>}
                                    </div>
                                  ) : (
                                    <div className="rounded-lg px-2 py-2 bg-gray-50 border border-gray-100 min-h-[52px] flex items-center justify-center">
                                      <span className="text-gray-300 italic">Free</span>
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                          {pNum === BREAK_AFTER && (
                            <tr className="bg-amber-50 border-y border-amber-100">
                              <td className="px-3 py-1.5 border-r border-amber-100 text-amber-600 font-semibold text-xs">Break<span className="block text-amber-400 font-normal">{BREAK_TIME}</span></td>
                              <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-1.5 text-xs">Break Time</td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Teacher Timetables Tab ───────────────────────────────────────────────────
function TeachersTab({ schoolId }: { schoolId: number }) {
  const [teachers, setTeachers]       = useState<Teacher[]>([])
  const [selected, setSelected]       = useState<Teacher | null>(null)
  const [timetable, setTimetable]     = useState<TimetableSlot[]>([])
  const [unavail, setUnavail]         = useState<UnavailSlot[]>([])
  const [ttLoading, setTtLoading]     = useState(false)
  const [loading, setLoading]         = useState(true)
  const [showAvail, setShowAvail]     = useState(false)
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const today = getToday()

  useEffect(() => {
    fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json())
      .then(d => setTeachers(Array.isArray(d) ? d.filter((t: Teacher) => t.staff_type !== 'non_teaching') : []))
      .finally(() => setLoading(false))
  }, [schoolId])

  async function selectTeacher(t: Teacher) {
    setSelected(t); setTtLoading(true); setShowAvail(false)
    const [tt, av] = await Promise.all([
      fetch(`/api/timetable?teacher_id=${t.id}&school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/teacher-availability?teacher_id=${t.id}&school_id=${schoolId}`).then(r => r.json()),
    ])
    setTimetable(Array.isArray(tt) ? tt : [])
    setUnavail(Array.isArray(av) ? av : [])
    setTtLoading(false)
  }

  async function toggleSlot(day: string, pNum: number) {
    if (!selected) return
    const key = `${day}-${pNum}`
    setTogglingSlot(key)
    const isBlocked = unavail.some(s => s.day_of_week === day && s.period_number === pNum)
    try {
      if (isBlocked) {
        await fetch(`/api/teacher-availability?teacher_id=${selected.id}&school_id=${schoolId}&day_of_week=${day}&period_number=${pNum}`, { method: 'DELETE' })
        setUnavail(prev => prev.filter(s => !(s.day_of_week === day && s.period_number === pNum)))
      } else {
        const res = await fetch('/api/teacher-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: selected.id, school_id: schoolId, day_of_week: day, period_number: pNum }),
        })
        const data = await res.json()
        if (!data.already_set) setUnavail(prev => [...prev, { day_of_week: day, period_number: pNum }])
      }
    } finally { setTogglingSlot(null) }
  }

  const byDay: Record<string, TimetableSlot[]> = {}
  DAYS.forEach(d => { byDay[d] = [] })
  timetable.forEach(p => { if (byDay[p.day_of_week]) byDay[p.day_of_week].push(p) })

  const filtered = teachers.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.subject || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="py-12 text-center text-gray-400">Loading teachers...</div>

  return (
    <div className="flex gap-5">
      {/* Teacher list */}
      <div className="w-52 flex-shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teachers..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-6 text-center">No teachers found</p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {filtered.map(t => (
                <button key={t.id} onClick={() => selectTeacher(t)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selected?.id === t.id ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'
                  }`}>
                  <p className="text-sm font-medium text-gray-800">{t.name}</p>
                  {t.subject && <p className="text-xs text-gray-400 mt-0.5">{t.subject}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 space-y-4">
        {!selected ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <p className="text-gray-400">Select a teacher to view their timetable and availability</p>
          </div>
        ) : ttLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <p className="text-gray-400">Loading...</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{selected.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{selected.subject || 'No subject'} · {timetable.length} periods/week assigned</p>
              </div>
              <button onClick={() => setShowAvail(v => !v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  showAvail ? 'bg-teal-600 text-white border-teal-600' : 'border-teal-200 text-teal-600 hover:bg-teal-50'
                }`}>
                {showAvail ? 'Hide Availability' : 'Set Availability'}
                {unavail.length > 0 && !showAvail && (
                  <span className="ml-1.5 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full">{unavail.length}</span>
                )}
              </button>
            </div>

            {/* Timetable grid */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Weekly Timetable</p>
              </div>
              {timetable.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  No timetable assigned yet. Generate from the Generate tab.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-28 border-r border-slate-700">Period</th>
                        {DAYS.map(d => (
                          <th key={d} className={`px-2 py-2.5 text-center font-semibold border-r border-slate-700 last:border-r-0 ${d === today ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                            {d.slice(0, 3)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_PERIODS.map(pNum => {
                        const { from, to } = PERIOD_TIMES[pNum]
                        return (
                          <React.Fragment key={pNum}>
                            <tr className="border-b border-gray-100">
                              <td className="px-3 py-1.5 bg-gray-50 border-r border-gray-100">
                                <span className="font-semibold text-gray-600">P{pNum}</span>
                                <span className="block text-gray-400 font-normal" style={{ fontSize: '10px' }}>{from}–{to}</span>
                              </td>
                              {DAYS.map(day => {
                                const slot = byDay[day].find(s => s.period_number === pNum)
                                const blocked = unavail.some(s => s.day_of_week === day && s.period_number === pNum)
                                return (
                                  <td key={day} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                                    {slot ? (
                                      <div className="rounded px-1.5 py-1.5 bg-emerald-50 border border-emerald-200 min-h-[44px]">
                                        <p className="font-semibold text-gray-800 leading-tight text-[11px]">{slot.subject}</p>
                                        {slot.grade && <p className="text-gray-500 text-[10px]">Gr.{slot.grade}-{slot.section}</p>}
                                        {slot.room && <p className="text-gray-400 text-[10px]">{slot.room}</p>}
                                      </div>
                                    ) : blocked ? (
                                      <div className="rounded px-1.5 py-1.5 bg-red-50 border border-red-200 min-h-[44px] flex items-center justify-center">
                                        <span className="text-red-400 text-[10px] font-medium">Unavail.</span>
                                      </div>
                                    ) : (
                                      <div className="rounded px-1.5 py-1.5 bg-gray-50 border border-gray-100 min-h-[44px] flex items-center justify-center">
                                        <span className="text-gray-300 italic text-[10px]">Free</span>
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                            {pNum === BREAK_AFTER && (
                              <tr className="bg-amber-50 border-y border-amber-100">
                                <td className="px-3 py-1 border-r border-amber-100 text-amber-600 font-semibold text-[10px]">Break<span className="block font-normal text-amber-400">{BREAK_TIME}</span></td>
                                <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-1 text-[10px]">Break Time</td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Availability grid */}
            {showAvail && (
              <div className="bg-white rounded-xl border border-teal-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-teal-100 bg-teal-50 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-teal-800 uppercase tracking-wide">Availability Grid — {selected.name}</p>
                    <p className="text-[11px] text-teal-600 mt-0.5">Click to mark/unmark unavailable. Red slots are blocked from timetable generation.</p>
                  </div>
                  <span className="text-xs text-teal-600 font-medium">{unavail.length} blocked</span>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="bg-slate-700 text-slate-200 px-3 py-2 text-left font-semibold w-20">P</th>
                        {DAYS.map(d => (
                          <th key={d} className={`px-2 py-2 text-center font-semibold ${d === today ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                            {d.slice(0, 3)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_PERIODS.map(pNum => (
                        <tr key={pNum} className="border-b border-gray-100">
                          <td className="px-3 py-1.5 bg-gray-50 border-r border-gray-100 font-semibold text-gray-500 text-center">
                            P{pNum}
                            <span className="block text-gray-300 font-normal text-[9px]">{PERIOD_TIMES[pNum].from}</span>
                          </td>
                          {DAYS.map(day => {
                            const blocked = unavail.some(s => s.day_of_week === day && s.period_number === pNum)
                            const key = `${day}-${pNum}`
                            const toggling = togglingSlot === key
                            return (
                              <td key={day} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                                <button onClick={() => toggleSlot(day, pNum)} disabled={toggling}
                                  className={`w-full rounded py-2 text-center text-xs font-medium border transition-colors ${
                                    blocked ? 'bg-red-100 border-red-300 text-red-600 hover:bg-red-200' : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                                  } ${toggling ? 'opacity-50' : ''}`}>
                                  {toggling ? '...' : blocked ? '✕ Busy' : '✓ Free'}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-teal-600 mt-3 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                    Changes apply the next time timetable is generated.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
