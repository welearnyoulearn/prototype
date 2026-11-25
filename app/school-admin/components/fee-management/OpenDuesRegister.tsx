'use client'

import { useCallback, useEffect, useState } from 'react'
import { fmt, plural } from './format'

type Row = {
  id: number; academic_year: string; student_id: number; student_name: string; grade: string; section: string
  amount_at_close: number; balance_now: number; resolved: boolean; carry_to: string | null
  owner_user_id: number | null; owner_name: string | null
  promised_date: string | null; deadline: string | null; note: string | null
  age_days: number; days_to_deadline: number | null; overdue: boolean
  last_collected_by: string | null; last_collected_on: string | null; last_collected_amount: number | null
}
const collectedLabel = (r: Row) => r.last_collected_on
  ? `Last collected ${fmt(r.last_collected_amount ?? 0)} on ${r.last_collected_on}${r.last_collected_by ? ` by ${r.last_collected_by}` : ''}`
  : 'Nothing collected yet'

type Staff = { id: number; name: string; role: string }
type Payload = { rows: Row[]; staff: Staff[]; summary: { open: number; overdue: number; total: number } }

// Students left on "Leave Open" when a year was closed. Each has an owner, a promised date, a note and a
// deadline; the amount is what is still owed now, so a row disappears once it is paid, carried or written off.
// compact = read-only summary for the Overview; otherwise the full, editable register, where the money can
// also be collected or waived (on the Collect tab), carried forward or written off.
export default function OpenDuesRegister({ schoolId, compact = false, onManage, onCollect, onChanged, version = 0 }: {
  schoolId: number; compact?: boolean; onManage?: () => void
  onCollect?: (academicYear: string) => void; onChanged?: () => void; version?: number
}) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [draft, setDraft] = useState<Record<number, { owner?: string; promised?: string; note?: string }>>({})
  const [action, setAction] = useState<{ row: Row; kind: 'carry' | 'writeoff' } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/fees/open-dues?school_id=${schoolId}`)
      if (r.ok) { setData(await r.json()); setError('') } else setError('Could not load the open-dues register')
    } catch { setError('Network error — the open-dues register could not be loaded') }
  }, [schoolId])
  useEffect(() => { load() }, [load, version])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!data || data.rows.length === 0) return null

  async function save(row: Row) {
    const d = draft[row.id]
    if (!d) return
    setSaving(row.id); setMsg('')
    const body: Record<string, unknown> = { school_id: schoolId, id: row.id }
    if (d.owner !== undefined) body.owner_user_id = d.owner ? Number(d.owner) : null
    if (d.promised !== undefined) body.promised_date = d.promised || null
    if (d.note !== undefined) body.note = d.note
    const r = await fetch('/api/fees/open-dues', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setDraft(p => { const n = { ...p }; delete n[row.id]; return n }); setMsg('✓ Saved'); await load() }
    else setMsg(j.error || 'Could not save')
    setSaving(null)
  }

  async function post(url: string, body: object) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { ok: r.ok, json: await r.json().catch(() => ({})) }
  }

  async function resolve() {
    if (!action) return
    const { row, kind } = action
    if (kind === 'writeoff' && reason.trim().length < 3) { setMsg('Say why this amount is being written off'); return }
    setBusy(true); setMsg('')
    try {
      const applied = await post('/api/fees/year-end', {
        action: 'apply', school_id: schoolId, from_year: row.academic_year, to_year: row.carry_to ?? undefined,
        decisions: [{ student_id: row.student_id, decision: kind, reason: reason.trim() || undefined }],
      })
      if (applied.ok) {
        setMsg(kind === 'carry' ? `✓ ${fmt(row.balance_now)} carried to ${row.carry_to}` : `✓ ${fmt(row.balance_now)} written off`)
        setAction(null)
      } else if (applied.json.needs_approval) {
        const asked = await post('/api/fees/year-end/writeoff-requests', {
          school_id: schoolId, academic_year: row.academic_year, items: [{ student_id: row.student_id, reason: reason.trim() }],
        })
        if (!asked.ok) { setMsg(asked.json.error || 'Could not send the write-off for sign-off'); return }
        setMsg(`✓ Sent for sign-off. Once it is approved (Year-End, ${row.academic_year}), choose Write off again.`)
        setAction(null)
      } else { setMsg(applied.json.error || 'Could not save'); return }
      await load()
      onChanged?.()
    } catch { setMsg('Network error — nothing may have been saved. Check the register and try again.') }
    finally { setBusy(false) }
  }

  const deadlineLabel = (r: Row) => r.days_to_deadline == null ? '—'
    : r.days_to_deadline < 0 ? `${plural(-r.days_to_deadline, 'day')} overdue`
    : r.days_to_deadline === 0 ? 'due today' : `${plural(r.days_to_deadline, 'day')} left`

  const { summary } = data
  const header = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p data-testid="open-dues-title" className="text-sm font-semibold text-gray-800">
          Dues left open at year-end — {plural(summary.open, 'student')} · {fmt(summary.total)}
          {summary.overdue > 0 && <span className="ml-2 text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{summary.overdue} past deadline</span>}
        </p>
        <p className="text-xs text-gray-500">These are not in the current year&apos;s totals. Each needs an owner and a date to resolve it.</p>
      </div>
      {compact && onManage && (
        <button data-testid="open-dues-manage" onClick={onManage} className="text-xs text-blue-600 hover:text-blue-800">Manage in Year-End →</button>
      )}
    </div>
  )

  if (compact) {
    return (
      <div data-testid="open-dues-register" className="bg-white rounded-xl border border-amber-200 p-5 space-y-3">
        {header}
        <div className="divide-y divide-gray-50">
          {data.rows.slice(0, 5).map(r => (
            <div key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">{r.student_name} <span className="text-xs text-gray-400">{r.academic_year}</span></p>
                <p className="text-xs text-gray-400">{r.owner_name ? `Owner: ${r.owner_name}` : 'No owner yet'} · open {plural(r.age_days, 'day')}</p>
                <p className="text-xs text-gray-400" data-testid={`open-dues-collected-${r.student_id}`}>{collectedLabel(r)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-red-600">{fmt(r.balance_now)}</p>
                <p className={`text-[10px] ${r.overdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{deadlineLabel(r)}</p>
              </div>
            </div>
          ))}
        </div>
        {data.rows.length > 5 && <p className="text-xs text-gray-400">+ {data.rows.length - 5} more</p>}
      </div>
    )
  }

  return (
    <div data-testid="open-dues-register" className="bg-white rounded-xl border border-amber-200 p-5 space-y-3">
      {header}
      {msg && <p data-testid="open-dues-message" className={`text-sm font-medium ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
      {action && (
        <div data-testid="open-dues-confirm" className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex flex-wrap items-center gap-3 text-sm text-amber-900">
          <span>
            {action.kind === 'carry'
              ? <>Carry <b>{fmt(action.row.balance_now)}</b> owed by <b>{action.row.student_name}</b> from {action.row.academic_year} to <b>{action.row.carry_to}</b>?</>
              : <>Write off <b>{fmt(action.row.balance_now)}</b> owed by <b>{action.row.student_name}</b> for {action.row.academic_year}? It will no longer be collected.</>}
          </span>
          {action.kind === 'writeoff' && (
            <input data-testid="open-dues-reason" type="text" maxLength={500} value={reason} onChange={e => { setReason(e.target.value); setMsg('') }}
              placeholder="Reason (required)" aria-label="Reason for write-off" className="text-xs border border-amber-300 rounded-lg px-2 py-1.5 w-56 bg-white" />
          )}
          <button data-testid="open-dues-confirm-yes" disabled={busy} onClick={resolve}
            className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
            {busy ? 'Saving…' : action.kind === 'carry' ? 'Carry forward' : 'Write off'}
          </button>
          <button data-testid="open-dues-confirm-no" disabled={busy} onClick={() => setAction(null)}
            className="text-xs border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded-lg font-medium">Cancel</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100 text-left">
              <th className="py-2 pr-3 font-semibold">Student</th>
              <th className="py-2 pr-3 font-semibold text-right">Owes now</th>
              <th className="py-2 pr-3 font-semibold">Open for</th>
              <th className="py-2 pr-3 font-semibold">Deadline</th>
              <th className="py-2 pr-3 font-semibold">Owner</th>
              <th className="py-2 pr-3 font-semibold">Promised by</th>
              <th className="py-2 pr-3 font-semibold">Note</th>
              <th className="py-2 font-semibold">Resolve</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => {
              const d = draft[r.id] ?? {}
              const dirty = !!draft[r.id]
              const set = (patch: { owner?: string; promised?: string; note?: string }) => setDraft(p => ({ ...p, [r.id]: { ...p[r.id], ...patch } }))
              return (
                <tr key={r.id} data-testid={`open-dues-row-${r.student_id}`} className="border-b border-gray-50 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-gray-800">{r.student_name}</p>
                    <p className="text-xs text-gray-400">Gr.{r.grade}{r.section} · {r.academic_year}</p>
                    <p className="text-[10px] text-gray-400" data-testid={`open-dues-collected-${r.student_id}`}>{collectedLabel(r)}</p>
                  </td>
                  <td className="py-2 pr-3 text-right font-bold text-red-600 whitespace-nowrap">{fmt(r.balance_now)}</td>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{plural(r.age_days, 'day')}</td>
                  <td className={`py-2 pr-3 whitespace-nowrap ${r.overdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{r.deadline ?? '—'}<span className="block text-[10px] font-normal">{deadlineLabel(r)}</span></td>
                  <td className="py-2 pr-3">
                    <select data-testid={`open-dues-owner-${r.student_id}`} value={d.owner ?? (r.owner_user_id ? String(r.owner_user_id) : '')} onChange={e => set({ owner: e.target.value })}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white max-w-[9rem]">
                      <option value="">— none —</option>
                      {data.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input data-testid={`open-dues-date-${r.student_id}`} type="date" value={d.promised ?? r.promised_date ?? ''} onChange={e => set({ promised: e.target.value })}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1" />
                  </td>
                  <td className="py-2 pr-3">
                    <input data-testid={`open-dues-note-${r.student_id}`} type="text" maxLength={500} value={d.note ?? r.note ?? ''} onChange={e => set({ note: e.target.value })}
                      placeholder="What was agreed…" className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-44" />
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1.5 min-w-[14rem] mb-1.5">
                      {onCollect && (
                        <button data-testid={`open-dues-collect-${r.student_id}`} onClick={() => onCollect(r.academic_year)}
                          className="text-xs border border-blue-300 text-blue-700 px-2 py-1 rounded-lg font-medium hover:bg-blue-50">Collect / waive</button>
                      )}
                      {r.carry_to && (
                        <button data-testid={`open-dues-carry-${r.student_id}`} onClick={() => { setAction({ row: r, kind: 'carry' }); setReason(''); setMsg('') }}
                          className="text-xs border border-gray-300 text-gray-700 px-2 py-1 rounded-lg font-medium hover:bg-gray-50">Carry forward</button>
                      )}
                      <button data-testid={`open-dues-writeoff-${r.student_id}`} onClick={() => { setAction({ row: r, kind: 'writeoff' }); setReason(''); setMsg('') }}
                        className="text-xs border border-red-300 text-red-600 px-2 py-1 rounded-lg font-medium hover:bg-red-50">Write off</button>
                    </div>
                    {dirty && (
                      <button data-testid={`open-dues-save-${r.student_id}`} disabled={saving === r.id} onClick={() => save(r)}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">{saving === r.id ? 'Saving…' : 'Save'}</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
