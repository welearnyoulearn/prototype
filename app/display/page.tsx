'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

type DisplayData = {
  school_name: string
  city: string
  attendance: { present: number; total: number; pct: number | null }
  upcoming_exams: Array<{ exam_name: string; exam_date: string; exam_type: string; grade: string; section: string }>
  announcements: Array<{ title: string; content: string; announcement_type: string; priority: string }>
  leaderboard: Array<{ name: string; grade: string; section: string; total_points: number; rank: number }>
  stats: { teacher_count: number; student_count: number; class_count: number }
}

const SLIDE_DURATION = 10000 // 10 seconds per slide
const REFRESH_INTERVAL = 5 * 60 * 1000 // refresh data every 5 minutes

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test', mid_term: 'Mid Term', final_exam: 'Final', practical: 'Practical'
}

function days(dateStr: string) {
  return Math.round((new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
}

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="text-right">
      <div className="text-5xl font-black text-white tabular-nums">
        {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
      </div>
      <div className="text-blue-200 text-lg font-medium mt-1">
        {time.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  )
}

function SlideHeader({ school_name, city, slide, total }: { school_name: string; city: string; slide: number; total: number }) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <div className="text-blue-200 text-sm font-semibold uppercase tracking-widest mb-1">{city}</div>
        <div className="text-white text-2xl font-black">{school_name}</div>
      </div>
      {/* Slide dots */}
      <div className="flex gap-2 items-center">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`rounded-full transition-all duration-500 ${i === slide ? 'w-6 h-2.5 bg-white' : 'w-2.5 h-2.5 bg-blue-400/50'}`} />
        ))}
      </div>
    </div>
  )
}

// ── Slides ────────────────────────────────────────────────────────────────────
function Slide1Welcome({ data, slide, total }: { data: DisplayData; slide: number; total: number }) {
  return (
    <div className="flex flex-col h-full">
      <SlideHeader school_name={data.school_name} city={data.city} slide={slide} total={total} />
      <div className="flex-1 flex items-center justify-between">
        <div>
          <div className="text-blue-200 text-lg uppercase tracking-widest mb-4 font-semibold">Welcome</div>
          <div className="text-white text-7xl font-black leading-tight mb-6">{data.school_name}</div>
          <div className="flex gap-8 mt-8">
            {[
              { label: 'Students', value: data.stats.student_count },
              { label: 'Teachers', value: data.stats.teacher_count },
              { label: 'Classes',  value: data.stats.class_count },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-5xl font-black text-white">{s.value}</div>
                <div className="text-blue-300 text-sm uppercase tracking-wide mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <Clock />
      </div>
    </div>
  )
}

function Slide2Attendance({ data, slide, total }: { data: DisplayData; slide: number; total: number }) {
  const pct = data.attendance.pct
  const color = pct === null ? '#94a3b8' : pct >= 90 ? '#22c55e' : pct >= 75 ? '#f59e0b' : '#ef4444'
  const radius = 120
  const circ   = 2 * Math.PI * radius
  const dash   = pct !== null ? (pct / 100) * circ : 0

  return (
    <div className="flex flex-col h-full">
      <SlideHeader school_name={data.school_name} city={data.city} slide={slide} total={total} />
      <div className="flex-1 flex items-center justify-center gap-20">
        {/* Donut */}
        <div className="relative">
          <svg width="300" height="300" viewBox="0 0 300 300">
            <circle cx="150" cy="150" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="24" />
            <circle cx="150" cy="150" r={radius} fill="none" stroke={color} strokeWidth="24"
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
              transform="rotate(-90 150 150)"
              style={{ transition: 'stroke-dasharray 1s ease' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-6xl font-black text-white">{pct !== null ? `${pct}%` : '—'}</div>
            <div className="text-blue-200 text-sm uppercase tracking-widest mt-1">Today</div>
          </div>
        </div>
        <div>
          <div className="text-blue-200 text-lg uppercase tracking-widest mb-4 font-semibold">Today&apos;s Attendance</div>
          <div className="space-y-4">
            <div>
              <div className="text-white text-5xl font-black">{data.attendance.present}</div>
              <div className="text-blue-300 text-sm mt-1">Students Present</div>
            </div>
            <div className="w-48 h-0.5 bg-blue-400/30" />
            <div>
              <div className="text-blue-200 text-3xl font-bold">{data.attendance.total - data.attendance.present}</div>
              <div className="text-blue-400 text-sm mt-1">Students Absent</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide3Exams({ data, slide, total }: { data: DisplayData; slide: number; total: number }) {
  return (
    <div className="flex flex-col h-full">
      <SlideHeader school_name={data.school_name} city={data.city} slide={slide} total={total} />
      <div className="text-blue-200 text-lg uppercase tracking-widest mb-6 font-semibold">Upcoming Exams · Next 7 Days</div>
      {data.upcoming_exams.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">✓</div>
            <div className="text-white text-2xl font-bold">No exams this week</div>
            <div className="text-blue-300 mt-2">Enjoy the break!</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-4 content-start">
          {data.upcoming_exams.map((e, i) => {
            const d = days(e.exam_date)
            return (
              <div key={i} className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm border border-white/20">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-white text-xl font-bold">{e.exam_name}</div>
                    <div className="text-blue-200 text-sm mt-1">
                      {EXAM_TYPE_LABELS[e.exam_type] || e.exam_type} · Grade {e.grade}-{e.section}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className={`text-2xl font-black ${d === 0 ? 'text-yellow-300' : d <= 2 ? 'text-red-300' : 'text-green-300'}`}>
                      {d === 0 ? 'Today!' : d === 1 ? 'Tomorrow' : `${d}d`}
                    </div>
                    <div className="text-blue-300 text-xs mt-0.5">
                      {new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Slide4Announcements({ data, slide, total }: { data: DisplayData; slide: number; total: number }) {
  const PRIORITY_COLOR: Record<string, string> = {
    urgent: 'bg-red-500/80 text-white',
    high:   'bg-orange-500/80 text-white',
    normal: 'bg-white/20 text-blue-100',
  }
  return (
    <div className="flex flex-col h-full">
      <SlideHeader school_name={data.school_name} city={data.city} slide={slide} total={total} />
      <div className="text-blue-200 text-lg uppercase tracking-widest mb-6 font-semibold">Announcements</div>
      {data.announcements.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-blue-300 text-xl">No active announcements</div>
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-hidden">
          {data.announcements.slice(0, 4).map((a, i) => (
            <div key={i} className="bg-white/10 rounded-2xl p-5 border border-white/20">
              <div className="flex items-start gap-3">
                <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize shrink-0 ${PRIORITY_COLOR[a.priority] || PRIORITY_COLOR.normal}`}>
                  {a.priority}
                </span>
                <div>
                  <div className="text-white text-xl font-bold">{a.title}</div>
                  <div className="text-blue-200 text-sm mt-1 leading-relaxed line-clamp-2">{a.content}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Slide5Leaderboard({ data, slide, total }: { data: DisplayData; slide: number; total: number }) {
  const MEDALS = ['🥇', '🥈', '🥉', '4', '5']
  const BG = ['bg-yellow-400/20 border-yellow-400/40', 'bg-slate-300/20 border-slate-300/40', 'bg-orange-400/20 border-orange-400/40', 'bg-white/10 border-white/20', 'bg-white/10 border-white/20']

  return (
    <div className="flex flex-col h-full">
      <SlideHeader school_name={data.school_name} city={data.city} slide={slide} total={total} />
      <div className="text-blue-200 text-lg uppercase tracking-widest mb-6 font-semibold">Student Leaderboard · Top Performers</div>
      {data.leaderboard.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-blue-300 text-xl">No leaderboard data yet</div>
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          {data.leaderboard.map((s, i) => (
            <div key={i} className={`rounded-2xl p-4 border flex items-center gap-5 ${BG[i] || BG[4]}`}>
              <div className="text-4xl w-12 text-center">{MEDALS[i]}</div>
              <div className="flex-1">
                <div className="text-white text-2xl font-black">{s.name}</div>
                <div className="text-blue-300 text-sm">Grade {s.grade}-{s.section}</div>
              </div>
              <div className="text-right">
                <div className="text-white text-3xl font-black">{s.total_points}</div>
                <div className="text-blue-300 text-xs uppercase tracking-wide">points</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
function KioskDisplay() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [data, setData]     = useState<DisplayData | null>(null)
  const [error, setError]   = useState('')
  const [slide, setSlide]   = useState(0)
  const [progress, setProgress] = useState(0)

  const SLIDES = data ? [
    (s: number, t: number) => <Slide1Welcome data={data} slide={s} total={t} />,
    (s: number, t: number) => <Slide2Attendance data={data} slide={s} total={t} />,
    ...(data.upcoming_exams.length > 0 ? [(s: number, t: number) => <Slide3Exams data={data} slide={s} total={t} />] : []),
    ...(data.announcements.length > 0  ? [(s: number, t: number) => <Slide4Announcements data={data} slide={s} total={t} />] : []),
    ...(data.leaderboard.length > 0    ? [(s: number, t: number) => <Slide5Leaderboard data={data} slide={s} total={t} />] : []),
  ] : []

  const loadData = useCallback(async () => {
    if (!token) return
    try {
      const r = await fetch(`/api/display-data?token=${token}`)
      if (!r.ok) { setError('Invalid display token'); return }
      setData(await r.json())
    } catch { setError('Cannot connect to server') }
  }, [token])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    const t = setInterval(loadData, REFRESH_INTERVAL)
    return () => clearInterval(t)
  }, [loadData])

  // Auto-advance slides
  useEffect(() => {
    if (!data || SLIDES.length === 0) return
    setProgress(0)
    const prog = setInterval(() => setProgress(p => Math.min(p + (100 / (SLIDE_DURATION / 100)), 100)), 100)
    const adv  = setTimeout(() => {
      setSlide(s => (s + 1) % SLIDES.length)
      setProgress(0)
    }, SLIDE_DURATION)
    return () => { clearInterval(prog); clearTimeout(adv) }
  }, [slide, data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!token) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="text-6xl mb-4">📺</div>
        <p className="text-2xl font-bold">TV/Kiosk Mode</p>
        <p className="text-slate-400 mt-2">No token provided. Generate one from School Admin → Announcements.</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="text-6xl mb-4">⚠️</div>
        <p className="text-xl text-red-400">{error}</p>
        <button onClick={loadData} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm">Retry</button>
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="w-16 h-16 border-4 border-blue-300 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p className="text-blue-200">Loading display...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-10 overflow-hidden select-none cursor-none">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-blue-900/50 z-50">
        <div className="h-full bg-white/60 transition-all duration-100" style={{ width: `${progress}%` }} />
      </div>

      {/* Slide content */}
      <div className="h-[calc(100vh-80px)] max-w-6xl mx-auto">
        {SLIDES.length > 0 && SLIDES[slide % SLIDES.length](slide, SLIDES.length)}
      </div>

      {/* WLYL watermark */}
      <div className="fixed bottom-4 right-6 text-blue-400/40 text-xs font-bold tracking-widest uppercase">
        Powered by WLYL
      </div>
    </div>
  )
}

export default function DisplayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-blue-900 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-300 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <KioskDisplay />
    </Suspense>
  )
}
