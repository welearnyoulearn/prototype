'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw, Undo2, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/use-confirm'

// Platform Admin → Newspaper: what children are reading. Editions are made automatically every night, so there is
// nothing to approve here. The one control is Pull: take a note, or a whole edition, away from students at once
// (and Restore to put it back). Points already paid stay paid.

type Item = { id: number; position: number; category: string; headline: string; note: string; source_name: string | null; source_url: string | null; status: 'active' | 'pulled' }
type Edition = {
  id: number; edition_date: string; grade_band: string; status: 'published' | 'pulled'; source_mode: 'live' | 'bank'
  notified_at: string | null; opened: number; answered: number; items: Item[]
}

const BAND_LABEL: Record<string, string> = { '3-5': 'Junior · grades 3-5', '6-8': 'Middle · grades 6-8', '9-10': 'Senior · grades 9-10' }

async function fetchEditions(): Promise<{ editions: Edition[] } | { error: string }> {
  try {
    const res = await fetch('/api/platform/newspaper', { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    return { editions: (await res.json() as { editions: Edition[] }).editions }
  } catch {
    return { error: 'Could not load the editions.' }
  }
}

export default function PlatformNewspaperPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const [editions, setEditions] = useState<Edition[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [report, setReport] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey(k => k + 1)

  // Load on open and again after any action (reloadKey).
  useEffect(() => {
    let cancelled = false
    void fetchEditions().then(r => {
      if (cancelled) return
      if ('editions' in r) { setEditions(r.editions); setError('') } else setError(r.error)
    })
    return () => { cancelled = true }
  }, [reloadKey])

  async function pull(type: 'item' | 'edition', id: number, restore: boolean, label: string) {
    if (!restore && !await confirm(`Take "${label}" away from students now? Points already paid stay paid.`, { title: 'Pull from students?', confirmText: 'Pull it', destructive: true })) return
    setBusy(`${type}-${id}`)
    try {
      const res = await fetch('/api/platform/newspaper/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id, restore }) })
      if (!res.ok) throw new Error(String(res.status))
      reload()
    } catch {
      setError('That did not work. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  async function buildNow() {
    setBusy('build'); setReport('')
    try {
      const res = await fetch('/api/platform/newspaper', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'build' }) })
      const data = await res.json() as { report?: { built: { band: string; mode: string; notes: number }[]; alreadyThere: string[] }; error?: string }
      if (!res.ok || !data.report) throw new Error(data.error ?? String(res.status))
      const { built, alreadyThere } = data.report
      setReport(built.length === 0 ? 'Today’s editions already exist, so nothing was built.'
        : `Built ${built.map(b => `${b.band} (${b.mode === 'live' ? `${b.notes} notes` : 'fallback'})`).join(', ')}${alreadyThere.length ? `. Already there: ${alreadyThere.join(', ')}` : ''}.`)
      reload()
    } catch (err) {
      setError(`Build failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const days = editions ? [...new Set(editions.map(e => e.edition_date))] : []

  return (
    <div className="min-h-screen bg-gray-50">
      {ConfirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Newspaper</h1>
          <p className="text-sm text-gray-500">Made automatically every night from checked real stories. Pull anything that should not be there.</p>
        </div>
        <Button onClick={buildNow} disabled={busy === 'build'} variant="outline" data-testid="newspaper-build-now">
          <RefreshCw className={busy === 'build' ? 'animate-spin' : ''} aria-hidden="true" />Build today’s editions now
        </Button>
      </div>

      <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {report && <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" data-testid="newspaper-build-report">{report}</p>}
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="newspaper-admin-error">{error}</p>}
        {editions === null && !error && <p className="text-sm text-gray-500">Loading…</p>}
        {editions && editions.length === 0 && <p className="text-sm text-gray-500" data-testid="newspaper-empty">No editions in the last 7 days yet. The first one is made tonight, or build one now.</p>}

        {days.map(day => (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h2 id={`day-${day}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{day}</h2>
            <div className="space-y-4">
              {editions!.filter(e => e.edition_date === day).map(ed => (
                <article key={ed.id} className="rounded-lg border border-gray-200 bg-white" data-testid={`newspaper-edition-${ed.id}`}>
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{BAND_LABEL[ed.grade_band] ?? ed.grade_band}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${ed.source_mode === 'live' ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {ed.source_mode === 'live' ? 'Live stories' : 'Fallback (topic bank)'}
                      </span>
                      {ed.status === 'pulled' && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">Pulled</span>}
                      <span className="text-xs text-gray-500">{ed.opened} opened · {ed.answered} answered</span>
                    </div>
                    <Button size="sm" variant={ed.status === 'pulled' ? 'outline' : 'destructive'} disabled={busy === `edition-${ed.id}`}
                      onClick={() => pull('edition', ed.id, ed.status === 'pulled', `${day} ${BAND_LABEL[ed.grade_band] ?? ed.grade_band}`)} data-testid={`newspaper-pull-edition-${ed.id}`}>
                      {ed.status === 'pulled' ? <><Undo2 aria-hidden="true" />Restore edition</> : <><Ban aria-hidden="true" />Pull edition</>}
                    </Button>
                  </header>
                  <ul className="divide-y divide-gray-100">
                    {ed.items.map(it => (
                      <li key={it.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" data-testid={`newspaper-note-${it.id}`}>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${it.status === 'pulled' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{it.position}. {it.headline} <span className="font-normal text-gray-500">· {it.category}</span></p>
                          <p className="mt-1 text-sm text-gray-600">{it.note}</p>
                          {it.source_name && (
                            <p className="mt-1 text-xs text-gray-500">
                              {it.source_url ? <a href={it.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">{it.source_name}<ExternalLink size={12} aria-hidden="true" /></a> : it.source_name}
                            </p>
                          )}
                        </div>
                        <Button size="sm" variant="outline" disabled={busy === `item-${it.id}`} onClick={() => pull('item', it.id, it.status === 'pulled', it.headline)} data-testid={`newspaper-pull-note-${it.id}`}>
                          {it.status === 'pulled' ? 'Restore' : 'Pull'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
