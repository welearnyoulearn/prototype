'use client'

import { useEffect, useState } from 'react'
import { SESSION_LABEL, longDate, timeOf, type OverviewClass, type Session, type Sheet } from './types'

// Read-only look-back: pick a class and a past date, see Morning and Afternoon — who marked
// each, and who was absent or late. Any teacher can look; nothing here can change a record.

type Loaded = { key: string; sheets: Partial<Record<Session, Sheet>>; error: string }

export default function HistoryView({ classes, today }: { classes: OverviewClass[]; today: string }) {
  const [classId, setClassId] = useState<number | null>(classes[0]?.id ?? null)
  const [date, setDate] = useState(today)
  const [reload, setReload] = useState(0)
  const key = `${classId}|${date}|${reload}`
  const [loaded, setLoaded] = useState<Loaded>({ key: '', sheets: {}, error: '' })

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    Promise.all((['morning', 'afternoon'] as Session[]).map(async s => {
      const r = await fetch(`/api/attendance?view=sheet&class_id=${classId}&date=${date}&session=${s}`, { cache: 'no-store' })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || 'Could not load attendance')
      return [s, body as Sheet] as const
    }))
      .then(pairs => { if (!cancelled) setLoaded({ key, sheets: Object.fromEntries(pairs), error: '' }) })
      .catch((e: unknown) => { if (!cancelled) setLoaded({ key, sheets: {}, error: e instanceof Error ? e.message : 'Could not load attendance' }) })
    return () => { cancelled = true }
  }, [classId, date, key])

  const loading = loaded.key !== key
  const sheets = loading ? {} : loaded.sheets
  const nw = sheets.morning?.nonWorking ?? null

  return (
    <div className="space-y-4" data-testid="att-history">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 grid sm:grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gray-500">Class
          <select value={classId ?? ''} onChange={e => setClassId(Number(e.target.value))} data-testid="att-history-class"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-normal">
            {classes.map(c => <option key={c.id} value={c.id}>Class {c.grade}-{c.section}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-500">Date
          <input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} data-testid="att-history-date"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-normal" />
        </label>
      </div>

      {classes.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No classes yet.</p>}
      {loaded.error && !loading && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{loaded.error}</span>
          <button type="button" onClick={() => setReload(r => r + 1)} className="text-xs font-semibold border border-red-300 rounded-lg px-3 py-1.5">Try again</button>
        </div>
      )}
      {loading && classId && <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" aria-busy="true" />}

      {!loading && nw && (
        <div data-testid="att-history-holiday" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-sm text-red-800">
          🎉 {longDate(date)} was {nw.kind === 'holiday' ? `a holiday — ${nw.title}` : 'a weekly off'}. No attendance was taken.
        </div>
      )}

      {!loading && !nw && (['morning', 'afternoon'] as Session[]).map(s => {
        const sh = sheets[s]
        if (!sh) return null
        const exceptions = sh.students.filter(x => x.status && x.status !== 'present')
        return (
          <div key={s} className="bg-white border border-gray-200 rounded-2xl p-4" data-testid={`att-history-${s}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-bold text-gray-900">{s === 'morning' ? '🌅' : '🌆'} {SESSION_LABEL[s]}</p>
              {sh.lock
                ? <p className="text-xs text-gray-500">🔒 {sh.lock.byMe ? 'You' : sh.lock.markedBy} · {timeOf(sh.lock.markedAt)}{sh.lock.editedBy ? ` · corrected by ${sh.lock.editedBy}` : ''}</p>
                : <p className="text-xs text-gray-400">Not marked</p>}
            </div>
            {sh.lock && (
              <>
                <p className="text-xs mt-1.5">
                  <span className="text-green-700 font-semibold">Present {sh.counts.present}</span>
                  <span className="text-red-600 font-semibold ml-3">Absent {sh.counts.absent}</span>
                  <span className="text-amber-600 font-semibold ml-3">Late {sh.counts.late}</span>
                </p>
                {exceptions.length === 0
                  ? <p className="text-sm text-green-700 mt-2">Everyone was present.</p>
                  : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {exceptions.map(x => (
                        <li key={x.id} className={`text-xs rounded-full px-2.5 py-1 font-medium ${x.status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {x.name} · {x.status}
                        </li>
                      ))}
                    </ul>
                  )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
