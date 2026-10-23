'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/use-confirm'
import { overLimitMessage } from '@/lib/planChangeMessage'
import { addYears, renewedEnd, type PlanStatus } from '@/lib/planExpiry'
import { PLAN_STATUS_STYLE, planStatusLabel } from '@/lib/planStatusUi'

// Platform Admin → Renewals: the queue of schools that asked to renew. Contact the school, then
// apply the next plan and end date right here; applying it closes the request and records what
// was agreed.

type Req = {
  id: number; school_id: number; status: 'open' | 'contacted' | 'renewed' | 'dismissed'
  note: string | null; created_at: string; handled_at: string | null; handled_by_email: string | null
  requested_by_name: string | null; requested_by_email: string | null
  school_name: string; school_code: string | null; city: string | null; school_phone: string | null; school_email: string | null
  tier: string; plan_end_date: string | null; plan_status: PlanStatus; days_left: number | null
  next_tier: string | null; next_end_date: string | null
}
type Tab = 'active' | 'renewed' | 'dismissed' | 'all'
const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Waiting' }, { key: 'renewed', label: 'Renewed' }, { key: 'dismissed', label: 'Dismissed' }, { key: 'all', label: 'All' },
]
const TIERS = [{ key: 'basic', label: 'Basic' }, { key: 'standard', label: 'Standard' }, { key: 'premium', label: 'Premium' }]
const STATUS_BADGE: Record<Req['status'], string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200', contacted: 'bg-blue-50 text-blue-700 border-blue-200',
  renewed: 'bg-green-50 text-green-700 border-green-200', dismissed: 'bg-gray-100 text-gray-600 border-gray-200',
}
const STATUS_TEXT: Record<Req['status'], string> = { open: 'New', contacted: 'Contacted', renewed: 'Renewed', dismissed: 'Dismissed' }
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function RenewalsPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const [tab, setTab] = useState<Tab>('active')
  const [reqs, setReqs] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [form, setForm] = useState<{ id: number; tier: string; end: string } | null>(null)
  const [notes, setNotes] = useState<Record<number, string>>({})

  const load = useCallback(async (t: Tab) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/platform/renewals?status=${t}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setReqs(d.requests)
      setNotes(Object.fromEntries((d.requests as Req[]).map(r => [r.id, r.note ?? ''])))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load requests') }
    finally { setLoading(false) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(tab) }, [tab, load])

  async function patch(r: Req, body: { status?: string; note?: string }, done: string) {
    setBusy(r.id); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/platform/renewals/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Update failed')
      setNotice(done)
      await load(tab)
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed') }
    finally { setBusy(null) }
  }

  function openForm(r: Req) {
    const tier = r.tier === 'none' ? 'basic' : r.tier
    setForm({ id: r.id, tier, end: renewedEnd(r.plan_end_date, today()) })
  }

  async function apply(r: Req) {
    if (!form) return
    setBusy(r.id); setError(''); setNotice('')
    try {
      const send = (confirmOver: boolean) => fetch(`/api/schools/${r.school_id}/subscription`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: form.tier, plan_end_date: form.end, confirm_over_limit: confirmOver || undefined }),
      })
      let res = await send(false)
      let d = await res.json().catch(() => ({}))
      if (res.status === 409 && d.code === 'OVER_SEAT_LIMIT') {
        const ok = await confirm(overLimitMessage(d), { title: 'This leaves the school over its staff limit', confirmText: 'Apply anyway', destructive: true })
        if (!ok) return
        res = await send(true)
        d = await res.json().catch(() => ({}))
      }
      if (!res.ok) throw new Error(d.error ?? 'Could not apply the plan')
      setNotice(`${r.school_name}: ${form.tier} plan applied until ${d.plan_end_date ?? form.end}. The school has full access again.`)
      setForm(null)
      await load(tab)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not apply the plan') }
    finally { setBusy(null) }
  }

  const waiting = reqs.filter(r => r.status === 'open' || r.status === 'contacted').length

  return (
    <div className="p-6 max-w-5xl">
      {ConfirmDialog}
      <h1 className="text-xl font-bold text-gray-900">Renewals</h1>
      <p className="text-sm text-gray-500 mt-1">Schools that asked to renew. Contact them, then set the next plan and end date here — applying it gives the school full access again.</p>

      <div className="flex gap-2 mt-5" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} data-testid={`renewals-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm border ${tab === t.key ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {t.label}{t.key === 'active' && tab === 'active' && waiting > 0 ? ` (${waiting})` : ''}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert" data-testid="renewals-error">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2" data-testid="renewals-notice">{notice}</p>}

      {loading ? <p className="mt-6 text-sm text-gray-500">Loading…</p>
        : reqs.length === 0 ? <p className="mt-6 text-sm text-gray-500" data-testid="renewals-empty">{tab === 'active' ? 'No schools are waiting for a renewal.' : 'Nothing here.'}</p>
        : (
          <ul className="mt-5 space-y-4">
            {reqs.map(r => {
              const waitingReq = r.status === 'open' || r.status === 'contacted'
              return (
                <li key={r.id} data-testid={`renewal-${r.id}`} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/platform-admin/schools/${r.school_id}`} className="font-semibold text-gray-900 hover:text-purple-700">{r.school_name}</Link>
                      <span className="text-xs text-gray-500 ml-2">{r.school_code}{r.city ? ` · ${r.city}` : ''}</span>
                      <p className="text-xs text-gray-500 mt-1">Requested {when(r.created_at)} by {r.requested_by_name || 'the administrator'}{r.requested_by_email ? ` <${r.requested_by_email}>` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[r.status]}`} data-testid={`renewal-status-${r.id}`}>{STATUS_TEXT[r.status]}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-3 text-sm text-gray-700">
                    <span>Plan: <strong className="capitalize">{r.tier === 'none' ? 'No plan' : r.tier}</strong></span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${PLAN_STATUS_STYLE[r.plan_status]}`}>
                      {planStatusLabel(r.plan_status, r.days_left, null, r.plan_end_date) || 'No plan'}
                    </span>
                    {r.school_phone && <span>Phone: <a className="text-purple-700" href={`tel:${r.school_phone}`}>{r.school_phone}</a></span>}
                    {(r.requested_by_email || r.school_email) && <span>Email: <a className="text-purple-700" href={`mailto:${r.requested_by_email || r.school_email}`}>{r.requested_by_email || r.school_email}</a></span>}
                  </div>

                  {r.status === 'renewed' && (
                    <p className="text-sm text-green-700 mt-3" data-testid={`renewal-agreed-${r.id}`}>
                      Renewed: <strong className="capitalize">{r.next_tier}</strong> plan until <strong>{r.next_end_date ?? 'no end date'}</strong>
                      {r.handled_by_email ? ` · by ${r.handled_by_email}` : ''}{r.handled_at ? ` · ${when(r.handled_at)}` : ''}
                    </p>
                  )}

                  <div className="mt-3">
                    <textarea data-testid={`renewal-note-${r.id}`} value={notes[r.id] ?? ''} placeholder="Notes about the conversation (price agreed, follow-up date…)"
                      onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} rows={2} maxLength={2000}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    {(notes[r.id] ?? '') !== (r.note ?? '') && (
                      <button data-testid={`renewal-save-note-${r.id}`} disabled={busy === r.id} onClick={() => patch(r, { note: notes[r.id] ?? '' }, 'Note saved.')}
                        className="mt-1 text-xs text-purple-700 underline disabled:opacity-60">Save note</button>
                    )}
                  </div>

                  {waitingReq && form?.id !== r.id && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      <button data-testid={`renewal-renew-${r.id}`} onClick={() => openForm(r)} disabled={busy === r.id}
                        className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">Set next plan…</button>
                      {r.status === 'open' && (
                        <button data-testid={`renewal-contacted-${r.id}`} onClick={() => patch(r, { status: 'contacted' }, 'Marked as contacted.')} disabled={busy === r.id}
                          className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60">Mark contacted</button>
                      )}
                      <button data-testid={`renewal-dismiss-${r.id}`} onClick={() => patch(r, { status: 'dismissed' }, 'Request dismissed.')} disabled={busy === r.id}
                        className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60">Dismiss</button>
                    </div>
                  )}
                  {r.status === 'dismissed' && (
                    <button data-testid={`renewal-reopen-${r.id}`} onClick={() => patch(r, { status: 'open' }, 'Request reopened.')} disabled={busy === r.id}
                      className="mt-4 px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60">Reopen</button>
                  )}

                  {form?.id === r.id && (
                    <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50/40 p-4" data-testid={`renewal-form-${r.id}`}>
                      <p className="text-sm font-semibold text-gray-800">Next plan for {r.school_name}</p>
                      <div className="flex flex-wrap items-end gap-4 mt-3">
                        <label className="text-xs text-gray-600">Plan
                          <select data-testid="renewal-form-tier" value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value })}
                            className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                            {TIERS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-gray-600">New end date
                          <input data-testid="renewal-form-end" type="date" value={form.end} min={today()} onChange={e => setForm({ ...form, end: e.target.value })}
                            className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
                        </label>
                        {[{ l: '1 year', y: 1 }, { l: '2 years', y: 2 }].map(o => (
                          <button key={o.y} type="button" onClick={() => setForm({ ...form, end: addYears(renewedEnd(r.plan_end_date, today()), o.y - 1) })}
                            className="px-3 py-2 rounded-lg text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">{o.l}</button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Applying starts the plan today and runs it to the end date. The school gets full access again straight away.</p>
                      <div className="flex gap-2 mt-3">
                        <button data-testid="renewal-form-apply" onClick={() => apply(r)} disabled={busy === r.id || !form.end}
                          className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">{busy === r.id ? 'Applying…' : 'Apply plan'}</button>
                        <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">Cancel</button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}
