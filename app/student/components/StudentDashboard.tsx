'use client'

import { useEffect, useRef, useState } from 'react'

type Student = {
  id: number; name: string; grade: string; section: string; roll_number: string
}
type Task = {
  id: number; title: string; subject: string; task_type: string
  max_marks: number; due_date: string | null; status: string
}
type Submission = {
  submission_id: number; task_id: number; submitted_at: string | null
  score: number | null; submission_status: string | null; feedback: string | null
}
type Doubt = {
  id: number; subject: string; question: string; status: string
  teacher_answer: string | null; created_at: string
}
type AnnouncementItem = {
  id: number; title: string; content: string; announcement_type: string
  target_audience: string; priority: string; created_by_name: string
  expires_at: string | null; created_at: string
}
type Props = {
  student: Student; classId: number; schoolId: number; onNavigate?: (key: string) => void
}
type WeeklyTestStatus = {
  status: 'not_generated' | 'available' | 'submitted'
  week_start: string; score?: number | null; max_score?: number | null
}

/* ── Helpers ────────────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good Morning', emoji: '☀️' }
  if (h < 17) return { text: 'Good Afternoon', emoji: '👋' }
  return { text: 'Good Evening', emoji: '🌙' }
}

function subjectEmoji(subject: string): string {
  const s = (subject || '').toLowerCase()
  if (s.includes('math'))                              return '🔢'
  if (s.includes('physics'))                           return '⚡'
  if (s.includes('chem'))                              return '⚗️'
  if (s.includes('bio'))                               return '🌱'
  if (s.includes('science'))                           return '🔬'
  if (s.includes('english'))                           return '📖'
  if (s.includes('history') || s.includes('social'))   return '🌍'
  if (s.includes('geo'))                               return '🗺️'
  if (s.includes('computer') || s.includes('cs'))      return '💻'
  if (s.includes('telugu'))                            return '🌺'
  if (s.includes('hindi'))                             return '🪷'
  if (s.includes('sanskrit'))                          return '📜'
  if (s.includes('eco'))                               return '💰'
  if (s.includes('art'))                               return '🎨'
  if (s.includes('music'))                             return '🎵'
  return '📌'
}

/* ── Count-up hook ──────────────────────────────────────────── */
function useCountUp(target: number, duration = 700) {
  const [val, setVal] = useState(0)
  const raf = useRef<number>(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t    = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setVal(Math.round(ease * target))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return val
}

/* ── Engagement Ring (SVG + float) ─────────────────────────── */
function EngagementRing({ score }: { score: number }) {
  const r    = 26
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0 anim-float">
      <div className="relative w-[68px] h-[68px] flex items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" width="68" height="68" viewBox="0 0 68 68">
          <circle cx="34" cy="34" r={r} strokeWidth="5" fill="none" stroke="rgba(255,255,255,0.2)" />
          <circle cx="34" cy="34" r={r} strokeWidth="5" fill="none" stroke="white"
            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)' }}
          />
        </svg>
        <div className="text-center">
          <p className="text-lg font-black text-white leading-none">{score}</p>
          <p className="text-[8px] text-white/50 font-semibold">/100</p>
        </div>
      </div>
      <p className="text-[9px] text-white/50 font-bold uppercase tracking-wider">Score</p>
    </div>
  )
}

/* ── Stat Card with count-up ────────────────────────────────── */
function StatCard({
  emoji, val, label, color, delay, onClick,
}: {
  emoji: string; val: number; label: string; color: string; delay: number; onClick?: () => void
}) {
  const animated = useCountUp(val)
  return (
    <button
      onClick={onClick}
      className="anim-scale-in bg-white rounded-2xl p-3 text-center border border-gray-100 shadow-sm card-lift"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-xl leading-none emoji-wobble">{emoji}</p>
      <p className={`text-2xl font-black mt-1.5 leading-none ${color} anim-num-pop`}
        style={{ animationDelay: `${delay + 100}ms` }}>
        {animated}
      </p>
      <p className="text-[9px] font-semibold text-gray-400 mt-1 uppercase tracking-wide">{label}</p>
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function StudentDashboard({ student, classId, schoolId, onNavigate }: Props) {
  const [tasks,           setTasks]           = useState<Task[]>([])
  const [submissions,     setSubmissions]     = useState<Submission[]>([])
  const [doubts,          setDoubts]          = useState<Doubt[]>([])
  const [loading,         setLoading]         = useState(true)
  const [engagementScore, setEngagementScore] = useState<number | null>(null)
  const [announcements,   setAnnouncements]   = useState<AnnouncementItem[]>([])
  const [annExpanded,     setAnnExpanded]     = useState<number | null>(null)
  const [weeklyTest,      setWeeklyTest]      = useState<WeeklyTestStatus | null>(null)

  useEffect(() => {
    fetch(`/api/weekly-test?student_id=${student.id}&school_id=${schoolId}&class_id=${classId}&check_only=true`)
      .then(r => r.json()).then(d => setWeeklyTest(d)).catch(() => {})
  }, [student.id, schoolId, classId])

  useEffect(() => {
    Promise.all([
      fetch(`/api/tasks?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/doubts?school_id=${schoolId}&student_id=${student.id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/students/${student.id}/submissions?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/announcements?school_id=${schoolId}&audience=students`).then(r => r.json()).catch(() => []),
    ]).then(([taskData, doubtData, subData, annData]) => {
      const published = Array.isArray(taskData) ? taskData.filter((t: Task) => t.status === 'published') : []
      setTasks(published)
      setDoubts(Array.isArray(doubtData) ? doubtData.slice(0, 5) : [])
      const subs: Submission[] = Array.isArray(subData) ? subData : []
      setSubmissions(subs)
      setAnnouncements(Array.isArray(annData) ? annData : [])

      const now   = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      fetch(`/api/attendance?school_id=${schoolId}&class_id=${classId}&month=${month}`)
        .then(r => r.json())
        .then(attData => {
          const myAtt = Array.isArray(attData)
            ? attData.filter((a: { student_id: number }) => a.student_id === student.id) : []
          const byDate = new Map<string, boolean>()
          myAtt.forEach((a: { date: string; status: string }) => {
            if (a.status === 'present') byDate.set(a.date, true)
            else if (!byDate.has(a.date)) byDate.set(a.date, false)
          })
          const totalAtt    = byDate.size
          const presentDays = Array.from(byDate.values()).filter(Boolean).length
          const attPct  = totalAtt > 0 ? (presentDays / totalAtt) * 100 : 0
          const taskPct = published.length > 0
            ? (subs.filter(s => s.submitted_at).length / published.length) * 100 : 0
          const now2 = new Date()
          const monthStart = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-01`
          fetch(`/api/weekly-test/history?student_id=${student.id}&school_id=${schoolId}&limit=5`)
            .then(r => r.json())
            .then(d => {
              const recent = (d.tests || []).filter(
                (t: { week_start: string; status: string; score: number | null; max_score: number | null }) =>
                  t.week_start >= monthStart && t.status === 'submitted' && t.score !== null && t.max_score
              )
              const testPct = recent.length > 0
                ? recent.reduce((a: number, t: { score: number; max_score: number }) =>
                    a + (t.score / t.max_score * 100), 0) / recent.length : 0
              setEngagementScore(Math.round(
                recent.length > 0
                  ? attPct * 0.4 + taskPct * 0.4 + testPct * 0.2
                  : attPct * 0.5 + taskPct * 0.5
              ))
            })
            .catch(() => setEngagementScore(Math.round(attPct * 0.5 + taskPct * 0.5)))
        }).catch(() => {})
    }).finally(() => setLoading(false))
  }, [student.id, classId, schoolId])

  const now       = new Date()
  const submitted = submissions.filter(s => s.submitted_at).length
  const reviewed  = submissions.filter(s => s.submission_status === 'reviewed').length
  const pending   = tasks.length - submitted

  const overdue = tasks.filter(t => {
    const sub = submissions.find(s => s.task_id === t.id)
    return !sub?.submitted_at && !!t.due_date && new Date(t.due_date) < now
  })

  const nextDue = tasks
    .filter(t => !submissions.find(s => s.task_id === t.id)?.submitted_at && t.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0]

  const firstName = student.name.split(' ')[0]
  const greeting  = getGreeting()

  const motiveLine = pending > 0
    ? `${pending} homework${pending !== 1 ? 's' : ''} waiting — you got this! 💪`
    : reviewed > 0 ? `All caught up! ${reviewed} graded. Keep it up! 🌟`
    : 'Nothing pending right now. You\'re a legend! ✨'

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-36 rounded-3xl bg-orange-100 animate-pulse" />
        <div className="grid grid-cols-4 gap-2">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-20 rounded-2xl animate-pulse"
              style={{ background: `hsl(${220 + i * 20}, 60%, 92%)` }} />
          ))}
        </div>
        {[0,1,2].map(i => (
          <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse"
            style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
        <div className="h-48 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Hero Card ────────────────────────────────────────────── */}
      <div
        className="relative rounded-3xl p-5 overflow-hidden shadow-lg shadow-orange-200 hero-animated-bg anim-slide-up"
        style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #f59e0b 100%)' }}
      >
        {/* Decorative breathing circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 anim-breathe pointer-events-none" />
        <div className="absolute -bottom-8 -left-4  w-28 h-28 rounded-full bg-white/8  anim-breathe-slow pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 anim-fade-in" style={{ animationDelay: '0.15s' }}>
            <p className="text-orange-100 text-xs font-semibold">
              {greeting.emoji} {greeting.text}
            </p>
            <h2 className="text-3xl font-black text-white mt-0.5 leading-tight">{firstName}!</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs font-bold text-white/80 bg-white/15 px-2.5 py-1 rounded-full backdrop-blur-sm">
                Grade {student.grade}-{student.section}
              </span>
              {student.roll_number && (
                <span className="text-xs text-white/40">Roll #{student.roll_number}</span>
              )}
            </div>
            <p className="text-orange-100 text-xs mt-3 leading-relaxed">{motiveLine}</p>
          </div>
          {engagementScore !== null && <EngagementRing score={engagementScore} />}
        </div>
      </div>

      {/* ── Stats HUD (count-up + scale-in stagger) ──────────────── */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard emoji="📚" val={tasks.length} label="Total"   color="text-blue-500"   delay={0}   onClick={() => onNavigate?.('tasks')} />
        <StatCard emoji="✅" val={submitted}     label="Done"    color="text-green-500"  delay={60}  onClick={() => onNavigate?.('tasks')} />
        <StatCard emoji="⏳" val={pending}       label="Pending" color="text-orange-500" delay={120} onClick={() => onNavigate?.('tasks')} />
        <StatCard emoji="⭐" val={reviewed}      label="Graded"  color="text-purple-500" delay={180} onClick={() => onNavigate?.('tasks')} />
      </div>

      {/* ── Weekly Test Banner (shimmer when available) ───────────── */}
      {weeklyTest && weeklyTest.status !== 'not_generated' && (
        weeklyTest.status === 'available' ? (
          <button
            onClick={() => onNavigate?.('weekly-test')}
            className="w-full text-left bg-white border-2 border-violet-200 rounded-2xl p-4 flex items-center justify-between gap-3
                       card-lift shimmer anim-slide-up anim-glow-orange"
            style={{ animationDelay: '0.25s', '--tw-shadow-color': 'rgba(139,92,246,0.15)' } as React.CSSProperties}
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center text-2xl flex-shrink-0 emoji-wobble">
                ⚡
              </div>
              <div>
                <p className="text-xs font-black text-violet-500 uppercase tracking-wide">This Week</p>
                <p className="text-sm font-black text-gray-900 mt-0.5">AI Weekly Test is ready!</p>
                <p className="text-xs text-gray-400">Based on your recent class topics</p>
              </div>
            </div>
            <span className="text-sm font-black text-violet-500 flex-shrink-0 group-hover:translate-x-1 transition-transform">
              Start →
            </span>
          </button>
        ) : weeklyTest.status === 'submitted' && weeklyTest.score != null && weeklyTest.max_score ? (
          (() => {
            const pct   = Math.round((weeklyTest.score as number) / (weeklyTest.max_score as number) * 100)
            const color = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'
            return (
              <button
                onClick={() => onNavigate?.('weekly-test')}
                className="w-full text-left bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-3 card-lift anim-slide-up"
                style={{ animationDelay: '0.25s' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">⚡</div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">This Week&apos;s Test</p>
                    <p className="text-sm font-bold text-gray-700 mt-0.5">Tap to review your answers</p>
                  </div>
                </div>
                <p className={`text-3xl font-black ${color} flex-shrink-0 anim-num-pop`}>{pct}%</p>
              </button>
            )
          })()
        ) : null
      )}

      {/* ── Overdue Alert (pulse glow) ────────────────────────────── */}
      {overdue.length > 0 && (
        <button
          onClick={() => onNavigate?.('tasks')}
          className="w-full text-left bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3
                     card-lift anim-pulse-red anim-slide-up"
          style={{ animationDelay: '0.3s' }}
        >
          <span className="text-2xl flex-shrink-0">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-red-700">
              {overdue.length} overdue task{overdue.length !== 1 ? 's' : ''}!
            </p>
            <p className="text-xs text-red-400 truncate mt-0.5">{overdue.map(t => t.title).join(', ')}</p>
          </div>
          <svg className="w-4 h-4 text-red-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── Next Due ──────────────────────────────────────────────── */}
      {nextDue && !overdue.find(t => t.id === nextDue.id) && (
        <button
          onClick={() => onNavigate?.('tasks')}
          className="w-full text-left bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 card-lift anim-slide-up"
          style={{ animationDelay: '0.35s' }}
        >
          <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0 emoji-wobble">
            {subjectEmoji(nextDue.subject)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-wide">Next Due</p>
            <p className="text-sm font-bold text-gray-800 truncate mt-0.5">{nextDue.title}</p>
            <p className="text-xs text-gray-400">{nextDue.subject} · {nextDue.due_date}</p>
          </div>
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── Today's Tasks (staggered rows) ───────────────────────── */}
      <div
        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden anim-slide-up"
        style={{ animationDelay: '0.4s' }}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-base emoji-wobble">📝</span>
            <h3 className="text-sm font-black text-gray-900">Today&apos;s Tasks</h3>
            {pending > 0 && (
              <span className="text-[10px] font-black bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                {pending} left
              </span>
            )}
          </div>
          <button
            onClick={() => onNavigate?.('tasks')}
            className="text-xs font-black text-orange-500 hover:text-orange-600 transition-colors"
          >
            See all →
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="py-12 text-center anim-fade-in">
            <p className="text-4xl mb-2 anim-float inline-block">🎉</p>
            <p className="text-sm font-bold text-gray-500">No tasks assigned yet!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {tasks.slice(0, 5).map((t, i) => {
              const sub       = submissions.find(s => s.task_id === t.id)
              const isOverdue = !sub?.submitted_at && t.due_date && new Date(t.due_date) < now
              const isDone    = !!sub?.submitted_at
              const isGraded  = sub?.submission_status === 'reviewed'
              return (
                <button
                  key={t.id}
                  onClick={() => onNavigate?.('tasks')}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left group
                             transition-colors duration-150 hover:bg-orange-50/50 active:bg-gray-100"
                  style={{
                    animation: 'slideInLeft 0.35s cubic-bezier(0.16,1,0.3,1) both',
                    animationDelay: `${0.45 + i * 0.07}s`,
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl flex-shrink-0 emoji-wobble
                                  group-hover:bg-orange-100 transition-colors duration-200">
                    {subjectEmoji(t.subject)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate transition-colors duration-150
                      ${isDone ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-800 group-hover:text-orange-700'}`}>
                      {t.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.subject} · {t.max_marks} marks
                      {t.due_date ? ` · ${t.due_date}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full flex-shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                    isGraded && sub.score !== null ? 'bg-green-100 text-green-700' :
                    isDone   ? 'bg-blue-100 text-blue-700' :
                    isOverdue ? 'bg-red-100 text-red-600' :
                    'bg-orange-100 text-orange-600'
                  }`}>
                    {isGraded && sub.score !== null ? `${sub.score}/${t.max_marks}` :
                     isDone ? 'Submitted' : isOverdue ? 'Overdue' : 'Pending'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ask a Doubt', emoji: '💬', key: 'doubts'   },
          { label: 'My Marks',   emoji: '📊', key: 'my-marks' },
          { label: 'Daily Hub',  emoji: '🎯', key: 'hub'      },
        ].map((item, i) => (
          <button
            key={item.key}
            onClick={() => onNavigate?.(item.key)}
            className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm card-lift anim-scale-in"
            style={{ animationDelay: `${0.5 + i * 0.07}s` }}
          >
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-2xl emoji-wobble
                            group-hover:bg-orange-100 transition-colors duration-200">
              {item.emoji}
            </div>
            <p className="text-xs font-bold text-gray-700 text-center leading-tight">{item.label}</p>
          </button>
        ))}
      </div>

      {/* ── My Doubts ─────────────────────────────────────────────── */}
      {doubts.length > 0 && (
        <div
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden anim-slide-up"
          style={{ animationDelay: '0.6s' }}
        >
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-base emoji-wobble">💬</span>
              <h3 className="text-sm font-black text-gray-900">My Doubts</h3>
              {doubts.filter(d => d.status === 'in_progress').length > 0 && (
                <span className="relative inline-flex">
                  <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                    {doubts.filter(d => d.status === 'in_progress').length} replied!
                  </span>
                  {/* ping ring */}
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-400 anim-ping" />
                </span>
              )}
            </div>
            <button onClick={() => onNavigate?.('doubts')} className="text-xs font-black text-orange-500 hover:text-orange-600">
              Ask new →
            </button>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-3 border-b border-gray-50">
            {[
              { label: 'Waiting',  count: doubts.filter(d => d.status === 'open').length,        color: 'text-amber-500'  },
              { label: 'Replied',  count: doubts.filter(d => d.status === 'in_progress').length, color: 'text-blue-500'   },
              { label: 'Resolved', count: doubts.filter(d => d.status === 'resolved').length,    color: 'text-green-500'  },
            ].map((s, i) => (
              <div key={s.label} className={`py-3 text-center ${i < 2 ? 'border-r border-gray-50' : ''}`}>
                <p className={`text-xl font-black ${s.color}`}>{s.count}</p>
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="divide-y divide-gray-50">
            {doubts.slice(0, 3).map((d, i) => (
              <button
                key={d.id}
                onClick={() => onNavigate?.('doubts')}
                className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                style={{
                  animation: 'slideInLeft 0.35s cubic-bezier(0.16,1,0.3,1) both',
                  animationDelay: `${0.65 + i * 0.07}s`,
                }}
              >
                <span className={`text-lg flex-shrink-0 mt-0.5 ${d.status === 'in_progress' ? 'animate-bounce' : ''}`}>
                  {d.status === 'resolved' ? '✅' : d.status === 'in_progress' ? '💬' : '⏳'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-700 truncate">{d.question}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{subjectEmoji(d.subject)} {d.subject}</p>
                </div>
                {d.status === 'in_progress' && (
                  <span className="text-[9px] bg-blue-100 text-blue-600 font-black px-2 py-0.5 rounded-full flex-shrink-0">
                    New!
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Announcements ─────────────────────────────────────────── */}
      {announcements.length > 0 && (
        <div
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden anim-slide-up"
          style={{ animationDelay: '0.7s' }}
        >
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-base emoji-wobble">📢</span>
              <h3 className="text-sm font-black text-gray-900">School News</h3>
              {announcements.filter(a => a.priority === 'urgent').length > 0 && (
                <span className="text-[10px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                  🚨 {announcements.filter(a => a.priority === 'urgent').length} urgent
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400 font-semibold">{announcements.length}</span>
          </div>

          <div className="divide-y divide-gray-50">
            {announcements.slice(0, 4).map((a, i) => {
              const isUrgent = a.priority === 'urgent'
              const isOpen   = annExpanded === a.id
              return (
                <div key={a.id} className={isUrgent ? 'bg-red-50/40' : ''}>
                  <button
                    onClick={() => setAnnExpanded(isOpen ? null : a.id)}
                    className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                    style={{
                      animation: 'slideInLeft 0.35s cubic-bezier(0.16,1,0.3,1) both',
                      animationDelay: `${0.72 + i * 0.06}s`,
                    }}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">
                      {isUrgent ? '🚨' : a.priority === 'high' ? '⚠️' : '📌'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {isUrgent && (
                          <span className="text-[9px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase">Urgent</span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-800 truncate">{a.title}</p>
                      {!isOpen && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{a.content}</p>}
                    </div>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-1 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 pl-14 anim-fade-in">
                      <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                      {a.expires_at && (
                        <p className="text-[10px] text-amber-500 font-semibold mt-2">
                          Expires: {new Date(a.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {announcements.length > 4 && (
            <div className="px-5 py-3 border-t border-gray-50 text-center">
              <p className="text-xs text-gray-400">+{announcements.length - 4} more</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
