'use client'

import { useEffect, useState } from 'react'
import NoticeCenter from '@/components/announcements/NoticeCenter'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { GOOD_ATTENDANCE_PCT, LOW_ATTENDANCE_PCT, todayIST } from '@/lib/attendanceRules'
import { StudentProgressTrack, studentReveal } from './StudentExperience'
import { Sticker, type StickerName, type Tone } from './stickers'

type Student = {
  id: number; name: string; grade: string; section: string; roll_number: string
}
type Props = {
  student: Student; classId: number; schoolId: number; onNavigate?: (key: string) => void
  isNavItemVisible?: (key: string) => boolean
}

type Quest = { key: string; label: string; description: string; sticker: StickerName; tone: Tone; tilt: number }

const QUESTS: Quest[] = [
  { key: 'syllabus', label: 'Syllabus', description: 'See what you’re learning in each subject.', sticker: 'graduation-cap', tone: 'blue', tilt: -10 },
  { key: 'my-marks', label: 'My marks', description: 'Check your released results.', sticker: 'trophy', tone: 'yellow', tilt: 8 },
  { key: 'library', label: 'Digital library', description: 'Open your textbooks and handbooks.', sticker: 'books', tone: 'violet', tilt: -6 },
  { key: 'class-circle', label: 'Class circle', description: 'Birthdays and wishes in your class.', sticker: 'party-popper', tone: 'pink', tilt: 10 },
  { key: 'calendar', label: 'School calendar', description: 'Exams, events and holidays ahead.', sticker: 'spiral-calendar', tone: 'mint', tilt: -8 },
  { key: 'ai-hub', label: 'AI Hub', description: 'Get a concept explained another way.', sticker: 'robot', tone: 'orange', tilt: 6 },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function attendanceTone(pct: number): Tone {
  if (pct >= GOOD_ATTENDANCE_PCT) return 'mint'
  if (pct >= LOW_ATTENDANCE_PCT) return 'yellow'
  return 'coral'
}

export default function StudentDashboard({ student, classId, schoolId, onNavigate, isNavItemVisible }: Props) {
  const [loading,    setLoading]    = useState(true)
  // undefined = attendance switched off for the school; null = on, but nothing recorded yet this month.
  const [attendance, setAttendance] = useState<number | null | undefined>(undefined)
  const reduceMotion = useReducedMotion()

  const hasAttendance = isNavItemVisible?.('attendance') ?? true

  useEffect(() => {
    if (!hasAttendance) { Promise.resolve().then(() => setLoading(false)); return }
    // The student's OWN attendance, from the same builder the My Attendance tab and the parent app use.
    fetch('/api/student/attendance')
      .then(r => r.json())
      .then(view => {
        const pct = view?.month?.summary?.pct
        setAttendance(typeof pct === 'number' ? pct : null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [student.id, classId, schoolId, hasAttendance])

  const firstName = student.name.split(' ')[0]
  const today = new Date(`${todayIST()}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const quests = QUESTS.filter(q => isNavItemVisible?.(q.key) ?? q.key !== 'ai-hub')

  if (loading) {
    return (
      <div className="space-y-8" role="status" aria-live="polite" aria-busy="true" aria-label="Preparing your student overview">
        <span className="sr-only">Preparing your learning overview…</span>
        <Skeleton className="h-72 rounded-[28px]" />
        <div className="grid gap-5 sm:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-[22px]" />)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-12 pt-2">
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, ease: [0.16, 1, 0.3, 1] }}
        className="sb-hero" aria-labelledby="student-overview-title" data-testid="student-dashboard-hero"
      >
        <Sticker name="rocket" size="hero" tilt={14} className="sb-peek -top-6 right-4 sm:right-10" />
        <div className="grid items-center gap-8 md:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="sb-kicker" data-tone="yellow">Your school day</span>
              <span className="sb-hand">{today}</span>
            </div>
            <h1 id="student-overview-title" className="mt-5 max-w-2xl">
              {getGreeting()}, {firstName}
              <Sticker name="waving-hand" className="sb-sticker-inline" tilt={-10} />
            </h1>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="sb-hero-chip">Grade {student.grade}</span>
              <span className="sb-hero-chip">Section {student.section}</span>
              {student.roll_number && <span className="sb-hero-chip max-w-full truncate">Roll {student.roll_number}</span>}
            </div>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/85">Ready to make today count? Pick a quest below and keep your learning moving.</p>
          </div>

          {hasAttendance && attendance !== undefined && (
            <button type="button" data-testid="student-dashboard-attendance-tile" onClick={() => onNavigate?.('attendance')} className="sb-stamp-note relative"
              aria-label={attendance === null ? 'Attendance this month: nothing recorded yet. Open my attendance.' : `Attendance this month: ${attendance}%. Open my attendance.`}>
              <Sticker name="calendar" size="lg" tilt={-12} className="sb-peek -top-7 -right-4" />
              <span className="block text-xs font-extrabold uppercase tracking-[.1em]">Attendance</span>
              <span className="sb-display mt-1 block text-5xl tabular-nums">{attendance === null ? '—' : <>{attendance}<span className="text-2xl">%</span></>}</span>
              <span className="mt-3 block"><StudentProgressTrack value={attendance ?? 0} tone={attendance === null ? 'paper' : attendanceTone(attendance)} size="sm" /></span>
              <span className="mt-2 flex items-center justify-between text-xs font-bold">
                <span>{attendance === null ? 'Nothing recorded yet' : 'This month'}</span>
                <span className="inline-flex items-center gap-0.5">View <ArrowUpRight size={13} aria-hidden="true" /></span>
              </span>
            </button>
          )}
        </div>
      </motion.section>

      {quests.length > 0 && (
        <section aria-labelledby="student-learning-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <span className="sb-kicker" data-tone="pink">Choose your next quest</span>
              <h2 id="student-learning-title" className="sb-display mt-3 text-3xl">Where to next?</h2>
            </div>
            <p className="sb-hand">tap a card to jump in ↓</p>
          </div>
          <div className="sb-quests">
            {quests.map((q, index) => (
              <motion.button
                key={q.key}
                data-testid={`student-quest-${q.key}`}
                custom={index}
                variants={studentReveal}
                initial={reduceMotion ? false : 'hidden'}
                animate="visible"
                onClick={() => onNavigate?.(q.key)}
                className="sb-quest sb-press"
                data-tone={q.tone}
              >
                <Sticker name={q.sticker} size="xl" tilt={q.tilt} />
                <span className="sb-quest-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span>
                <span className="sb-quest-label">{q.label}</span>
                <span className="sb-quest-desc">{q.description}</span>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      <NoticeCenter schoolId={schoolId} experience="student" />
    </div>
  )
}
