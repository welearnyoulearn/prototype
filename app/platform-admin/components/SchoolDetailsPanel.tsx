'use client'

import { useCallback, useEffect, useState } from 'react'
import SchoolDetailsFields, { fromSaved, sectionProblem, toInput, type DetailsForm, type Section } from '@/components/school/SchoolDetailsFields'
import type { Checklist } from '@/lib/setupChecklist'

// Platform Admin → a school → "School details": everything collected at onboarding (DOCS/SCHOOL-ONBOARDING.md),
// editable here — needed for older schools that were added before these fields existed (the invoice's GST
// split needs the State). Also shows the setup checklist progress.
const ALL: Section[] = ['school', 'tax', 'profile', 'contacts', 'size', 'needs']
type Data = { details: Parameters<typeof fromSaved>[0]; checklist: Checklist }

export default function SchoolDetailsPanel({ schoolId }: { schoolId: number }) {
  const [data, setData] = useState<Data | null>(null)
  const [form, setForm] = useState<DetailsForm | null>(null)
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([])
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const r = await fetch(`/api/platform/schools/${schoolId}/details`, { cache: 'no-store' })
    if (r.ok) { const d = await r.json() as Data; setData(d); setForm(fromSaved(d.details)) }
  }, [schoolId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load()
    fetch('/api/platform/admins', { cache: 'no-store' }).then(r => r.ok ? r.json() : [])
      .then((a: { id: number; full_name: string | null; email: string }[]) => setOwners(Array.isArray(a) ? a.map(x => ({ id: x.id, name: x.full_name || x.email })) : [])).catch(() => {})
  }, [load])

  async function save() {
    if (!form) return
    const p = sectionProblem(form, ALL)
    if (p) return setMsg({ text: p, error: true })
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/platform/schools/${schoolId}/details`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toInput(form)) })
      const d = await r.json().catch(() => ({})) as { error?: string }
      if (!r.ok) throw new Error(d.error ?? 'Could not save')
      setMsg({ text: 'Saved. New bills use these details; bills already made never change.', error: false })
      setEditing(false); void load()
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not save', error: true }) }
    finally { setBusy(false) }
  }

  if (!data || !form) return null
  const missingState = !data.details.stateCode
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4" data-testid="school-details-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900">School details</h2>
        {!editing && <button data-testid="school-details-edit" onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-700 hover:bg-gray-50">Edit</button>}
      </div>
      {missingState && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="school-details-missing-state">
        State not set: invoices show one “GST 18%” line instead of CGST + SGST or IGST. Add the legal name, address, State and PIN.</p>}
      <div className="text-sm" data-testid="school-details-checklist">
        <p className="font-medium text-gray-800">Setup checklist — {data.checklist.done} of {data.checklist.total}</p>
        <ul className="mt-1 grid sm:grid-cols-2 gap-x-4 gap-y-0.5">{data.checklist.items.map(i => <li key={i.key} className={i.done ? 'text-green-700' : 'text-gray-500'}>{i.done ? '✓' : '○'} {i.label}</li>)}</ul>
      </div>
      {editing && <>
        <SchoolDetailsFields value={form} onChange={f => { setForm(f); setMsg(null) }} sections={ALL} owners={owners} />
        <div className="flex gap-2">
          <button data-testid="school-details-save" disabled={busy} onClick={save} className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save details'}</button>
          <button onClick={() => { setEditing(false); setForm(fromSaved(data.details)); setMsg(null) }} className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </>}
      {msg && <p className={`text-sm ${msg.error ? 'text-red-700' : 'text-green-700'}`} role={msg.error ? 'alert' : 'status'} data-testid="school-details-msg">{msg.text}</p>}
    </section>
  )
}
