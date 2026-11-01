'use client'

import { useEffect, useState } from 'react'
import { Gift, PackageCheck, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/use-confirm'
import type { DeliveryView } from '@/lib/marketplace/service'

// School Admin → Rewards delivery. WLYL sends one parcel a month with the stationery children ordered with their
// points. The school's whole job: tap "Parcel arrived" when it comes (children are told to collect from the school
// office), then tick each child as they collect. Two minutes plus the handing out.

export default function RewardsDelivery() {
  const { confirm, ConfirmDialog } = useConfirm()
  const [view, setView] = useState<DeliveryView | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const reload = () => setReloadKey(k => k + 1)

  useEffect(() => {
    let cancelled = false
    fetch('/api/school/rewards', { cache: 'no-store' })
      .then(async res => {
        if (cancelled) return
        if (!res.ok) throw new Error(String(res.status))
        setView(await res.json() as DeliveryView)
        setError('')
      })
      .catch(() => { if (!cancelled) setError('Could not load rewards delivery.') })
    return () => { cancelled = true }
  }, [reloadKey])

  async function act(body: Record<string, unknown>) {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/school/rewards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? String(res.status))
      setSelected(new Set())
      reload()
    } catch (err) {
      setError(`That did not work: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function cantDeliver(id: number, name: string, item: string) {
    if (!await confirm(`${name}'s ${item} will not be handed over and their points will be returned.`, { title: 'Can’t deliver?', confirmText: 'Return the points', destructive: true })) return
    await act({ action: 'cannot_deliver', order_id: id })
  }

  return (
    <div className="space-y-6">
      {ConfirmDialog}
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Gift className="h-5 w-5" aria-hidden="true" />Rewards delivery</h2>
        <p className="mt-1 text-sm text-gray-500">Children order stationery with their reward points. WLYL sends one parcel a month. When it arrives, tap <b>Parcel arrived</b>; then tick each child as they collect from the school office.</p>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="rewards-delivery-error">{error}</p>}
      {!view && !error && <div className="h-40 animate-pulse rounded-lg bg-gray-100" role="status" aria-label="Loading" />}

      {view && view.parcels.length === 0 && (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500" data-testid="rewards-delivery-empty">No parcels yet. You’ll get a notice when WLYL sends one.</p>
      )}

      {view && view.parcels.map(p => (
        <section key={p.runId} className="rounded-lg border border-gray-200 bg-white p-4" data-testid={`rewards-parcel-${p.runId}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">{p.runLabel} parcel</p>
              <p className="text-sm text-gray-600">{p.counts.map(c => `${c.emoji ?? ''} ${c.name} ×${c.qty}`.trim()).join(' · ')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {p.sent > 0 && <>{p.sent} on the way · </>}{p.atSchool} at school · {p.delivered} collected{p.refunded > 0 && <> · {p.refunded} returned</>}
              </p>
            </div>
            {p.sent > 0 && (
              <Button onClick={() => act({ action: 'arrived', run_id: p.runId })} disabled={busy} data-testid={`rewards-arrived-${p.runId}`}>
                <PackageCheck aria-hidden="true" />Parcel arrived
              </Button>
            )}
          </div>
        </section>
      ))}

      {view && view.classes.length > 0 && (
        <section className="space-y-4" aria-labelledby="rewards-waiting">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="rewards-waiting" className="text-base font-semibold text-gray-900">Waiting to collect</h3>
            <Button onClick={() => act({ action: 'collected', order_ids: [...selected] })} disabled={busy || selected.size === 0} data-testid="rewards-collect-selected">
              Mark {selected.size || ''} collected
            </Button>
          </div>
          {view.classes.map(c => (
            <div key={c.className} className="rounded-lg border border-gray-200 bg-white" data-testid={`rewards-class-${c.className}`}>
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2">
                <p className="font-semibold text-gray-900">Class {c.className}</p>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'collected', order_ids: c.orders.map(o => o.id) })} data-testid={`rewards-class-collected-${c.className}`}>
                  Whole class collected
                </Button>
              </div>
              <ul className="divide-y divide-gray-100">
                {c.orders.map(o => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                    <label className="flex cursor-pointer items-center gap-3 text-sm">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4" data-testid={`rewards-tick-${o.id}`} />
                      <span className="w-12 text-gray-500">{o.roll !== null ? `Roll ${o.roll}` : ''}</span>
                      <span className="font-medium text-gray-900">{o.studentName}</span>
                      <span className="text-gray-600">{o.emoji} {o.itemName}</span>
                      {o.status === 'sent' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">on the way</span>}
                    </label>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => cantDeliver(o.id, o.studentName, o.itemName)} data-testid={`rewards-cant-${o.id}`}>
                      <Undo2 aria-hidden="true" />Can’t deliver
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
