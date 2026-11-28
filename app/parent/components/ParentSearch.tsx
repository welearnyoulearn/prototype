'use client'

// Student Search (#538), parent side: consent for one child, that child's searches, and deleting them.
import { useCallback, useEffect, useState } from 'react'
import type { SearchFlag } from '@/lib/studentSearch/safety'

type Data = {
  enabled: boolean
  keepDays: number
  aiEnabled: boolean
  consent: { granted: boolean; ai: boolean; decidedAt: string } | null
  searches: { id: number; query: string; flag: SearchFlag | null; at: string; aiOpenedAt: string | null }[]
}

const LABELS: Record<SearchFlag, string> = {
  support: 'May need your support',
  adult: 'Stopped: adult topic',
  danger: 'Stopped: unsafe topic',
  gambling: 'Stopped: gambling',
  personal: 'Stopped: personal details',
}

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ParentSearch({ studentId, studentName }: { studentId: number; studentName: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [problem, setProblem] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [aiConfirmed, setAiConfirmed] = useState(false)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback((signal?: AbortSignal) =>
    fetch(`/api/parent/search?student_id=${studentId}`, { cache: 'no-store', signal })
      .then(async res => {
        if (!res.ok) throw new Error(`Search history returned ${res.status}`)
        setData(await res.json())
        setProblem('')
      })
      .catch(err => {
        if (signal?.aborted) return
        console.error('[parent search]', err)
        setProblem('This couldn’t be loaded. Press Refresh to try again.')
      }), [studentId])
  useEffect(() => {
    const abort = new AbortController()
    void load(abort.signal)
    return () => abort.abort()
  }, [load])

  const change = async (request: () => Promise<Response>) => {
    setBusy(true)
    try {
      const res = await request()
      if (!res.ok) throw new Error(`Change returned ${res.status}`)
      await load()
    } catch (err) {
      console.error('[parent search]', err)
      setProblem('That didn’t work. Please try again.')
    } finally { setBusy(false) }
  }

  const decide = (agree: boolean) => change(() => fetch('/api/parent/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agree ? { student_id: studentId, agree, confirmed: true } : { student_id: studentId, agree }),
  }))

  const decideAi = (ai: boolean) => change(() => fetch('/api/parent/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ai ? { student_id: studentId, ai, confirmed: true } : { student_id: studentId, ai }),
  }))

  const turnOff = () => {
    if (window.confirm(`Turn search off for ${studentName} and delete the saved searches?`)) void decide(false)
  }
  const erase = () => {
    if (window.confirm('Delete all saved searches? This cannot be undone.')) void change(() => fetch(`/api/parent/search?student_id=${studentId}`, { method: 'DELETE' }))
  }

  const on = data?.consent?.granted === true
  const flagged = data?.searches.filter(s => s.flag) ?? []
  const shown = flaggedOnly ? flagged : data?.searches ?? []

  return (
    <div className="max-w-3xl space-y-5" data-testid="parent-search">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-800">Search: {studentName}</h2>
        <button type="button" onClick={() => void load()} className="min-h-10 rounded-lg border bg-white px-4 text-sm" data-testid="parent-search-refresh">Refresh</button>
      </div>
      {problem && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm" role="alert">{problem}</p>}
      {!data && !problem && <p className="text-sm text-gray-600" role="status">Loading…</p>}

      {data && (
        <section className="space-y-3 rounded-xl border bg-white p-4 text-sm">
          <p>Student Search lets {studentName} look up study topics in the school portal. It is optional.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Each search’s words and time are saved for {data.keepDays} days and shown to you here.</li>
            <li>Searches are sent to Google, and some to Wikipedia or its dictionary (Wiktionary), with technical details such as the internet address. Google’s search box can show adverts.</li>
            <li>If the AI Tutor cannot answer a short question, the portal searches for that question, and it is saved and shown here like any search.</li>
            <li>Some searches are stopped by a short English, Telugu and Hindi word list. It does not catch everything, and you get no alerts.</li>
            <li>You can turn it off at any time. Turning it off deletes the saved searches.</li>
          </ul>
          <p className="font-medium" data-testid="parent-search-state">
            {on ? `Turned on (${when(data.consent!.decidedAt)})` : 'Turned off'}
          </p>
          {on ? (
            <button type="button" disabled={busy} onClick={turnOff} className="min-h-10 rounded-lg border border-red-300 px-4 text-red-700" data-testid="parent-search-withdraw">Turn search off</button>
          ) : data.enabled ? (
            <>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" data-testid="parent-search-confirm" />
                <span>I am 18 or older, I am {studentName}’s parent or guardian, and I have read the points above.</span>
              </label>
              <button type="button" disabled={busy || !confirmed} onClick={() => void decide(true)} className="min-h-10 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50" data-testid="parent-search-agree">I agree, turn search on</button>
            </>
          ) : <p>Your school has not turned this feature on.</p>}
        </section>
      )}

      {data && on && (data.aiEnabled || data.consent?.ai) && (
        <section className="space-y-3 rounded-xl border bg-white p-4 text-sm" data-testid="parent-search-ai">
          <h3 className="font-bold">Google AI answer button (separate choice)</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>After a search, {studentName} can tap a button that opens Google’s own website with the same words.</li>
            <li>That is outside the school portal. We cannot check or limit what Google shows, including its AI answer, which can be wrong.</li>
            <li>Google collects data and can show adverts under its own rules.</li>
            <li>You see which searches the button was tapped for. You do not see anything {studentName} does on Google.</li>
          </ul>
          {data.consent?.ai ? (
            <button type="button" disabled={busy} onClick={() => void decideAi(false)} className="min-h-10 rounded-lg border border-red-300 px-4 text-red-700" data-testid="parent-search-ai-withdraw">Turn the button off</button>
          ) : (
            <>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={aiConfirmed} onChange={e => setAiConfirmed(e.target.checked)} className="mt-1" data-testid="parent-search-ai-confirm" />
                <span>I am 18 or older, I am {studentName}’s parent or guardian, and I have read these points about the button.</span>
              </label>
              <button type="button" disabled={busy || !aiConfirmed} onClick={() => void decideAi(true)} className="min-h-10 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50" data-testid="parent-search-ai-agree">I agree, show the button</button>
            </>
          )}
        </section>
      )}

      {data && (data.searches.length > 0 || on) && (
        <section className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} data-testid="parent-search-flagged" />
              Show only searches that need attention ({flagged.length})
            </label>
            <button type="button" disabled={busy || data.searches.length === 0} onClick={erase} className="min-h-10 rounded-lg border border-red-300 px-4 text-sm text-red-700 disabled:opacity-50" data-testid="parent-search-delete">Delete history</button>
          </div>
          {shown.length === 0 ? <p className="mt-3 text-sm text-gray-600">{flaggedOnly ? 'Nothing needs attention.' : 'No searches yet.'}</p> : (
            <ul className="mt-3 divide-y" data-testid="parent-search-list">
              {shown.map(s => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-3 py-2 text-sm">
                  <time dateTime={s.at} className="text-xs text-gray-600">{when(s.at)}</time>
                  <span className="min-w-0 flex-1 break-words">{s.query}</span>
                  {s.aiOpenedAt && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs" data-testid="parent-search-ai-opened">Opened Google AI answer · {when(s.aiOpenedAt)}</span>}
                  {s.flag && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs">{LABELS[s.flag]}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
