'use client'

import { useEffect, useState } from 'react'
import { Download, Lock, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/use-confirm'
import type { AdminItem, PlatformOverview } from '@/lib/marketplace/service'

// Platform Admin → Rewards: the WLYL side of the marketplace. Once a month: Close run → buy and pack from the
// shopping list → press Sent per school. Every count here is a count of orders, so nobody has to enter anything.
// Also the catalog: names, points (what families see) and the internal cost (WLYL only).

type Data = PlatformOverview & { items: AdminItem[] }
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
type Draft = { id?: number; name: string; emoji: string; points: string; cost: string; active: boolean; sort: string }
const toDraft = (i: AdminItem): Draft => ({ id: i.id, name: i.name, emoji: i.emoji, points: String(i.pointsCost), cost: String(i.unitCostPaise / 100), active: i.active, sort: String(i.sortOrder) })

export default function PlatformRewardsPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const reload = () => setReloadKey(k => k + 1)

  useEffect(() => {
    let cancelled = false
    fetch('/api/platform/rewards', { cache: 'no-store' })
      .then(async res => {
        if (cancelled) return
        if (!res.ok) throw new Error(String(res.status))
        setData(await res.json() as Data)
      })
      .catch(() => { if (!cancelled) setError('Could not load rewards.') })
    return () => { cancelled = true }
  }, [reloadKey])

  async function call(url: string, body: Record<string, unknown>, key: string): Promise<Record<string, unknown> | null> {
    setBusy(key); setError(''); setNote('')
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({})) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : String(res.status))
      reload()
      return json
    } catch (err) {
      setError((err as Error).message)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function closeRun() {
    if (!data?.openRun) return
    if (!await confirm(`Close the ${data.openRun.label} run? Its ${data.openRun.orders} orders freeze (no more cancelling) and next month’s run opens.`, { title: 'Close this month’s run?', confirmText: 'Close run' })) return
    const r = await call('/api/platform/rewards', { action: 'close_run' }, 'close')
    if (r) setNote('Run closed. Buy and pack from the shopping list below, then press Sent for each school.')
  }

  async function markSent(runId: number, schoolId: number, schoolName: string, placed: number) {
    if (!await confirm(`Mark ${placed} item${placed === 1 ? '' : 's'} for ${schoolName} as sent? The school and the families are told.`, { title: 'Parcel sent?', confirmText: 'Mark sent' })) return
    await call('/api/platform/rewards', { action: 'mark_sent', run_id: runId, school_id: schoolId }, `sent-${runId}-${schoolId}`)
  }

  async function saveDraft() {
    if (!draft) return
    const r = await call('/api/platform/rewards/items', {
      ...(draft.id ? { id: draft.id } : {}), name: draft.name, emoji: draft.emoji, points_cost: Number(draft.points),
      unit_cost_paise: Math.round(Number(draft.cost) * 100), active: draft.active, sort_order: Number(draft.sort) || 0,
    }, 'item')
    if (r) setDraft(null)
  }

  const closedRuns = data ? [...new Set(data.parcels.map(p => p.runId))] : []

  return (
    <div className="min-h-screen bg-gray-50">
      {ConfirmDialog}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900">Rewards</h1>
        <p className="text-sm text-gray-500">Once a month: close the run, buy and pack from the shopping list, press Sent for each school. Families only ever see points.</p>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="rewards-admin-error">{error}</p>}
        {note && <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" data-testid="rewards-admin-note">{note}</p>}
        {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

        {data && (
          <>
            <section className="grid gap-3 sm:grid-cols-5" data-testid="rewards-totals">
              {[
                ['Items sent to schools', String(data.totals.sentToSchools)],
                ['Collected by children', String(data.totals.deliveredToChildren)],
                ['Children reached', String(data.totals.childrenReached)],
                ['Points spent', String(data.totals.pointsSpent)],
                ['Cost of collected items', rupees(data.totals.deliveredCostPaise)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="open-run" data-testid="rewards-open-run">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <h2 id="open-run" className="font-semibold text-gray-900">{data.openRun ? `${data.openRun.label} run (open)` : 'No open run'}</h2>
                  {data.openRun && <p className="text-xs text-gray-500">Orders close on {fmtDate(data.openRun.cutoffAt)} · {data.openRun.orders} items ordered so far</p>}
                </div>
                <div className="flex gap-2">
                  {data.openRun && (
                    <a href={`/api/platform/rewards/export?run_id=${data.openRun.id}`} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm" data-testid="rewards-export-open">
                      <Download className="h-4 w-4" aria-hidden="true" />CSV
                    </a>
                  )}
                  <Button onClick={closeRun} disabled={!data.openRun || busy === 'close'} data-testid="rewards-close-run"><Lock aria-hidden="true" />Close run</Button>
                </div>
              </div>
              {data.openRun && data.openRun.schools.length > 0 ? (
                <div className="grid gap-6 p-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">By school (what each parcel will hold)</h3>
                    <ul className="space-y-2">
                      {data.openRun.schools.map(s => (
                        <li key={s.schoolId} className="text-sm" data-testid={`rewards-open-school-${s.schoolId}`}>
                          <span className="font-medium text-gray-900">{s.schoolName}</span>
                          <span className="text-gray-600"> — {s.items.map(i => `${i.name} ×${i.qty}`).join(' · ')}</span>
                          <span className="text-xs text-gray-400"> ({s.orders} orders)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Shopping list (all schools)</h3>
                    <table className="w-full text-sm" data-testid="rewards-shopping">
                      <tbody>
                        {data.openRun.shopping.map(s => (
                          <tr key={s.name} className="border-b border-gray-100"><td className="py-1">{s.emoji} {s.name}</td><td className="py-1 text-right font-semibold">×{s.qty}</td><td className="py-1 text-right text-gray-500">{rupees(s.costPaise)}</td></tr>
                        ))}
                        <tr><td className="py-1 font-semibold">Total</td><td className="py-1 text-right font-semibold">×{data.openRun.shopping.reduce((n, s) => n + s.qty, 0)}</td><td className="py-1 text-right font-semibold">{rupees(data.openRun.shopping.reduce((n, s) => n + s.costPaise, 0))}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : <p className="p-4 text-sm text-gray-500">No orders in this run yet.</p>}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="parcels" data-testid="rewards-parcels">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <h2 id="parcels" className="font-semibold text-gray-900">Parcels by school (counts are items)</h2>
                <div className="flex flex-wrap gap-2">
                  {closedRuns.slice(0, 3).map(id => (
                    <a key={id} href={`/api/platform/rewards/export?run_id=${id}`} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs">
                      <Download className="h-3 w-3" aria-hidden="true" />{data.parcels.find(p => p.runId === id)?.runLabel} CSV
                    </a>
                  ))}
                </div>
              </div>
              {data.parcels.length === 0 ? <p className="p-4 text-sm text-gray-500">Nothing yet. Parcels appear here once a run is closed.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500">
                      <tr><th className="px-4 py-2">Run</th><th className="px-4 py-2">School</th><th className="px-2 py-2 text-right">Ordered</th><th className="px-2 py-2 text-right">Sent</th><th className="px-2 py-2 text-right">At school</th><th className="px-2 py-2 text-right">Collected</th><th className="px-2 py-2 text-right">Waiting</th><th className="px-2 py-2 text-right">Oldest</th><th className="px-4 py-2" /></tr>
                    </thead>
                    <tbody>
                      {data.parcels.map(p => (
                        <tr key={`${p.runId}-${p.schoolId}`} className="border-t border-gray-100" data-testid={`rewards-parcel-row-${p.runId}-${p.schoolId}`}>
                          <td className="px-4 py-2 text-gray-600">{p.runLabel}</td>
                          <td className="px-4 py-2 font-medium text-gray-900">{p.schoolName}</td>
                          <td className="px-2 py-2 text-right">{p.ordered - p.refunded}</td>
                          <td className="px-2 py-2 text-right">{p.sent}</td>
                          <td className="px-2 py-2 text-right">{p.atSchool}</td>
                          <td className="px-2 py-2 text-right">{p.delivered}</td>
                          <td className="px-2 py-2 text-right">{p.waiting}</td>
                          <td className={`px-2 py-2 text-right ${p.late ? 'font-semibold text-red-600' : 'text-gray-500'}`}>{p.oldestWaitingDays === null ? '—' : `${p.oldestWaitingDays}d`}</td>
                          <td className="px-4 py-2 text-right">
                            {p.placed > 0 && (
                              <Button size="sm" onClick={() => markSent(p.runId, p.schoolId, p.schoolName, p.placed)} disabled={busy === `sent-${p.runId}-${p.schoolId}`} data-testid={`rewards-mark-sent-${p.runId}-${p.schoolId}`}>
                                <Send aria-hidden="true" />Sent ({p.placed})
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="catalog" data-testid="rewards-catalog-admin">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 id="catalog" className="font-semibold text-gray-900">Catalog</h2>
                <Button size="sm" variant="outline" onClick={() => setDraft({ name: '', emoji: '🎁', points: '150', cost: '3', active: true, sort: '100' })} data-testid="rewards-add-item"><Plus aria-hidden="true" />Add item</Button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr><th className="px-4 py-2">Item</th><th className="px-2 py-2 text-right">Points (families see)</th><th className="px-2 py-2 text-right">Cost to WLYL</th><th className="px-2 py-2 text-right">₹ per 100 points</th><th className="px-2 py-2">On</th><th className="px-4 py-2" /></tr>
                </thead>
                <tbody>
                  {data.items.map(i => (
                    <tr key={i.id} className="border-t border-gray-100" data-testid={`rewards-catalog-row-${i.id}`}>
                      <td className="px-4 py-2">{i.emoji} {i.name}</td>
                      <td className="px-2 py-2 text-right">{i.pointsCost}</td>
                      <td className="px-2 py-2 text-right">{rupees(i.unitCostPaise)}</td>
                      <td className="px-2 py-2 text-right text-gray-500">{rupees(Math.round((i.unitCostPaise / i.pointsCost) * 100))}</td>
                      <td className="px-2 py-2">{i.active ? 'Yes' : 'Off'}</td>
                      <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(i))} data-testid={`rewards-edit-${i.id}`}>Edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {draft && (
                <div className="grid gap-3 border-t border-gray-100 p-4 sm:grid-cols-7" data-testid="rewards-item-form">
                  <label className="text-xs text-gray-600 sm:col-span-2">Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" data-testid="rewards-item-name" /></label>
                  <label className="text-xs text-gray-600">Emoji<input value={draft.emoji} onChange={e => setDraft({ ...draft, emoji: e.target.value })} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" data-testid="rewards-item-emoji" /></label>
                  <label className="text-xs text-gray-600">Points<input inputMode="numeric" value={draft.points} onChange={e => setDraft({ ...draft, points: e.target.value })} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" data-testid="rewards-item-points" /></label>
                  <label className="text-xs text-gray-600">Cost ₹<input inputMode="decimal" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" data-testid="rewards-item-cost" /></label>
                  <label className="text-xs text-gray-600">Order<input inputMode="numeric" value={draft.sort} onChange={e => setDraft({ ...draft, sort: e.target.value })} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" data-testid="rewards-item-sort" /></label>
                  <label className="flex items-end gap-2 text-xs text-gray-600"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} data-testid="rewards-item-active" />On sale</label>
                  <div className="flex gap-2 sm:col-span-7">
                    <Button size="sm" onClick={saveDraft} disabled={busy === 'item'} data-testid="rewards-item-save">Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setDraft(null)} data-testid="rewards-item-cancel">Cancel</Button>
                    <p className="self-center text-xs text-gray-500">Changes apply to new orders only. Points can be at most 500 (the monthly limit).</p>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
