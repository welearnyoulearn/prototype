'use client'

import { useEffect, useState } from 'react'

type MarketplaceItem = { id: number; name: string; description: string; emoji: string; cost_points: number }
type Order = { id: number; item_name: string; item_emoji: string; points_spent: number; status: string; ordered_at: string }

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  approved:  'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
}

type Props = { studentId: number; schoolId: number; studentName: string }

export default function ParentMarketplace({ studentId, schoolId, studentName }: Props) {
  const [balance, setBalance]       = useState<number | null>(null)
  const [items, setItems]           = useState<MarketplaceItem[]>([])
  const [orders, setOrders]         = useState<Order[]>([])
  const [loading, setLoading]       = useState(true)
  const [confirmItem, setConfirmItem] = useState<MarketplaceItem | null>(null)
  const [ordering, setOrdering]     = useState(false)
  const [orderMsg, setOrderMsg]     = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/students/${studentId}/rewards?school_id=${schoolId}`).then(r => r.json()),
      fetch('/api/marketplace/items').then(r => r.json()),
      fetch(`/api/marketplace/order?student_id=${studentId}&school_id=${schoolId}`).then(r => r.json()),
    ]).then(([rewardsData, itemsData, ordersData]) => {
      setBalance(rewardsData?.marketplace_balance ?? 0)
      setItems(Array.isArray(itemsData) ? itemsData : [])
      setOrders(Array.isArray(ordersData) ? ordersData : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [studentId, schoolId])

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
        setOrderMsg(`Order placed! The school will deliver ${item.name} to ${studentName.split(' ')[0]}.`)
        setBalance(json.new_balance)
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
      <div className="space-y-4 animate-pulse">
        <div className="h-28 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  const firstName = studentName.split(' ')[0]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Marketplace</h2>
        <p className="text-xs text-gray-500 mt-0.5">Redeem {firstName}&apos;s earned coins for prizes — the school will deliver them in class.</p>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">🪙</span>
          <div>
            <p className="text-3xl font-black leading-none">{balance ?? 0}</p>
            <p className="text-sm opacity-80 mt-0.5">Available Marketplace Coins</p>
          </div>
        </div>
        <p className="text-xs opacity-70 mt-3">{firstName} earns coins by completing daily hub activities — GK Quiz, Riddles, Debates and more.</p>
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
          <p className="font-semibold text-gray-900 mb-1">Confirm Order</p>
          <p className="text-sm text-gray-600 mb-4">
            Order <span className="font-semibold">{confirmItem.emoji} {confirmItem.name}</span> for <span className="font-bold text-emerald-700">{confirmItem.cost_points} 🪙</span>?
            The school will deliver it to {firstName} in class.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmItem(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={() => placeOrder(confirmItem)} disabled={ordering}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              {ordering ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Ordering...</> : 'Confirm Order'}
            </button>
          </div>
        </div>
      )}

      {/* Items catalog */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Available Prizes</h3>
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No items available right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map(item => {
              const canAfford = (balance ?? 0) >= item.cost_points
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
                      {canAfford ? 'Order for ' + firstName : `Need ${item.cost_points - (balance ?? 0)} more 🪙`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Orders history */}
      {orders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Order History</h3>
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order.id} className="flex items-center gap-3">
                <span className="text-2xl">{order.item_emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{order.item_name}</p>
                  <p className="text-xs text-gray-400">{new Date(order.ordered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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

      {orders.length === 0 && (balance ?? 0) === 0 && (
        <div className="text-center py-10 text-gray-500">
          <p className="text-4xl mb-3">🪙</p>
          <p className="font-medium text-gray-700">No coins yet</p>
          <p className="text-sm mt-1">{firstName} earns coins by completing daily hub activities in the student portal.</p>
        </div>
      )}
    </div>
  )
}
