'use client'

import { useEffect, useState } from 'react'

type Order = {
  id: number
  student_name: string
  student_name_db: string
  grade: string
  section: string
  item_name: string
  item_emoji: string
  points_spent: number
  status: 'pending' | 'approved' | 'delivered' | 'rejected'
  ordered_at: string
  updated_at: string
}

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved:  'bg-blue-100 text-blue-700 border-blue-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  rejected:  'bg-red-100 text-red-700 border-red-200',
}

export default function MarketplaceOrders({ schoolId }: { schoolId: number }) {
  const [orders, setOrders]   = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<number | null>(null)
  const [filter, setFilter]   = useState<'all' | 'pending' | 'approved' | 'delivered' | 'rejected'>('all')

  function load() {
    setLoading(true)
    fetch(`/api/marketplace/order?admin_school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(orderId: number, status: 'approved' | 'delivered' | 'rejected') {
    setUpdating(orderId)
    try {
      const res = await fetch('/api/marketplace/order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status }),
      })
      const json = await res.json()
      if (json.ok) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, updated_at: json.order.updated_at } : o))
      }
    } catch { /* noop */ } finally {
      setUpdating(null)
    }
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)
  const counts = orders.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status as keyof typeof acc] ?? 0) + 1 }), { pending: 0, approved: 0, delivered: 0, rejected: 0 })

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Marketplace Orders</h2>
          <p className="text-xs text-gray-500 mt-0.5">Students redeem their hub activity coins for prizes. Fulfill orders and mark them delivered.</p>
        </div>
        <button onClick={load} className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50">
          Refresh
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'approved', 'delivered', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${
              filter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            }`}>
            {s === 'all' ? `All (${orders.length})` : `${s} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-3xl mb-3">🛍️</p>
          <p className="text-gray-500 font-medium">{filter === 'all' ? 'No orders yet' : `No ${filter} orders`}</p>
          <p className="text-gray-400 text-sm mt-1">Students earn coins from Daily Hub activities and redeem them here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const name = order.student_name_db || order.student_name || '—'
            const isPending = order.status === 'pending'
            const isApproved = order.status === 'approved'
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                <span className="text-3xl flex-shrink-0">{order.item_emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900">{order.item_name}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[order.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{name} · Grade {order.grade}-{order.section}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-emerald-700 font-semibold">{order.points_spent} 🪙</span>
                    <span className="text-xs text-gray-400">Ordered {new Date(order.ordered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {isPending && (
                    <>
                      <button onClick={() => updateStatus(order.id, 'approved')} disabled={updating === order.id}
                        className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        {updating === order.id ? '...' : 'Approve'}
                      </button>
                      <button onClick={() => updateStatus(order.id, 'rejected')} disabled={updating === order.id}
                        className="text-xs border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        Reject
                      </button>
                    </>
                  )}
                  {isApproved && (
                    <button onClick={() => updateStatus(order.id, 'delivered')} disabled={updating === order.id}
                      className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors">
                      {updating === order.id ? '...' : 'Mark Delivered'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
