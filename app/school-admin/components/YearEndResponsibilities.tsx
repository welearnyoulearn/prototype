'use client'

import { useCallback, useEffect, useState } from 'react'

type Staff = { id: number; full_name: string | null; email: string; role: string }
type Settings = { owner_user_id: number | null; approver_user_id: number | null; writeoff_limit: number; leave_open_days: number }

const ROLE_LABELS: Record<string, string> = { school_admin: 'School Admin', principal: 'Principal', vice_principal: 'Vice Principal' }
const who = (s: Staff) => `${s.full_name || s.email} (${ROLE_LABELS[s.role] ?? s.role})`

// Fee year-end responsibilities, kept next to the staff logins they are chosen from.
// Owner = the person who runs year-end. Approver = the second person who signs off write-offs above the
// limit. A school with a single active login has nobody to sign off, so that step simply doesn't exist.
export default function YearEndResponsibilities({ schoolId, canManage }: { schoolId: number; canManage: boolean }) {
  const [staff, setStaff] = useState<Staff[]>([])
  const [form, setForm] = useState({ owner: '', approver: '', limit: '0', days: '30' })
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = useCallback((d: { settings: Settings; staff: Staff[]; approval_required: boolean }) => {
    setStaff(d.staff)
    setApprovalRequired(d.approval_required)
    setForm({
      owner: d.settings.owner_user_id ? String(d.settings.owner_user_id) : '',
      approver: d.settings.approver_user_id ? String(d.settings.approver_user_id) : '',
      limit: String(d.settings.writeoff_limit),
      days: String(d.settings.leave_open_days),
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/fees/year-end/settings?school_id=${schoolId}`)
        if (r.ok && !cancelled) apply(await r.json())
        else if (!cancelled) setMsg({ ok: false, text: 'Could not load the year-end settings' })
      } catch { if (!cancelled) setMsg({ ok: false, text: 'Network error — year-end settings could not be loaded' }) }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [schoolId, apply])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/fees/year-end/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          owner_user_id: form.owner ? Number(form.owner) : null,
          approver_user_id: form.approver ? Number(form.approver) : null,
          writeoff_limit: Number(form.limit || 0),
          leave_open_days: Number(form.days || 30),
        }),
      })
      const d = await r.json()
      if (r.ok) { apply(d); setMsg({ ok: true, text: 'Saved' }) } else setMsg({ ok: false, text: d.error || 'Could not save' })
    } catch { setMsg({ ok: false, text: 'Network error — not saved' }) }
    setSaving(false)
  }

  if (loading) return null
  const single = staff.length < 2
  const approver = staff.find(s => String(s.id) === form.approver)

  return (
    <div data-testid="year-end-responsibilities" className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-gray-800">Fee year-end responsibilities</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Who runs the fee year-end, and who signs off large write-offs. Both are chosen from the staff logins above.
        </p>
      </div>

      {single && (
        <p data-testid="year-end-single-login" className="text-sm bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-3 py-2">
          This school has one active login, so write-offs need no sign-off and year-end works as usual.
          Add a second login (for example the Principal) to switch sign-off on.
        </p>
      )}

      <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm text-gray-700">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Year-end owner</span>
          <select data-testid="year-end-owner" disabled={!canManage || saving} value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white disabled:bg-gray-50">
            <option value="">— not assigned —</option>
            {staff.map(s => <option key={s.id} value={s.id}>{who(s)}</option>)}
          </select>
          <span className="block text-xs text-gray-400 mt-1">Runs the year-end steps and gets the reminders.</span>
        </label>

        <label className="text-sm text-gray-700">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Write-off approver</span>
          <select data-testid="year-end-approver" disabled={!canManage || saving || single} value={form.approver} onChange={e => setForm(f => ({ ...f, approver: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white disabled:bg-gray-50">
            <option value="">— no sign-off —</option>
            {staff.filter(s => String(s.id) !== form.owner).map(s => <option key={s.id} value={s.id}>{who(s)}</option>)}
          </select>
          <span className="block text-xs text-gray-400 mt-1">A different person from the owner.</span>
        </label>

        <label className="text-sm text-gray-700">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Write-off limit (₹)</span>
          <input data-testid="year-end-limit" type="number" min="0" disabled={!canManage || saving} value={form.limit} onChange={e => setForm(f => ({ ...f, limit: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-50" />
          <span className="block text-xs text-gray-400 mt-1">A student&apos;s write-off above this needs sign-off. 0 = every write-off.</span>
        </label>

        <label className="text-sm text-gray-700">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Leave Open deadline (days)</span>
          <input data-testid="year-end-days" type="number" min="1" max="365" disabled={!canManage || saving} value={form.days} onChange={e => setForm(f => ({ ...f, days: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-50" />
          <span className="block text-xs text-gray-400 mt-1">How long a student may stay on Leave Open after the year is closed.</span>
        </label>

        <div className="sm:col-span-2 flex items-center justify-between gap-3 flex-wrap">
          <p data-testid="year-end-signoff-status" className={`text-sm ${approvalRequired ? 'text-green-700' : 'text-gray-500'}`}>
            {approvalRequired && approver
              ? `Sign-off is ON — write-offs above ₹${Number(form.limit || 0).toLocaleString('en-IN')} need ${approver.full_name || approver.email}'s approval.`
              : 'Sign-off is OFF — write-offs are applied without a second approval.'}
          </p>
          <div className="flex items-center gap-3">
            {msg && <span className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</span>}
            {canManage ? (
              <button data-testid="year-end-save" type="submit" disabled={saving}
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            ) : (
              <span className="text-xs text-gray-400">Only a school administrator can change this.</span>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
