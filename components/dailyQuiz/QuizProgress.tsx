'use client'

// Points, streak, badges, this week and the class leaderboard (#434), under the Daily Quiz. A student sees the
// top 10 and their own place; a parent sees their child's place, the class average and the top 3 only.

import { useEffect, useState } from 'react'
import { Flame, Medal, Star, Target, TrendingUp, Trophy, Users } from 'lucide-react'
import type { QuizExperience } from './DailyQuiz'

type Leader = { rank: number; name: string; points: number; isMe: boolean }
type Progress = {
  studentName: string; totalPoints: number; weekPoints: number; streak: number
  badges: { type: string; label: string; emoji: string; desc: string }[]
  week: { weekStart: string; quizzes: number; finished: number; accuracy: number | null; strongest: { subject: string; pct: number } | null; weakest: { subject: string; pct: number } | null } | null
  leaderboard: { me: { rank: number; points: number } | null; classSize: number; classAverage?: number; top: Leader[] } | null
  improved: { name: string; gain: number; isMe: boolean }[] | null
  classGoal: { pct: number | null; goal: number; met: boolean; quizzes: number } | null
}

const PROGRESS_API = { student: '/api/student/quiz/progress', parent: '/api/parent/quiz/progress' } as const

export default function QuizProgress({ experience, query }: { experience: QuizExperience; query: string }) {
  const [data, setData] = useState<Progress | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(`${PROGRESS_API[experience]}${query}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: Progress) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [experience, query])

  if (failed) return null
  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-gray-100" aria-hidden="true" />
  const parent = experience === 'parent'
  const first = data.studentName.split(' ')[0] || 'Your child'
  const lb = data.leaderboard

  return (
    <section className="space-y-4" aria-labelledby="dq-progress" data-testid="quiz-progress">
      <h3 id="dq-progress" className="text-base font-extrabold">{parent ? `${first}'s points and progress` : 'Your points and progress'}</h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={<Star className="h-5 w-5 text-amber-500" aria-hidden="true" />} label="Reward points" value={data.totalPoints} testid="quiz-points-total" hint="Saved for rewards" />
        <Tile icon={<TrendingUp className="h-5 w-5 text-emerald-600" aria-hidden="true" />} label="This week" value={data.weekPoints} testid="quiz-points-week" />
        <Tile icon={<Flame className="h-5 w-5 text-orange-500" aria-hidden="true" />} label="Streak" value={`${data.streak} day${data.streak === 1 ? '' : 's'}`} testid="quiz-streak" hint="School days in a row" />
        <Tile icon={<Medal className="h-5 w-5 text-indigo-500" aria-hidden="true" />} label="Badges" value={data.badges.length} testid="quiz-badges-count" />
      </div>

      {data.badges.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Badges">
          {data.badges.map(b => (
            <li key={b.type} title={b.desc} className="rounded-full border-2 border-gray-900 bg-white px-3 py-1 text-sm font-bold" data-testid={`quiz-badge-${b.type}`}>{b.emoji} {b.label}</li>
          ))}
        </ul>
      )}

      {data.week && (
        <div className="rounded-2xl border bg-white p-4" data-testid="quiz-week">
          <p className="text-sm font-extrabold">This week</p>
          <p className="mt-1 text-sm text-gray-700">
            {parent ? first : 'You'} finished <strong>{data.week.finished}</strong> of {data.week.quizzes} quiz{data.week.quizzes === 1 ? '' : 'zes'} on time
            {data.week.accuracy !== null && <> · <strong>{data.week.accuracy}%</strong> correct</>}.
          </p>
          {(data.week.strongest || data.week.weakest) && (
            <p className="mt-1 text-sm text-gray-700">
              {data.week.strongest && <>Strongest: <strong>{data.week.strongest.subject}</strong> ({data.week.strongest.pct}%)</>}
              {data.week.weakest && <> · Needs practice: <strong>{data.week.weakest.subject}</strong> ({data.week.weakest.pct}%)</>}
            </p>
          )}
        </div>
      )}

      {lb && (
        <div className="rounded-2xl border bg-white p-4" data-testid="quiz-leaderboard">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-extrabold"><Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" /> Class leaderboard · this week</p>
            {lb.me && (
              <p className="text-sm font-bold" data-testid="quiz-my-rank">{parent ? first : 'You'}: #{lb.me.rank} of {lb.classSize}{parent && lb.classAverage !== undefined && ` · class average ${lb.classAverage} pts`}</p>
            )}
          </div>
          {lb.top.every(r => r.points === 0) ? (
            <p className="mt-2 text-sm text-gray-600">No points yet this week — the first quiz sets the board.</p>
          ) : (
            <ol className="mt-3 space-y-1">
              {lb.top.map(r => (
                <li key={`${r.rank}-${r.name}`} className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm ${r.isMe ? 'bg-yellow-100 font-extrabold' : ''}`}>
                  <span><span className="inline-block w-8 font-bold text-gray-500">#{r.rank}</span>{r.name}{r.isMe && (parent ? ' (your child)' : ' (you)')}</span>
                  <span className="font-bold tabular-nums">{r.points} pts</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-gray-500">Points for finishing on time, correct answers, perfect quizzes, streaks and improving. Late catch-ups don’t count here.</p>
        </div>
      )}

      {data.improved && data.improved.length > 0 && (
        <div className="rounded-2xl border bg-white p-4" data-testid="quiz-improved">
          <p className="flex items-center gap-2 text-sm font-extrabold"><Target className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Most improved</p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.improved.map(r => <li key={r.name} className={r.isMe ? 'font-extrabold' : ''}>{r.name}: +{r.gain}% correct vs last week</li>)}
          </ul>
        </div>
      )}

      {data.classGoal && data.classGoal.pct !== null && (
        <div className="rounded-2xl border bg-white p-4" data-testid="quiz-class-goal">
          <p className="flex items-center gap-2 text-sm font-extrabold"><Users className="h-4 w-4 text-sky-600" aria-hidden="true" /> Class goal</p>
          <p className="mt-1 text-sm text-gray-700">The class took part in <strong>{data.classGoal.pct}%</strong> of quizzes this week · goal {data.classGoal.goal}% {data.classGoal.met ? '✓' : ''}</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${data.classGoal.pct}% of ${data.classGoal.goal}% goal`}>
            <div className={`h-full rounded-full ${data.classGoal.met ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, data.classGoal.pct)}%` }} />
          </div>
        </div>
      )}
    </section>
  )
}

function Tile({ icon, label, value, hint, testid }: { icon: React.ReactNode; label: string; value: number | string; hint?: string; testid: string }) {
  return (
    <div className="rounded-2xl border-2 border-gray-900 bg-white p-3" data-testid={testid}>
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">{icon}{label}</div>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
