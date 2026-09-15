'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion'
import { fraunces } from './fonts'
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

// A hand-drawn-feeling flame that visibly grows and warms up with a longer
// streak, rather than a static emoji — 0 days reads as unlit/grey.
function StreakFlame({ days }: { days: number }) {
  const lit = days > 0
  const intensity = Math.min(days / 14, 1) // maxes out visual intensity at 2 weeks
  return (
    <motion.div
      className="relative flex flex-col items-center"
      animate={lit ? { scale: [1, 1.06, 1] } : {}}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
        style={{
          background: lit
            ? `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5), transparent 60%), linear-gradient(160deg, hsl(${38 - intensity * 15}, 95%, ${62 - intensity * 8}%), hsl(${18 - intensity * 8}, 90%, 50%))`
            : '#e5e7eb',
          boxShadow: lit ? `0 0 ${14 + intensity * 18}px hsla(30, 95%, 55%, ${0.35 + intensity * 0.3})` : 'none',
        }}
      >
        <span style={{ filter: lit ? 'none' : 'grayscale(1) opacity(0.5)' }}>🔥</span>
      </div>
      <p className="text-xs font-bold text-gray-700 mt-1.5">{days} day{days !== 1 ? 's' : ''}</p>
      <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">Streak</p>
    </motion.div>
  )
}

// Deterministic per-index tilt so the badge shelf reads like stickers
// someone actually placed, not a perfectly aligned grid.
const TILTS = [-3, 2, -2, 3, -1.5, 2.5, -2.5, 1.5]

function BadgeChip({ badge, index }: { badge: Badge; index: number }) {
  const tilt = TILTS[index % TILTS.length]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, rotate: badge.earned ? tilt : 0 }}
      transition={{ delay: 0.15 + index * 0.05, type: 'spring', stiffness: 260, damping: 18 }}
      whileHover={badge.earned ? { scale: 1.08, rotate: 0 } : {}}
      className={`relative flex-shrink-0 w-24 rounded-2xl border-2 p-3 text-center ${
        badge.earned
          ? 'bg-white border-amber-200 shadow-[3px_4px_0_0_rgba(217,119,6,0.15)]'
          : 'bg-gray-50 border-gray-200'
      }`}
      title={badge.desc}
    >
      <div className={`text-2xl ${badge.earned ? '' : 'grayscale opacity-30'}`}>{badge.emoji}</div>
      <p className={`text-[10px] font-bold mt-1 leading-tight ${badge.earned ? 'text-gray-800' : 'text-gray-400'}`}>
        {badge.label}
      </p>
      {!badge.earned && (
        <div className="absolute top-1.5 right-1.5 text-gray-300 text-xs">🔒</div>
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
      className={`${fraunces.variable} relative rounded-3xl border-2 border-amber-100 overflow-hidden`}
      style={{ background: 'linear-gradient(165deg, #fffbeb 0%, #fef3c7 100%)' }}
    >
      {/* Unlock toast */}
      <AnimatePresence>
        {showUnlock && (
          <motion.button
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            onClick={() => setShowUnlock(null)}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
          >
            <span>{showUnlock.emoji}</span> New badge: {showUnlock.label}!
          </motion.button>
        )}
      </AnimatePresence>

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p
              className="text-lg font-bold text-amber-900 italic"
              style={{ fontFamily: 'var(--font-rewards-display)' }}
            >
              Your Progress
            </p>
            {data.my_rank && (
              <p className="text-[11px] text-amber-700 font-semibold mt-0.5">🏆 Rank #{data.my_rank} in your class</p>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-1 justify-end">
              <CountUpNumber value={data.academic_points} className="text-3xl font-black text-amber-600" />
              <span className="text-xs font-bold text-amber-500">pts</span>
            </div>
            <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wide">Level {level}</p>
          </div>
        </div>

        <div className="flex items-center gap-5 mb-4">
          <StreakFlame days={data.streak.current} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-800 leading-relaxed">
              {data.streak.current === 0
                ? "Submit homework, ask a doubt, or take a test today to start a streak! 🌱"
                : `You're on fire! Keep going to beat your best of ${data.streak.longest} days.`}
            </p>
          </div>
        </div>

        {(earnedBadges.length > 0 || lockedBadges.length > 0) && (
          <div>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-wide mb-2">Badge Shelf</p>
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
