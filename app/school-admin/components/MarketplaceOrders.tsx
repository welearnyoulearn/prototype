'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

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
        <Button onClick={load} variant="outline" size="sm" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
          Refresh
        </Button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'approved', 'delivered', 'rejected'] as const).map(s => (
          <Button key={s} onClick={() => setFilter(s)} size="sm"
            variant={filter === s ? 'default' : 'outline'}
            className={`rounded-full capitalize ${filter === s ? 'bg-indigo-600 hover:bg-indigo-700 border-indigo-600' : 'text-gray-600 hover:border-indigo-300'}`}>
            {s === 'all' ? `All (${orders.length})` : `${s} (${counts[s] ?? 0})`}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={filter === 'all' ? 'No orders yet' : `No ${filter} orders`}
          description="Students earn coins from Daily Hub activities and redeem them here."
          className="rounded-2xl bg-white py-16"
        />
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
                    <Badge variant="outline" className={`capitalize ${STATUS_STYLE[order.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {order.status}
                    </Badge>
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
                      <Button onClick={() => updateStatus(order.id, 'approved')} disabled={updating === order.id} size="sm"
                        className="bg-blue-600 hover:bg-blue-700">
                        {updating === order.id ? '...' : 'Approve'}
                      </Button>
                      <Button onClick={() => updateStatus(order.id, 'rejected')} disabled={updating === order.id} size="sm" variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50">
                        Reject
                      </Button>
                    </>
                  )}
                  {isApproved && (
                    <Button onClick={() => updateStatus(order.id, 'delivered')} disabled={updating === order.id} size="sm"
                      className="bg-green-600 hover:bg-green-700">
                      {updating === order.id ? '...' : 'Mark Delivered'}
                    </Button>
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
