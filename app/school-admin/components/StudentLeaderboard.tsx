'use client'

import { useEffect, useState } from 'react'

type LeaderboardEntry = {
  rank: number
  student_id: number
  name: string
  grade: string
  section: string
  roll_number: string
  total_points: number
  badge_count: number
  current_streak: number
  longest_streak: number
}

type ClassRow = { id: number; grade: string; section: string }

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return <span className="text-xl">{MEDAL[rank]}</span>
  return (
    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
      rank <= 10 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {rank}
    </span>
  )
}

export default function StudentLeaderboard({ schoolId }: { schoolId: number }) {
  const [entries, setEntries]       = useState<LeaderboardEntry[]>([])
  const [classes, setClasses]       = useState<ClassRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [search, setSearch]         = useState('')

  useEffect(() => { loadClasses() }, [schoolId])
  useEffect(() => { loadLeaderboard() }, [schoolId, selectedClass])

  async function loadClasses() {
    try {
      const r = await fetch(`/api/classes?school_id=${schoolId}`)
      if (r.ok) setClasses(await r.json())
    } catch { /* ignore */ }
  }

  async function loadLeaderboard() {
    setLoading(true)
    try {
      const classParam = selectedClass !== 'all' ? `&class_id=${selectedClass}` : ''
      const r = await fetch(`/api/leaderboard?school_id=${schoolId}${classParam}&limit=100`)
      if (r.ok) setEntries(await r.json())
    } finally {
      setLoading(false)
    }
  }

  const filtered = entries.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    `${e.grade}-${e.section}`.toLowerCase().includes(search.toLowerCase())
  )

  // Summary stats
  const totalWithPoints = entries.filter(e => e.total_points > 0).length
  const topPoints = entries[0]?.total_points ?? 0
  const avgPoints = entries.length > 0
    ? Math.round(entries.reduce((s, e) => s + e.total_points, 0) / entries.length)
    : 0

  // Top 3 podium
  const top3 = entries.slice(0, 3)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Student Leaderboard</h2>
          <p className="text-sm text-gray-400 mt-0.5">School-wide rankings based on points earned</p>
        </div>
        <button onClick={loadLeaderboard}
          className="px-3 py-1.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: entries.length,    color: 'text-gray-800' },
          { label: 'Active Earners', value: totalWithPoints,   color: 'text-green-600' },
          { label: 'Highest Score',  value: topPoints,         color: 'text-amber-600' },
          { label: 'Avg Points',     value: avgPoints,         color: 'text-indigo-600' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Podium — top 3 */}
      {top3.length >= 3 && (
        <div className="bg-gradient-to-b from-amber-50 to-white border border-amber-100 rounded-2xl p-6">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest text-center mb-5">Top Performers</p>
          <div className="flex items-end justify-center gap-6">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl">🥈</span>
              <div className="w-24 h-16 bg-gray-200 rounded-t-xl flex items-center justify-center">
                <span className="text-xl font-black text-gray-600">2</span>
              </div>
              <p className="text-xs font-semibold text-gray-700 text-center max-w-[80px] leading-tight">{top3[1]?.name}</p>
              <p className="text-xs text-gray-400">{top3[1]?.grade}-{top3[1]?.section}</p>
              <p className="text-sm font-bold text-gray-600">{top3[1]?.total_points} pts</p>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-1 -mt-6">
              <span className="text-4xl">🥇</span>
              <div className="w-28 h-24 bg-amber-400 rounded-t-xl flex items-center justify-center shadow-lg">
                <span className="text-3xl font-black text-white">1</span>
              </div>
              <p className="text-sm font-bold text-gray-800 text-center max-w-[90px] leading-tight">{top3[0]?.name}</p>
              <p className="text-xs text-gray-400">{top3[0]?.grade}-{top3[0]?.section}</p>
              <p className="text-sm font-bold text-amber-600">{top3[0]?.total_points} pts</p>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl">🥉</span>
              <div className="w-24 h-12 bg-amber-700/30 rounded-t-xl flex items-center justify-center">
                <span className="text-xl font-black text-amber-900/60">3</span>
              </div>
              <p className="text-xs font-semibold text-gray-700 text-center max-w-[80px] leading-tight">{top3[2]?.name}</p>
              <p className="text-xs text-gray-400">{top3[2]?.grade}-{top3[2]?.section}</p>
              <p className="text-sm font-bold text-gray-600">{top3[2]?.total_points} pts</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
          placeholder="Search student…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={selectedClass}
          onChange={e => setSelectedClass(e.target.value)}
        >
          <option value="all">All Classes</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} students</span>
      </div>

      {/* Full leaderboard table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading leaderboard…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No students found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Rank', 'Student', 'Class', 'Points', 'Badges', 'Streak', 'Longest Streak'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((e, idx) => (
                  <tr key={e.student_id}
                    className={`transition-colors ${idx < 3 ? 'bg-amber-50/30' : 'hover:bg-gray-50/50'}`}>
                    <td className="px-4 py-3">
                      <RankBadge rank={e.rank} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{e.name}</p>
                      {e.roll_number && <p className="text-xs text-gray-400">#{e.roll_number}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        {e.grade}-{e.section}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${e.total_points > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {e.total_points.toLocaleString()}
                        </span>
                        {/* Mini progress bar vs top */}
                        {topPoints > 0 && (
                          <div className="w-16 bg-gray-100 rounded-full h-1.5 hidden sm:block">
                            <div
                              className="bg-amber-400 h-full rounded-full"
                              style={{ width: `${Math.round((e.total_points / topPoints) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">{e.badge_count > 0 ? `🏅 ${e.badge_count}` : '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${e.current_streak > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                        {e.current_streak > 0 ? `🔥 ${e.current_streak}d` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {e.longest_streak > 0 ? `${e.longest_streak}d` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
