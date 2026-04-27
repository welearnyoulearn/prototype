'use client'

import { useEffect, useState } from 'react'

type Badge = {
  type: string
  label: string
  emoji: string
  desc: string
  earned: boolean
  earned_at: string | null
}

type LeaderboardEntry = {
  rank: number
  student_id: number
  name: string
  total_points: number
  is_me: boolean
}

type Transaction = {
  action_type: string
  points: number
  earned_at: string
}

type RewardsData = {
  total_points: number
  streak: { current: number; longest: number; last_activity_date: string | null }
  badges: Badge[]
  recent_transactions: Transaction[]
  leaderboard: LeaderboardEntry[]
  my_rank: number | null
  weekly_tests: {
    tests_taken: number
    avg_pct: number | null
    best_pct: number | null
    excellent_count: number
  }
}

type Props = {
  studentId: number
  schoolId: number
  classId?: number
}

const ACTION_LABELS: Record<string, string> = {
  task_submitted:        'Submitted a task',
  task_scored_high:      'High score on a task',
  doubt_resolved:        'Got a doubt resolved',
  newspaper_read:        'Read today\'s newspaper',
  streak_7days:          '7-day streak bonus',
  streak_30days:         '30-day streak bonus',
  weekly_test:           'Completed weekly test',
  weekly_test_good:      'Weekly test — Good (50–79%)',
  weekly_test_excellent: 'Weekly test — Excellent (≥80%)',
  weekly_test_perfect:   'Weekly test — Perfect score! 🎯',
}

export default function StudentRewards({ studentId, schoolId, classId }: Props) {
  const [data, setData] = useState<RewardsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const qs = new URLSearchParams({ school_id: String(schoolId) })
    if (classId) qs.set('class_id', String(classId))
    fetch(`/api/students/${studentId}/rewards?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [studentId, schoolId, classId])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl mx-auto">
        <div className="h-32 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-center py-20 text-gray-500">Could not load rewards data.</div>
  }

  const earnedBadges = data.badges.filter(b => b.earned)
  const lockedBadges = data.badges.filter(b => !b.earned)

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          emoji="⭐"
          label="Total Points"
          value={String(data.total_points)}
          color="from-yellow-400 to-orange-400"
        />
        <StatCard
          emoji="🔥"
          label="Current Streak"
          value={`${data.streak.current} day${data.streak.current !== 1 ? 's' : ''}`}
          color="from-orange-400 to-red-400"
        />
        <StatCard
          emoji="🏆"
          label="Class Rank"
          value={data.my_rank ? `#${data.my_rank}` : '—'}
          color="from-purple-400 to-indigo-500"
        />
      </div>

      {/* Streak info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-700">Activity Streak</h3>
          <span className="text-sm text-gray-500">Longest: {data.streak.longest} days</span>
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: Math.min(7, 7) }, (_, i) => {
            const isActive = i < data.streak.current % 8
            return (
              <div
                key={i}
                className={`flex-1 h-3 rounded-full ${isActive ? 'bg-orange-400' : 'bg-gray-200'}`}
              />
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {data.streak.current > 0
            ? `${data.streak.current} day streak! Keep it going!`
            : 'Complete an activity today to start your streak!'}
        </p>
      </div>

      {/* Weekly Test Performance */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Weekly AI Tests</h3>
          <span className="text-xs text-gray-400">{data.weekly_tests.tests_taken} test{data.weekly_tests.tests_taken !== 1 ? 's' : ''} taken</span>
        </div>

        {data.weekly_tests.tests_taken === 0 ? (
          <div className="text-center py-4">
            <p className="text-3xl mb-2">📝</p>
            <p className="text-sm text-gray-500">No weekly tests submitted yet</p>
            <p className="text-xs text-gray-400 mt-1">Complete your first test to earn up to 15 points</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <p className={`text-2xl font-black ${
                  (data.weekly_tests.avg_pct ?? 0) >= 80 ? 'text-green-600' :
                  (data.weekly_tests.avg_pct ?? 0) >= 50 ? 'text-yellow-600' : 'text-red-500'
                }`}>
                  {data.weekly_tests.avg_pct !== null ? `${data.weekly_tests.avg_pct}%` : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Avg Score</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-blue-600">
                  {data.weekly_tests.best_pct !== null ? `${data.weekly_tests.best_pct}%` : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Best Score</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-purple-600">{data.weekly_tests.excellent_count}</p>
                <p className="text-xs text-gray-500 mt-0.5">Excellent</p>
              </div>
            </div>

            {/* Avg score bar */}
            {data.weekly_tests.avg_pct !== null && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Average performance</span>
                  <span className="font-medium">{data.weekly_tests.avg_pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.weekly_tests.avg_pct >= 80 ? 'bg-green-400' :
                      data.weekly_tests.avg_pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${data.weekly_tests.avg_pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-300 mt-1">
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
            )}

            {/* Points per test explanation */}
            <div className="mt-3 bg-gray-50 rounded-xl p-3 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="font-bold text-gray-700">2 pts</span> completed</span>
              <span className="flex items-center gap-1"><span className="font-bold text-yellow-600">5 pts</span> ≥50%</span>
              <span className="flex items-center gap-1"><span className="font-bold text-green-600">10 pts</span> ≥80%</span>
              <span className="flex items-center gap-1"><span className="font-bold text-purple-600">15 pts</span> 100%</span>
            </div>
          </>
        )}
      </div>

      {/* Earned Badges */}
      {earnedBadges.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Badges Earned ({earnedBadges.length})</h3>
          <div className="grid grid-cols-3 gap-3">
            {earnedBadges.map(badge => (
              <div
                key={badge.type}
                className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-amber-100 rounded-xl p-3 text-center"
              >
                <div className="text-3xl mb-1">{badge.emoji}</div>
                <p className="text-xs font-semibold text-amber-800">{badge.label}</p>
                <p className="text-xs text-amber-600 mt-0.5 leading-tight">{badge.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked Badges */}
      {lockedBadges.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Badges to Unlock ({lockedBadges.length})</h3>
          <div className="grid grid-cols-3 gap-3">
            {lockedBadges.map(badge => (
              <div
                key={badge.type}
                className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center opacity-60"
              >
                <div className="text-3xl mb-1 grayscale">{badge.emoji}</div>
                <p className="text-xs font-semibold text-gray-600">{badge.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{badge.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Class Leaderboard */}
      {data.leaderboard.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Class Leaderboard</h3>
          <div className="space-y-2">
            {data.leaderboard.map((entry) => (
              <div
                key={entry.student_id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  entry.is_me
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'bg-gray-50'
                }`}
              >
                <span className={`w-6 text-center font-bold text-sm ${
                  entry.rank === 1 ? 'text-yellow-500' :
                  entry.rank === 2 ? 'text-gray-500' :
                  entry.rank === 3 ? 'text-amber-600' : 'text-gray-400'
                }`}>
                  {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                </span>
                <span className={`flex-1 text-sm font-medium ${entry.is_me ? 'text-indigo-700' : 'text-gray-700'}`}>
                  {entry.name}
                  {entry.is_me && <span className="text-xs ml-1 text-indigo-400">(you)</span>}
                </span>
                <span className="text-sm font-semibold text-gray-600">{entry.total_points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {data.recent_transactions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {data.recent_transactions.map((tx, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-sm">⭐</div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700">{ACTION_LABELS[tx.action_type] || tx.action_type}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(tx.earned_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className="text-sm font-semibold text-yellow-600">+{tx.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.total_points === 0 && earnedBadges.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">🌱</p>
          <p className="font-medium text-gray-700">Start earning points!</p>
          <p className="text-sm mt-1">Submit tasks, get doubts resolved, and read the daily newspaper to earn rewards.</p>
        </div>
      )}
    </div>
  )
}

function StatCard({
  emoji, label, value, color
}: {
  emoji: string; label: string; value: string; color: string
}) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white text-center shadow-sm`}>
      <div className="text-2xl mb-1">{emoji}</div>
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="text-xs opacity-80 mt-1">{label}</p>
    </div>
  )
}
