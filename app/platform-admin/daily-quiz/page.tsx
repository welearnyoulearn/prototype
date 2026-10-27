'use client'

import { useCallback, useEffect, useState } from 'react'

// Platform Admin → Daily Quiz (#433): when the quiz runs. One global setting for every school, and an
// optional override per school. Schools never see or change these. Whether a school has the quiz at all is
// the 'daily-quiz' feature (Schools → a school → Features); which subjects are asked is Question Bank → Publish.

type Settings = { seasonStart: string; seasonEnd: string; openTime: string; closeTime: string; grades: number[] }
type Override = { [K in keyof Settings]: Settings[K] | null }
type SchoolRow = { id: number; name: string; override: Override | null }

const ALL_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const EMPTY_OVERRIDE: Override = { seasonStart: null, seasonEnd: null, openTime: null, closeTime: null, grades: null }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error ?? 'Request failed')
  return d as T
}

// <input type="date"> needs a year; the season is month-day only, so a fixed leap year carries it.
const toDateInput = (md: string) => `2000-${md}`
const fromDateInput = (v: string) => v.slice(5)

function describe(s: Settings) {
  const md = (v: string) => new Date(`2000-${v}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const grades = s.grades.length ? `Grades ${s.grades.join(', ')}` : 'No grades'
  return `${md(s.seasonStart)} – ${md(s.seasonEnd)} · ${s.openTime}–${s.closeTime} IST · ${grades}`
}

function SettingsFields({ value, onChange, inherit, testid }: {
  value: Override; onChange: (v: Override) => void; inherit: Settings | null; testid: string
}) {
  // inherit = null: the global form (every field required). Otherwise: a school override (blank = global).
  const field = <K extends keyof Settings>(k: K) => value[k]
  const grades = value.grades ?? inherit?.grades ?? []
  const gradesInherited = inherit !== null && value.grades === null
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-gray-700">Season starts
        <input type="date" data-testid={`${testid}-season-start`} className="mt-1 block w-full rounded-lg border px-3 py-2" value={field('seasonStart') ? toDateInput(field('seasonStart') as string) : ''}
          onChange={e => onChange({ ...value, seasonStart: e.target.value ? fromDateInput(e.target.value) : null })} />
        {inherit && value.seasonStart === null && <span className="text-xs text-gray-500">Using global ({inherit.seasonStart})</span>}
      </label>
      <label className="text-sm font-medium text-gray-700">Season ends
        <input type="date" data-testid={`${testid}-season-end`} className="mt-1 block w-full rounded-lg border px-3 py-2" value={field('seasonEnd') ? toDateInput(field('seasonEnd') as string) : ''}
          onChange={e => onChange({ ...value, seasonEnd: e.target.value ? fromDateInput(e.target.value) : null })} />
        {inherit && value.seasonEnd === null && <span className="text-xs text-gray-500">Using global ({inherit.seasonEnd})</span>}
      </label>
      <label className="text-sm font-medium text-gray-700">Opens at (IST)
        <input type="time" data-testid={`${testid}-open`} className="mt-1 block w-full rounded-lg border px-3 py-2" value={(field('openTime') as string | null) ?? ''}
          onChange={e => onChange({ ...value, openTime: e.target.value || null })} />
        {inherit && value.openTime === null && <span className="text-xs text-gray-500">Using global ({inherit.openTime})</span>}
      </label>
      <label className="text-sm font-medium text-gray-700">Closes at (IST)
        <input type="time" data-testid={`${testid}-close`} className="mt-1 block w-full rounded-lg border px-3 py-2" value={(field('closeTime') as string | null) ?? ''}
          onChange={e => onChange({ ...value, closeTime: e.target.value || null })} />
        {inherit && value.closeTime === null && <span className="text-xs text-gray-500">Using global ({inherit.closeTime})</span>}
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium text-gray-700">Grades that take the quiz {gradesInherited && <span className="text-xs font-normal text-gray-500">(using global)</span>}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_GRADES.map(g => {
            const on = grades.includes(g)
            return (
              <button key={g} type="button" aria-pressed={on} data-testid={`${testid}-grade-${g}`}
                onClick={() => onChange({ ...value, grades: on ? grades.filter(x => x !== g) : [...grades, g].sort((a, b) => a - b) })}
                className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>
                {g}
              </button>
            )
          })}
          {inherit && !gradesInherited && (
            <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => onChange({ ...value, grades: null })}>Use global grades</button>
          )}
        </div>
      </fieldset>
    </div>
  )
}

export default function DailyQuizSettingsPage() {
  const [global, setGlobal] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Override>(EMPTY_OVERRIDE)
  const [schools, setSchools] = useState<SchoolRow[]>([])
  const [editing, setEditing] = useState<{ school: SchoolRow; value: Override } | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await call<{ global: Settings; schools: SchoolRow[] }>('/api/platform/quiz-settings')
      setGlobal(d.global); setDraft(d.global); setSchools(d.schools)
    } catch (e) { setMessage({ kind: 'error', text: (e as Error).message }) }
  }, [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  async function saveGlobal() {
    setSaving(true); setMessage(null)
    try {
      await call('/api/platform/quiz-settings', { method: 'PUT', body: JSON.stringify(draft) })
      setMessage({ kind: 'ok', text: 'Saved. Quizzes already posted keep their own times.' })
      await load()
    } catch (e) { setMessage({ kind: 'error', text: (e as Error).message }) }
    finally { setSaving(false) }
  }

  async function saveSchool(remove: boolean) {
    if (!editing) return
    setSaving(true); setMessage(null)
    try {
      await call(`/api/platform/quiz-settings/schools/${editing.school.id}`, { method: 'PUT', body: JSON.stringify(remove ? null : editing.value) })
      setMessage({ kind: 'ok', text: remove ? `${editing.school.name} now follows the global settings.` : `Saved for ${editing.school.name}.` })
      setEditing(null)
      await load()
    } catch (e) { setMessage({ kind: 'error', text: (e as Error).message }) }
    finally { setSaving(false) }
  }

  const effective = (o: Override | null): Settings | null => global && (o
    ? { seasonStart: o.seasonStart ?? global.seasonStart, seasonEnd: o.seasonEnd ?? global.seasonEnd, openTime: o.openTime ?? global.openTime, closeTime: o.closeTime ?? global.closeTime, grades: o.grades ?? global.grades }
    : global)
  const shown = schools.filter(s => s.name.toLowerCase().includes(filter.trim().toLowerCase()))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Daily Quiz</h1>
        <p className="mt-1 text-sm text-gray-600">
          When the quiz runs for students. Schools can’t see or change this. A school also needs the <strong>Daily Quiz &amp; Leaderboard</strong> feature
          switched on, and only subjects published in Question Bank are asked.
        </p>
      </div>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} data-testid="dq-settings-message"
          className={`rounded-lg px-4 py-2 text-sm ${message.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>
      )}

      <section className="rounded-xl border bg-white p-5" aria-labelledby="dq-global">
        <h2 id="dq-global" className="font-semibold text-gray-900">All schools</h2>
        <p className="mb-4 text-sm text-gray-500">The “not done yet” reminder goes 2 hours before the close; answers show after the close.</p>
        {global ? (
          <>
            <SettingsFields value={draft} onChange={setDraft} inherit={null} testid="dq-global" />
            <button type="button" onClick={saveGlobal} disabled={saving} data-testid="dq-global-save"
              className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Save for all schools</button>
          </>
        ) : <p className="text-sm text-gray-500">Loading…</p>}
      </section>

      <section className="rounded-xl border bg-white p-5" aria-labelledby="dq-schools">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dq-schools" className="font-semibold text-gray-900">Per school</h2>
          <input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a school" aria-label="Find a school"
            className="rounded-lg border px-3 py-1.5 text-sm" data-testid="dq-school-search" />
        </div>
        <ul className="mt-3 divide-y">
          {shown.map(s => {
            const eff = effective(s.override)
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`dq-school-${s.id}`}>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{s.name} {s.override && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Custom</span>}</p>
                  {eff && <p className="text-xs text-gray-500">{describe(eff)}</p>}
                </div>
                <button type="button" onClick={() => setEditing({ school: s, value: s.override ?? EMPTY_OVERRIDE })} data-testid={`dq-school-edit-${s.id}`}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Change</button>
              </li>
            )
          })}
          {shown.length === 0 && <li className="py-3 text-sm text-gray-500">No schools found.</li>}
        </ul>
      </section>

      {editing && global && (
        <div role="dialog" aria-modal="true" aria-labelledby="dq-edit-title" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
            <h2 id="dq-edit-title" className="font-semibold text-gray-900">{editing.school.name}</h2>
            <p className="mb-4 text-sm text-gray-500">Leave a field empty to follow the global setting.</p>
            <SettingsFields value={editing.value} onChange={v => setEditing({ ...editing, value: v })} inherit={global} testid="dq-school" />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {editing.school.override && (
                <button type="button" onClick={() => saveSchool(true)} disabled={saving} data-testid="dq-school-reset" className="mr-auto rounded-lg border px-3 py-2 text-sm">Use global settings</button>
              )}
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border px-3 py-2 text-sm" data-testid="dq-school-cancel">Cancel</button>
              <button type="button" onClick={() => saveSchool(false)} disabled={saving} data-testid="dq-school-save" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
