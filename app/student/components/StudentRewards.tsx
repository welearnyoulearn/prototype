'use client'

import { useEffect, useState } from 'react'

type Badge = { type: string; label: string; emoji: string; desc: string; earned: boolean; earned_at: string | null }
type LeaderboardEntry = { rank: number; student_id: number; name: string; total_points: number; is_me: boolean }
type Transaction = { action_type: string; points: number; points_type: string; earned_at: string }
type MarketplaceItem = { id: number; name: string; description: string; emoji: string; cost_points: number }
type Order = { id: number; item_name: string; item_emoji: string; points_spent: number; status: string; ordered_at: string }

type RewardsData = {
  total_points: number
  academic_points: number
  marketplace_balance: number
  marketplace_earned: number
  streak: { current: number; longest: number; last_activity_date: string | null }
  badges: Badge[]
  recent_transactions: Transaction[]
  leaderboard: LeaderboardEntry[]
  my_rank: number | null
  weekly_tests: { tests_taken: number; avg_pct: number | null; best_pct: number | null; excellent_count: number }
}

type Props = { studentId: number; schoolId: number; classId?: number; grade?: string }

const ACTION_LABELS: Record<string, string> = {
  task_submitted:        'Submitted homework',
  task_scored_high:      'High score on task',
  doubt_resolved:        'Got a doubt resolved',
  newspaper_read:        'Read daily knowledge',
  newspaper_quiz_correct:'Daily knowledge quiz correct',
  streak_7days:          '7-day streak bonus',
  streak_30days:         '30-day streak bonus',
  weekly_test:           'Completed weekly test',
  weekly_test_good:      'Weekly test — Good (50–79%)',
  weekly_test_excellent: 'Weekly test — Excellent (≥80%)',
  weekly_test_perfect:   'Weekly test — Perfect score! 🎯',
  hub_gk_quiz:           'GK Quiz',
  hub_word_of_day:       'Word of the Day',
  hub_mental_math:       'Mental Math Challenge',
  hub_typing_test:       'Typing Speed Test',
  hub_riddle:            'Riddle of the Day',
  hub_fact_myth:         'Fact or Myth?',
  hub_debate:            'Debate of the Day',
  hub_challenge:         'Daily Challenge',
}

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  approved:  'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
}

export default function StudentRewards({ studentId, schoolId, classId, grade }: Props) {
  const canUseMarketplace = parseInt(grade ?? '0') >= 6
  const [data, setData]       = useState<RewardsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<'academic' | 'marketplace'>('academic')

  const [items, setItems]         = useState<MarketplaceItem[]>([])
  const [orders, setOrders]       = useState<Order[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [confirmItem, setConfirmItem]     = useState<MarketplaceItem | null>(null)
  const [ordering, setOrdering]   = useState(false)
  const [orderMsg, setOrderMsg]   = useState('')

  useEffect(() => {
    const qs = new URLSearchParams({ school_id: String(schoolId) })
    if (classId) qs.set('class_id', String(classId))
    fetch(`/api/students/${studentId}/rewards?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [studentId, schoolId, classId])

  useEffect(() => {
    if (tab !== 'marketplace') return
    setMarketLoading(true)
    Promise.all([
      fetch('/api/marketplace/items').then(r => r.json()),
      fetch(`/api/marketplace/order?student_id=${studentId}&school_id=${schoolId}`).then(r => r.json()),
    ]).then(([itemsData, ordersData]) => {
      setItems(Array.isArray(itemsData) ? itemsData : [])
      setOrders(Array.isArray(ordersData) ? ordersData : [])
    }).catch(() => {}).finally(() => setMarketLoading(false))
  }, [tab, studentId, schoolId])

  async function placeOrder(item: MarketplaceItem) {
    setOrdering(true); setOrderMsg('')
    try {
      const res = await fetch('/api/marketplace/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, school_id: schoolId, item_id: item.id }),
      })
      const json = await res.json()
      if (json.ok) {
        setOrderMsg(`Order placed! Your school will deliver your ${item.name} soon.`)
        // Refresh balance + orders
        setData(prev => prev ? { ...prev, marketplace_balance: json.new_balance } : prev)
        setOrders(prev => [{
          id: json.order_id, item_name: item.name, item_emoji: item.emoji,
          points_spent: item.cost_points, status: 'pending', ordered_at: new Date().toISOString(),
        }, ...prev])
      } else {
        setOrderMsg(json.error ?? 'Could not place order.')
      }
    } catch {
      setOrderMsg('Network error. Please try again.')
    } finally {
      setOrdering(false); setConfirmItem(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl mx-auto">
        <div className="h-28 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  if (!data) return <div className="text-center py-20 text-gray-500">Could not load rewards data.</div>

  const earnedBadges = data.badges.filter(b => b.earned)
  const lockedBadges = data.badges.filter(b => !b.earned)

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── Wallet card(s) ───────────────────────────────────────────── */}
      <div className={`grid gap-3 ${canUseMarketplace ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button onClick={() => setTab('academic')}
          className={`rounded-2xl p-4 text-left transition-all border-2 ${tab === 'academic' ? 'border-yellow-400 bg-gradient-to-br from-yellow-400 to-orange-400 text-white shadow-md' : 'border-transparent bg-gradient-to-br from-yellow-50 to-orange-50 text-yellow-800 hover:border-yellow-300'}`}>
          <div className="text-2xl mb-1">⭐</div>
          <p className="text-2xl font-black leading-none">{data.academic_points}</p>
          <p className="text-xs mt-1 opacity-80 font-medium">Academic Points</p>
          <p className="text-[10px] opacity-60 mt-0.5">Homework · Tests · Doubts</p>
        </button>
        {canUseMarketplace && (
          <button onClick={() => setTab('marketplace')}
            className={`rounded-2xl p-4 text-left transition-all border-2 ${tab === 'marketplace' ? 'border-emerald-400 bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md' : 'border-transparent bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-800 hover:border-emerald-300'}`}>
            <div className="text-2xl mb-1">🪙</div>
            <p className="text-2xl font-black leading-none">{data.marketplace_balance}</p>
            <p className="text-xs mt-1 opacity-80 font-medium">Marketplace Coins</p>
            <p className="text-[10px] opacity-60 mt-0.5">Hub activities · Redeem prizes</p>
          </button>
        )}
      </div>

      {/* ── Rank + Streak mini row ───────────────────────────────────── */}
      {tab === 'academic' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="text-xl font-black text-gray-900">{data.my_rank ? `#${data.my_rank}` : '—'}</p>
              <p className="text-xs text-gray-500">Class Rank</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <span className="text-2xl">🔥</span>
            <div>
              <p className="text-xl font-black text-gray-900">{data.streak.current}</p>
              <p className="text-xs text-gray-500">Day Streak</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          ACADEMIC TAB
          ════════════════════════════════════════════════════════════════ */}
      {tab === 'academic' && (
        <>
          {/* Streak bar */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">Activity Streak</h3>
              <span className="text-sm text-gray-400">Longest: {data.streak.longest} days</span>
            </div>
            <div className="flex items-center gap-2">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className={`flex-1 h-3 rounded-full ${i < data.streak.current % 8 ? 'bg-orange-400' : 'bg-gray-200'}`} />
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {data.streak.current > 0 ? `${data.streak.current} day streak! Keep it going!` : 'Complete an activity today to start your streak!'}
            </p>
          </div>

          {/* Weekly tests */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-700">Weekly AI Tests</h3>
              <span className="text-xs text-gray-400">{data.weekly_tests.tests_taken} test{data.weekly_tests.tests_taken !== 1 ? 's' : ''} taken</span>
            </div>
            {data.weekly_tests.tests_taken === 0 ? (
              <div className="text-center py-4">
                <p className="text-3xl mb-2">📝</p>
                <p className="text-sm text-gray-500">No weekly tests submitted yet</p>
                <p className="text-xs text-gray-400 mt-1">Complete your first test to earn up to 15 academic points</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center">
                    <p className={`text-2xl font-black ${(data.weekly_tests.avg_pct ?? 0) >= 80 ? 'text-green-600' : (data.weekly_tests.avg_pct ?? 0) >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {data.weekly_tests.avg_pct !== null ? `${data.weekly_tests.avg_pct}%` : '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Avg Score</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-blue-600">{data.weekly_tests.best_pct !== null ? `${data.weekly_tests.best_pct}%` : '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Best Score</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-purple-600">{data.weekly_tests.excellent_count}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Excellent</p>
                  </div>
                </div>
                {data.weekly_tests.avg_pct !== null && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Average performance</span><span className="font-medium">{data.weekly_tests.avg_pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${data.weekly_tests.avg_pct >= 80 ? 'bg-green-400' : data.weekly_tests.avg_pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                        style={{ width: `${data.weekly_tests.avg_pct}%` }} />
                    </div>
                  </div>
                )}
                <div className="mt-3 bg-gray-50 rounded-xl p-3 flex gap-4 text-xs text-gray-500">
                  <span><span className="font-bold text-gray-700">2 pts</span> done</span>
                  <span><span className="font-bold text-yellow-600">5 pts</span> ≥50%</span>
                  <span><span className="font-bold text-green-600">10 pts</span> ≥80%</span>
                  <span><span className="font-bold text-purple-600">15 pts</span> 100%</span>
                </div>
              </>
            )}
          </div>

          {/* Earned badges */}
          {earnedBadges.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Badges Earned ({earnedBadges.length})</h3>
              <div className="grid grid-cols-3 gap-3">
                {earnedBadges.map(badge => (
                  <div key={badge.type} className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                    <div className="text-3xl mb-1">{badge.emoji}</div>
                    <p className="text-xs font-semibold text-amber-800">{badge.label}</p>
                    <p className="text-xs text-amber-600 mt-0.5 leading-tight">{badge.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locked badges */}
          {lockedBadges.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Badges to Unlock ({lockedBadges.length})</h3>
              <div className="grid grid-cols-3 gap-3">
                {lockedBadges.map(badge => (
                  <div key={badge.type} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center opacity-50">
                    <div className="text-3xl mb-1 grayscale">{badge.emoji}</div>
                    <p className="text-xs font-semibold text-gray-600">{badge.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-tight">{badge.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {data.leaderboard.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Class Leaderboard <span className="text-xs font-normal text-gray-400">(Academic Points)</span></h3>
              <div className="space-y-2">
                {data.leaderboard.map(entry => (
                  <div key={entry.student_id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl ${entry.is_me ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                    <span className={`w-6 text-center font-bold text-sm ${entry.rank === 1 ? 'text-yellow-500' : entry.rank === 2 ? 'text-gray-500' : entry.rank === 3 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                    </span>
                    <span className={`flex-1 text-sm font-medium ${entry.is_me ? 'text-yellow-800' : 'text-gray-700'}`}>
                      {entry.name}{entry.is_me && <span className="text-xs ml-1 text-yellow-500">(you)</span>}
                    </span>
                    <span className="text-sm font-semibold text-gray-600">{entry.total_points} ⭐</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent academic activity */}
          {data.recent_transactions.filter(t => !t.points_type || t.points_type === 'academic').length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Recent Academic Activity</h3>
              <div className="space-y-3">
                {data.recent_transactions.filter(t => !t.points_type || t.points_type === 'academic').slice(0, 8).map((tx, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-sm">⭐</div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{ACTION_LABELS[tx.action_type] || tx.action_type}</p>
                      <p className="text-xs text-gray-400">{new Date(tx.earned_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <span className="text-sm font-semibold text-yellow-600">+{tx.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.academic_points === 0 && earnedBadges.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">🌱</p>
              <p className="font-medium text-gray-700">Start earning Academic Points!</p>
              <p className="text-sm mt-1">Submit homework, take weekly tests, and get doubts resolved.</p>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MARKETPLACE TAB
          ════════════════════════════════════════════════════════════════ */}
      {canUseMarketplace && tab === 'marketplace' && (
        <>
          {/* Balance + how to earn */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-3xl font-black text-emerald-800">{data.marketplace_balance} 🪙</p>
                <p className="text-sm text-emerald-600 mt-0.5">Available to spend</p>
              </div>
              <div className="text-right text-xs text-emerald-600">
                <p>Total earned: {data.marketplace_earned} 🪙</p>
              </div>
            </div>
            <div className="bg-white/60 rounded-xl px-4 py-2 text-xs text-emerald-700">
              <span className="font-semibold">Earn coins</span> by completing Daily Hub activities — GK Quiz, Riddles, Debates, Challenges and more.
            </div>
          </div>

          {/* Order message */}
          {orderMsg && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${orderMsg.startsWith('Order') ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {orderMsg}
            </div>
          )}

          {/* Confirm dialog */}
          {confirmItem && (
            <div className="bg-white border-2 border-emerald-300 rounded-2xl p-5">
              <p className="font-semibold text-gray-900 mb-1">Confirm Redemption</p>
              <p className="text-sm text-gray-600 mb-4">
                Redeem <span className="font-semibold">{confirmItem.emoji} {confirmItem.name}</span> for <span className="font-bold text-emerald-700">{confirmItem.cost_points} 🪙</span>?
                Your school will deliver it to you.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmItem(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={() => placeOrder(confirmItem)} disabled={ordering}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                  {ordering ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Placing...</> : 'Confirm Order'}
                </button>
              </div>
            </div>
          )}

          {/* Items catalog */}
          {marketLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Marketplace Items</h3>
              <div className="grid grid-cols-2 gap-3">
                {items.map(item => {
                  const canAfford = data.marketplace_balance >= item.cost_points
                  const hasPending = orders.some(o => o.item_name === item.name && o.status === 'pending')
                  return (
                    <div key={item.id} className={`border rounded-2xl p-4 flex flex-col gap-2 transition-all ${canAfford && !hasPending ? 'border-emerald-200 bg-emerald-50 hover:shadow-sm' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                      <div className="flex items-start justify-between">
                        <span className="text-3xl">{item.emoji}</span>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">{item.cost_points} 🪙</span>
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                      </div>
                      {hasPending ? (
                        <span className="text-xs text-yellow-700 bg-yellow-100 px-3 py-1.5 rounded-lg text-center font-medium">Order Pending</span>
                      ) : (
                        <button onClick={() => { setConfirmItem(item); setOrderMsg('') }} disabled={!canAfford}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-1.5 rounded-lg transition-colors">
                          {canAfford ? 'Redeem' : `Need ${item.cost_points - data.marketplace_balance} more 🪙`}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* My Orders */}
          {orders.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4">My Orders</h3>
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order.id} className="flex items-center gap-3">
                    <span className="text-2xl">{order.item_emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{order.item_name}</p>
                      <p className="text-xs text-gray-400">{new Date(order.ordered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {order.status}
                      </span>
                      <span className="text-xs text-gray-400">{order.points_spent} 🪙</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hub recent activity */}
          {data.recent_transactions.filter(t => t.points_type === 'marketplace').length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Recent Hub Activity</h3>
              <div className="space-y-3">
                {data.recent_transactions.filter(t => t.points_type === 'marketplace').slice(0, 8).map((tx, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-sm">🪙</div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{ACTION_LABELS[tx.action_type] || tx.action_type}</p>
                      <p className="text-xs text-gray-400">{new Date(tx.earned_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600">+{tx.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.marketplace_earned === 0 && (
            <div className="text-center py-10 text-gray-500">
              <p className="text-4xl mb-3">🪙</p>
              <p className="font-medium text-gray-700">No marketplace coins yet</p>
              <p className="text-sm mt-1">Go to Student Hub and complete daily activities to earn coins.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
