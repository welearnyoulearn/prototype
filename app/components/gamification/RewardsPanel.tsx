'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion'
import { Flame, Lock, Trophy } from 'lucide-react'
import { burstFrom, celebrate } from './confetti'

type Badge = { type: string; label: string; emoji: string; desc: string; earned: boolean; earned_at: string | null }
type RewardsData = {
  academic_points: number
  streak: { current: number; longest: number; last_activity_date: string | null }
  badges: Badge[]
  my_rank: number | null
}

type Props = { studentId: number; schoolId: number; classId?: number }

function levelFor(points: number) {
  return Math.floor(points / 50) + 1
}

function CountUpNumber({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, v => Math.round(v).toLocaleString('en-IN'))
  const [display, setDisplay] = useState('0')
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1, ease: [0.16, 1, 0.3, 1] })
    const unsub = rounded.on('change', v => setDisplay(v))
    return () => { controls.stop(); unsub() }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <span className={className}>{display}</span>
}

function StreakFlame({ days }: { days: number }) {
  const lit = days > 0
  return (
    <div className="flex flex-col items-center">
      <div className={`flex h-14 w-14 items-center justify-center rounded-lg border ${lit ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
        <Flame className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="mt-1.5 text-xs font-semibold text-gray-700">{days} day{days !== 1 ? 's' : ''}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Streak</p>
    </div>
  )
}

function BadgeChip({ badge, index }: { badge: Badge; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 + index * 0.04, duration: 0.22, ease: 'easeOut' }}
      whileHover={badge.earned ? { y: -2 } : {}}
      className={`relative w-24 flex-shrink-0 rounded-lg border p-3 text-center transition-shadow ${
        badge.earned
          ? 'border-amber-200 bg-white hover:shadow-sm'
          : 'bg-gray-50 border-gray-200'
      }`}
      title={badge.desc}
    >
      <div className={`text-2xl ${badge.earned ? '' : 'grayscale opacity-30'}`}>{badge.emoji}</div>
      <p className={`mt-1 text-xs font-semibold leading-tight ${badge.earned ? 'text-gray-800' : 'text-gray-500'}`}>
        {badge.label}
      </p>
      {!badge.earned && (
        <Lock className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-gray-400" aria-label="Locked" />
      )}
    </motion.div>
  )
}

export default function RewardsPanel({ studentId, schoolId, classId }: Props) {
  const [data, setData] = useState<RewardsData | null>(null)
  const [showUnlock, setShowUnlock] = useState<Badge | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const qs = new URLSearchParams({ school_id: String(schoolId), ...(classId ? { class_id: String(classId) } : {}) })
    fetch(`/api/students/${studentId}/rewards?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: RewardsData | null) => {
        if (!d) return
        setData(d)

        // Detect newly-earned badges since the student's last visit — purely
        // a per-viewer, per-device convenience (localStorage), never a
        // source of truth. A student who last saw 2 earned badges and now
        // has 4 gets a real "you just unlocked something" moment instead of
        // silently updating a shelf they'd have to notice on their own.
        try {
          const key = `wlyl_seen_badges_${studentId}`
          const seen = new Set(JSON.parse(localStorage.getItem(key) || '[]'))
          const earned = d.badges.filter(b => b.earned)
          const freshlyEarned = earned.filter(b => !seen.has(b.type))
          localStorage.setItem(key, JSON.stringify(earned.map(b => b.type)))
          if (freshlyEarned.length > 0 && seen.size > 0) {
            setShowUnlock(freshlyEarned[0])
            celebrate()
          } else if (d.streak.current > 0 && d.streak.current % 7 === 0) {
            burstFrom(panelRef.current)
          }
        } catch { /* localStorage unavailable — skip the celebratory moment, not critical */ }
      })
      .catch(() => {})
  }, [studentId, schoolId, classId])

  if (!data) return null

  const earnedBadges = data.badges.filter(b => b.earned)
  const lockedBadges = data.badges.filter(b => !b.earned).slice(0, 4)
  const level = levelFor(data.academic_points)

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-lg border border-amber-200 bg-amber-50/50"
    >
      {/* Unlock toast */}
      <AnimatePresence>
        {showUnlock && (
          <motion.button
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            onClick={() => setShowUnlock(null)}
            className="absolute left-1/2 top-3 z-10 flex min-h-10 -translate-x-1/2 items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            <span>{showUnlock.emoji}</span> New badge: {showUnlock.label}!
          </motion.button>
        )}
      </AnimatePresence>

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-lg font-semibold text-gray-900">
              Your Progress
            </p>
            {data.my_rank && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-amber-800"><Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Rank #{data.my_rank} in your class</p>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-1 justify-end">
              <CountUpNumber value={data.academic_points} className="text-3xl font-semibold tracking-tight text-amber-700" />
              <span className="text-xs font-semibold text-amber-700">pts</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Level {level}</p>
          </div>
        </div>

        <div className="flex items-center gap-5 mb-4">
          <StreakFlame days={data.streak.current} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-800 leading-relaxed">
              {data.streak.current === 0
                ? 'Take a test today to start a streak.'
                : `Keep going to beat your best of ${data.streak.longest} days.`}
            </p>
          </div>
        </div>

        {(earnedBadges.length > 0 || lockedBadges.length > 0) && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Badges</p>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              {earnedBadges.map((b, i) => <BadgeChip key={b.type} badge={b} index={i} />)}
              {lockedBadges.map((b, i) => <BadgeChip key={b.type} badge={b} index={earnedBadges.length + i} />)}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
