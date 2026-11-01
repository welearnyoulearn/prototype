'use client'

import { useEffect, useState } from 'react'
import type { RewardsView } from '@/lib/marketplace/service'

// The Rewards shop, shared by the student portal and the parent portal (a parent orders for one child from the
// child's own points). Everything is in points. Items are collected from the school office once they arrive.

type Props = {
  /** GET for the view, e.g. /api/student/rewards or /api/parent/rewards?student_id=7 */
  viewUrl: string
  /** POST to order */
  orderUrl: string
  cancelUrl: (orderId: number) => string
  /** Extra fields for POST bodies (the parent portal sends student_id). */
  extraBody?: Record<string, number>
  /** Set in the parent portal: the child's first name, used in the messages. */
  childName?: string
}

const STEPS = ['Ordered', 'In the next delivery', 'On the way to school', 'At school: collect it', 'Collected'] as const
const STEP_OF: Record<string, number> = { placed: 1, sent: 2, at_school: 3, delivered: 4 }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

export default function RewardsShop({ viewUrl, orderUrl, cancelUrl, extraBody, childName }: Props) {
  const [view, setView] = useState<RewardsView | null>(null)
  const [failed, setFailed] = useState<'' | 'error' | 'disabled'>('')
  const [reloadKey, setReloadKey] = useState(0)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const reload = () => setReloadKey(k => k + 1)

  useEffect(() => {
    let cancelled = false
    fetch(viewUrl, { cache: 'no-store' })
      .then(async res => {
        if (cancelled) return
        if (res.status === 403) { setFailed('disabled'); return }
        if (!res.ok) throw new Error(String(res.status))
        setView(await res.json() as RewardsView)
        setFailed('')
      })
      .catch(() => { if (!cancelled) setFailed('error') })
    return () => { cancelled = true }
  }, [viewUrl, reloadKey])

  async function post(url: string, body: Record<string, number>) {
    setBusy(true); setNotice(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...extraBody, ...body }) })
      return { res, data: await res.json().catch(() => ({})) as { error?: string; order?: { itemName: string; pointsCost: number }; run?: { label: string; cutoffAt: string } } }
    } finally {
      setBusy(false)
    }
  }

  async function order(itemId: number) {
    setConfirming(null)
    try {
      const { res, data } = await post(orderUrl, { item_id: itemId })
      if (!res.ok || !data.order || !data.run) { setNotice({ tone: 'error', text: data.error ?? 'Could not place the order. Please try again.' }); return }
      const collector = childName ? `${childName} can collect it` : 'collect it'
      setNotice({
        tone: 'ok',
        text: `✅ Order placed${childName ? ` for ${childName}` : ''}! ${data.order.itemName} · ${data.order.pointsCost} points held. It goes to school in the next delivery (orders close on ${fmtDate(data.run.cutoffAt)}). When it reaches school, ${collector} from the school management (school office). We’ll tell ${childName ? 'you' : 'you here'}.`,
      })
      reload()
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the server. Please try again.' })
    }
  }

  async function cancel(orderId: number) {
    try {
      const { res, data } = await post(cancelUrl(orderId), {})
      setNotice(res.ok ? { tone: 'ok', text: 'Order cancelled. The points are back in the balance.' } : { tone: 'error', text: data.error ?? 'Could not cancel.' })
      reload()
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the server. Please try again.' })
    }
  }

  if (failed === 'disabled') return <p className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600" data-testid="rewards-disabled">The rewards shop isn’t switched on for this school yet.</p>
  if (failed === 'error') {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700" data-testid="rewards-error">
        Couldn’t load the rewards shop.
        <button type="button" onClick={reload} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm" data-testid="rewards-retry">Try again</button>
      </div>
    )
  }
  if (!view) return <div className="h-64 animate-pulse rounded-2xl bg-gray-100" role="status" aria-label="Loading the rewards shop" />

  const left = Math.max(0, view.monthlyLimit - view.monthlyUsed)
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="rewards-balance">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{childName ? `${childName}’s points` : 'Your points'}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{view.balance}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="rewards-monthly">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">This month</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{view.monthlyUsed} of {view.monthlyLimit} points used</p>
          <p className="text-xs text-gray-500">{left} points left to spend this month</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next delivery</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{view.run.label}</p>
          <p className="text-xs text-gray-500">Orders close on {fmtDate(view.run.cutoffAt)}</p>
        </div>
      </section>

      <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" data-testid="rewards-collect-note">
        Collect {childName ? `${childName}’s` : 'your'} items from the school management (school office) once we tell you they have reached school.
      </p>

      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} data-testid="rewards-notice"
          className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {notice.text}
        </p>
      )}

      <section aria-labelledby="rewards-catalog">
        <h2 id="rewards-catalog" className="mb-3 text-lg font-bold text-gray-900">Pick a reward</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {view.items.map(item => (
            <div key={item.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4" data-testid={`rewards-item-${item.id}`}>
              <span className="text-4xl" aria-hidden="true">{item.emoji}</span>
              <p className="mt-2 font-semibold text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-600">{item.pointsCost} points</p>
              <div className="mt-3">
                {confirming === item.id ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => order(item.id)} disabled={busy} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid={`rewards-confirm-${item.id}`}>
                      Use {item.pointsCost} points
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" data-testid={`rewards-confirm-cancel-${item.id}`}>Not now</button>
                  </div>
                ) : item.canOrder ? (
                  <button type="button" onClick={() => setConfirming(item.id)} disabled={busy} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid={`rewards-order-${item.id}`}>Get it</button>
                ) : (
                  <p className="text-xs text-gray-500" data-testid={`rewards-blocked-${item.id}`}>
                    {item.blockedBy === 'points' ? `${item.pointsCost - view.balance} more points needed` : 'This month’s limit is reached'}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="rewards-orders">
        <h2 id="rewards-orders" className="mb-3 text-lg font-bold text-gray-900">{childName ? `${childName}’s orders` : 'My orders'}</h2>
        {view.orders.length === 0 ? (
          <p className="text-sm text-gray-500" data-testid="rewards-no-orders">No orders yet.</p>
        ) : (
          <ul className="space-y-3">
            {view.orders.map(o => {
              const step = STEP_OF[o.status]
              return (
                <li key={o.id} className="rounded-2xl border border-gray-200 bg-white p-4" data-testid={`rewards-order-row-${o.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900"><span aria-hidden="true">{o.emoji} </span>{o.itemName} <span className="font-normal text-gray-500">· {o.pointsCost} points · {o.runLabel}</span></p>
                    {o.canCancel && (
                      <button type="button" onClick={() => cancel(o.id)} disabled={busy} className="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:opacity-50" data-testid={`rewards-cancel-${o.id}`}>Cancel</button>
                    )}
                  </div>
                  {step === undefined ? (
                    <p className="mt-2 text-sm text-gray-500">{o.status === 'cancelled' ? 'Cancelled · points returned' : 'Could not be handed over · points returned'}</p>
                  ) : (
                    <ol className="mt-3 flex flex-wrap gap-1.5 text-xs" aria-label="Order progress">
                      {STEPS.map((label, i) => (
                        <li key={label} className={`rounded-full px-2.5 py-1 ${i <= step ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'} ${i === step ? 'font-semibold' : ''}`} aria-current={i === step ? 'step' : undefined}>{label}</li>
                      ))}
                    </ol>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
