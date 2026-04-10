'use client'

import { useEffect, useState } from 'react'

type CalendarEvent = {
  id: number
  title: string
  event_date: string
  end_date: string | null
  event_type: string
  color: string
  description: string | null
  all_day: boolean
}

const EVENT_TYPES = [
  { value: 'holiday', label: 'Holiday',  color: 'red' },
  { value: 'exam',    label: 'Exam',     color: 'orange' },
  { value: 'event',   label: 'Event',    color: 'blue' },
  { value: 'meeting', label: 'Meeting',  color: 'purple' },
  { value: 'other',   label: 'Other',    color: 'gray' },
]

const COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  gray:   { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400' },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function AcademicCalendar({ schoolId }: { schoolId: number }) {
  const today = new Date()
  const [year, setYear]         = useState(today.getFullYear())
  const [month, setMonth]       = useState(today.getMonth())
  const [events, setEvents]     = useState<CalendarEvent[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [filterType, setFilterType] = useState('all')

  const [form, setForm] = useState({
    title: '', event_date: '', end_date: '',
    event_type: 'event', color: 'blue', description: '',
  })

  useEffect(() => { loadEvents() }, [schoolId, year])

  async function loadEvents() {
    setLoading(true)
    try {
      const r = await fetch(`/api/school-calendar?school_id=${schoolId}&year=${year}`)
      if (r.ok) setEvents(await r.json())
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/school-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, school_id: schoolId }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error) }
      setShowForm(false)
      setForm({ title: '', event_date: '', end_date: '', event_type: 'event', color: 'blue', description: '' })
      await loadEvents()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id)
    await fetch(`/api/school-calendar/${id}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(ev => ev.id !== id))
    setDeleting(null)
  }

  // Auto-set color when event_type changes
  function handleTypeChange(type: string) {
    const t = EVENT_TYPES.find(et => et.value === type)
    setForm(f => ({ ...f, event_type: type, color: t?.color ?? 'blue' }))
  }

  // Build calendar grid for current month
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function eventsOnDay(day: number): CalendarEvent[] {
    const ds = dateStr(day)
    return events.filter(ev => {
      if (filterType !== 'all' && ev.event_type !== filterType) return false
      // Show if event_date <= ds <= end_date (or no end_date)
      if (ev.event_date > ds) return false
      if (ev.end_date && ev.end_date < ds) return false
      if (!ev.end_date && ev.event_date !== ds) return false
      return true
    })
  }

  const todayStr = today.toISOString().slice(0, 10)

  // Upcoming events list (next 60 days)
  const upcomingCutoff = new Date(today)
  upcomingCutoff.setDate(upcomingCutoff.getDate() + 60)
  const upcoming = events
    .filter(ev => {
      if (filterType !== 'all' && ev.event_type !== filterType) return false
      return ev.event_date >= todayStr && ev.event_date <= upcomingCutoff.toISOString().slice(0, 10)
    })
    .slice(0, 15)

  function fmtDate(s: string) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Academic Calendar</h2>
          <p className="text-sm text-gray-400 mt-0.5">Holidays, exams, events and school meetings</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add Event
        </button>
      </div>

      {/* Add Event Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Add Calendar Event</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-2 rounded-lg">{error}</div>}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Event Title *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Diwali Holiday"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Start Date *</label>
                  <input type="date" required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={form.event_date}
                    onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">End Date</label>
                  <input type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    min={form.event_date}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Event Type</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.event_type}
                  onChange={e => handleTypeChange(e.target.value)}
                >
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Description</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2} placeholder="Optional details…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                  {saving ? 'Saving…' : 'Add Event'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Calendar Grid — spans 2 cols */}
        <div className="col-span-2 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <button onClick={() => setYear(y => y - 1)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors text-xs font-bold">‹‹</button>
              <button onClick={() => { setMonth(m => { if (m === 0) { setYear(y => y - 1); return 11 } return m - 1 }) }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">‹</button>
              <span className="text-sm font-bold text-gray-800 w-36 text-center">{MONTHS[month]} {year}</span>
              <button onClick={() => { setMonth(m => { if (m === 11) { setYear(y => y + 1); return 0 } return m + 1 }) }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">›</button>
              <button onClick={() => setYear(y => y + 1)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors text-xs font-bold">››</button>
            </div>

            {/* Type filter pills */}
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                All
              </button>
              {EVENT_TYPES.map(t => {
                const c = COLOR_MAP[t.color] ?? COLOR_MAP.gray
                return (
                  <button key={t.value}
                    onClick={() => setFilterType(filterType === t.value ? 'all' : t.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterType === t.value ? `${c.bg} ${c.text}` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-50">
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400">{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="grid grid-cols-7 divide-x divide-y divide-gray-50">
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} className="h-20 bg-gray-50/30" />
                const ds = dateStr(day)
                const dayEvents = eventsOnDay(day)
                const isToday = ds === todayStr
                return (
                  <div key={day} className={`h-20 p-1.5 flex flex-col gap-0.5 overflow-hidden ${isToday ? 'bg-indigo-50/60' : 'hover:bg-gray-50/50'} transition-colors`}>
                    <span className={`text-xs font-semibold leading-none mb-0.5 ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                      {day}
                    </span>
                    {dayEvents.slice(0, 3).map(ev => {
                      const c = COLOR_MAP[ev.color] ?? COLOR_MAP.blue
                      return (
                        <div key={ev.id} className={`truncate text-[10px] font-medium px-1 py-0.5 rounded ${c.bg} ${c.text}`}>
                          {ev.title}
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Upcoming events panel */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Upcoming (60 days)</h3>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {upcoming.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm px-4">No upcoming events</div>
            ) : (
              upcoming.map(ev => {
                const c = COLOR_MAP[ev.color] ?? COLOR_MAP.blue
                const isToday = ev.event_date === todayStr
                return (
                  <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 group transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${c.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{ev.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {isToday ? <span className="text-indigo-600 font-bold">TODAY</span> : fmtDate(ev.event_date)}
                        {ev.end_date && ev.end_date !== ev.event_date ? ` – ${fmtDate(ev.end_date)}` : ''}
                      </p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c.bg} ${c.text} capitalize`}>
                        {ev.event_type}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(ev.id)}
                      disabled={deleting === ev.id}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity disabled:opacity-50 flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Full event list (all events this year) */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">All Events — {year}</h3>
          <span className="text-xs text-gray-400">{events.length} total</span>
        </div>
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No events for {year}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {events.map(ev => {
              const c = COLOR_MAP[ev.color] ?? COLOR_MAP.blue
              return (
                <div key={ev.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 group transition-colors">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                  <div className="w-28 text-xs text-gray-500 flex-shrink-0">
                    {fmtDate(ev.event_date)}{ev.end_date && ev.end_date !== ev.event_date ? ` – ${fmtDate(ev.end_date)}` : ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-700 font-medium">{ev.title}</span>
                    {ev.description && <span className="text-xs text-gray-400 ml-2 hidden sm:inline">{ev.description}</span>}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${c.bg} ${c.text}`}>{ev.event_type}</span>
                  <button
                    onClick={() => handleDelete(ev.id)}
                    disabled={deleting === ev.id}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
