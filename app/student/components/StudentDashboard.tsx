'use client'

import { useEffect, useState } from 'react'
import NoticeCenter from '@/components/announcements/NoticeCenter'

type Student = {
  id: number; name: string; grade: string; section: string; roll_number: string
}
type Props = {
  student: Student; classId: number; schoolId: number; onNavigate?: (key: string) => void
  isNavItemVisible?: (key: string) => boolean
}

/* ── Helpers ────────────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good Morning', emoji: '☀️' }
  if (h < 17) return { text: 'Good Afternoon', emoji: '👋' }
  return { text: 'Good Evening', emoji: '🌙' }
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

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function StudentDashboard({ student, classId, schoolId, onNavigate, isNavItemVisible }: Props) {
  const [loading,         setLoading]         = useState(true)
  const [engagementScore, setEngagementScore] = useState<number | null>(null)

  const hasAttendance = isNavItemVisible?.('attendance') ?? true

  useEffect(() => {
    Promise.resolve()
      .then(() => {

      // Engagement ring is based on attendance %, so it must never use a
      // signal the school hasn't enabled — with Attendance off there's
      // nothing meaningful to show at all.
      if (!hasAttendance) return

      // The student's OWN attendance, from the same builder the My Attendance tab and the parent app
      // use. (This used to download the whole class's month, every classmate's records included.)
      fetch('/api/student/attendance')
        .then(r => r.json())
        .then(view => {
          const pct = view?.month?.summary?.pct
          setEngagementScore(typeof pct === 'number' ? pct : 0)
        }).catch(() => {})
    }).finally(() => setLoading(false))
  }, [student.id, classId, schoolId, hasAttendance])

  const firstName = student.name.split(' ')[0]
  const greeting  = getGreeting()

  const motiveLine = 'Nothing pending right now. You\'re a legend! ✨'

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

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      {(() => {
        const quickActions = [
          { label: 'My Marks',   emoji: '📊', key: 'my-marks' },
        ].filter(item => isNavItemVisible?.(item.key) ?? true)
        if (quickActions.length === 0) return null
        return (
          <div className={`grid gap-3 ${quickActions.length === 1 ? 'grid-cols-1' : quickActions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {quickActions.map((item, i) => (
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
        )
      })()}

      {/* ── Notices: unread marks, animated greeting cards, acknowledgement ── */}
      <NoticeCenter schoolId={schoolId} />
    </div>
  )
}
