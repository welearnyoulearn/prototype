'use client'

import { useState } from 'react'
import { fmt } from './format'

export type AmendRequest = {
  catName: string
  changes: { grade: string; label: string; from: number; to: number }[]
}

// Locked fee plans can't be edited directly: each changed grade is amended through
// /api/fees/structures/amend with a reason, which is recorded against the structure and
// every bill it revises. The caller does the requests; this only collects the reason.
export default function AmendFeeDialog({ request, onCancel, onConfirm }: {
  request: AmendRequest
  onCancel: () => void
  onConfirm: (reason: string) => Promise<string | null>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!reason.trim()) { setError('A reason is required for an amendment'); return }
    setBusy(true); setError('')
    const err = await onConfirm(reason.trim())
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-amber-700">Amend locked fee plan — {request.catName}</p>
          <button onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <ul className="text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 space-y-1">
            {request.changes.map(c => (
              <li key={c.grade}>{c.label}: {fmt(c.from)} → <strong>{fmt(c.to)}</strong></li>
            ))}
          </ul>
          <p className="text-sm text-gray-500">
            {request.changes.length} amount{request.changes.length === 1 ? '' : 's'} will change and every existing bill for {request.changes.length === 1 ? 'it' : 'them'} is updated, with an audit entry.
            Recorded payments and waivers are kept; a reduction below what is already paid or waived is rejected.
          </p>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide" htmlFor="amend-reason">Reason (required)</label>
            <input id="amend-reason" data-testid="input-amend-reason" type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Board approved fee revision"
              className="w-full mt-1.5 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">← Cancel</button>
          <button data-testid="btn-confirm-amend" onClick={submit} disabled={busy || !reason.trim()}
            className="text-sm bg-amber-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
            {busy ? 'Amending…' : 'Amend and update bills'}
          </button>
        </div>
      </div>
    </div>
  )
}
