'use client'

import { useEffect, useState } from 'react'
import NoticeCenter from '@/components/announcements/NoticeCenter'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarCheck2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { StudentProgressTrack, studentReveal } from './StudentExperience'

// 3D sticker icons (Fluent Emoji, MIT-licensed) — see public/student-icons/NOTICE.
type QuestTone = 'gold' | 'sky' | 'violet' | 'mint'

type Student = {
  id: number; name: string; grade: string; section: string; roll_number: string
}
type Props = {
  student: Student; classId: number; schoolId: number; onNavigate?: (key: string) => void
  isNavItemVisible?: (key: string) => boolean
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function StudentDashboard({ student, classId, schoolId, onNavigate, isNavItemVisible }: Props) {
  const [loading,         setLoading]         = useState(true)
  const [engagementScore, setEngagementScore] = useState<number | null>(null)
  const reduceMotion = useReducedMotion()

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

  if (loading) {
    return (
      <div className="space-y-7" role="status" aria-live="polite" aria-busy="true" aria-label="Preparing your student overview">
        <span className="sr-only">Preparing your learning overview…</span>
        <Skeleton className="h-64 rounded-[10px]" />
        <div className="grid gap-px border-y border-border sm:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-none" />)}</div>
        <Skeleton className="h-48" />
      </div>
    )
  }

  return (
    <div className="space-y-9">
      <motion.section initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .42, ease: [0.16, 1, 0.3, 1] }} className="student-momentum" aria-labelledby="student-overview-title">
        <img src="/student-icons/rocket.png" alt="" className="student-momentum-sticker" aria-hidden="true" />
        <div className="grid items-center gap-7 sm:grid-cols-[1fr_170px]">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#f0bc72]">Your school day</p>
          <h1 id="student-overview-title" className="max-w-xl text-4xl font-extrabold leading-[1.04] tracking-[-.03em] text-white sm:text-5xl">{greeting}, {firstName}.</h1>
          <p className="mt-4 text-sm text-white/65">
            Grade {student.grade} · Section {student.section}
            {student.roll_number && <span className="ml-2">· Roll {student.roll_number}</span>}
          </p>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/85">Ready to make today count? Pick a next step below and keep going.</p>
        </div>
        {engagementScore !== null && (
          <button type="button" data-testid="student-dashboard-attendance-tile" onClick={() => onNavigate?.('attendance')} className="rounded-md border border-white/15 bg-white/8 p-4 text-left transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0bc72]">
            <p className="text-3xl font-semibold tracking-tight text-white tabular-nums">{engagementScore}<span className="text-xl">%</span></p>
            <StudentProgressTrack value={engagementScore} />
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-white">
              <img src="/student-icons/calendar.png" alt="" className="h-4 w-4" aria-hidden="true" />
              Attendance
            </p>
            <p className="mt-0.5 text-xs text-white/55">This month · view record</p>
          </button>
        )}
        </div>
      </motion.section>

      {(() => {
        const allQuestActions: { label: string; description: string; sticker: string; tone: QuestTone; key: string }[] = [
          { label: 'Syllabus', description: 'See what you’re learning in each subject.', sticker: '/student-icons/graduation-cap.png', tone: 'sky', key: 'syllabus' },
          { label: 'My marks', description: 'Review your exam results and progress.', sticker: '/student-icons/trophy.png', tone: 'gold', key: 'my-marks' },
          { label: 'Digital library', description: 'Browse resources for your studies.', sticker: '/student-icons/open-book.png', tone: 'violet', key: 'library' },
        ]
        const quickActions = allQuestActions.filter(item => isNavItemVisible?.(item.key) ?? true)
        if (quickActions.length === 0) return null
        return (
          <section aria-labelledby="student-learning-title">
            <div className="mb-3 flex items-end justify-between"><div><p className="student-section-kicker">Choose your next step</p><h2 id="student-learning-title" className="mt-1 text-xl font-extrabold tracking-tight text-[#1a1410]">Keep your momentum</h2></div><CalendarCheck2 size={20} className="text-[#a85f16]" aria-hidden="true" /></div>
            <div className="student-quest-row">
              {quickActions.map((item, index) => (
                <motion.button
                  key={item.key}
                  data-testid={`student-quest-${item.key}`}
                  custom={index}
                  variants={studentReveal}
                  initial={reduceMotion ? false : 'hidden'}
                  animate="visible"
                  onClick={() => onNavigate?.(item.key)}
                  className="student-quest-card"
                  data-tone={item.tone}
                >
                  <img src={item.sticker} alt="" className="student-quest-icon" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="student-quest-label block">{item.label}</span>
                    <span className="student-quest-description block">{item.description}</span>
                  </span>
                  <ArrowRight size={16} className="student-quest-arrow" aria-hidden="true" />
                </motion.button>
              ))}
            </div>
          </section>
        )
      })()}

      {/* ── Notices: unread marks, animated greeting cards, acknowledgement ── */}
      <NoticeCenter schoolId={schoolId} />
    </div>
  )
}
