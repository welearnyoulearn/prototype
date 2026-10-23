'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Catalog, CatalogEntry, ExportFormat, FilterDef } from '@/lib/dataExport/types'
import ExportReportCards from './ExportReportCards'
import { BookOpen, CalendarDays, DatabaseBackup, Download, GraduationCap, Megaphone, ReceiptIndianRupee, Search, ShieldCheck, UsersRound, WalletCards } from 'lucide-react'

type LogRow = { id: number; export_key: string; format: string; filters: Record<string, string> | null; row_count: number; by_name: string | null; created_at: string }

const GROUP_ICON: Record<string, typeof UsersRound> = { people: UsersRound, academics: GraduationCap, attendance: CalendarDays, fees: WalletCards, expenses: ReceiptIndianRupee, other: Megaphone, backup: DatabaseBackup }

const monthNow = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)
const todayNow = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const monthStart = () => `${monthNow()}-01`

// Sensible starting values so the common download is one click
function defaultFor(f: FilterDef, catalog: Catalog): string {
  if (f.kind === 'date') return f.key === 'from' ? monthStart() : todayNow()
  if (f.kind === 'month') return monthNow()
  if (f.kind === 'year') return catalog.options.currentYear ?? ''
  if (f.kind === 'select') return f.defaultValue ?? ''
  return ''
}

function fmtWhen(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function FilterField({ exportKey, f, value, onChange, catalog }: { exportKey: string; f: FilterDef; value: string; onChange: (v: string) => void; catalog: Catalog }) {
  const cls = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#245b46]/20 focus:border-[#245b46] bg-white'
  const id = `export-filter-${exportKey}-${f.key}`
  let control: React.ReactNode
  if (f.kind === 'date') control = <input data-testid={id} type="date" className={cls} value={value} onChange={e => onChange(e.target.value)} />
  else if (f.kind === 'month') control = <input data-testid={id} type="month" className={cls} value={value} onChange={e => onChange(e.target.value)} />
  else {
    const opts: Array<{ value: string; label: string }> =
      f.kind === 'class' ? catalog.options.classes
      : f.kind === 'grade' ? catalog.options.grades
      : f.kind === 'exam' ? catalog.options.exams
      : f.kind === 'year' ? catalog.options.years
      : f.kind === 'expenseCategory' ? catalog.options.expenseCategories
      : f.options ?? []
    const blank = f.kind === 'select' ? null : f.required ? { value: '', label: `Choose…` } : { value: '', label: f.kind === 'class' ? 'All classes' : f.kind === 'grade' ? 'All grades' : f.kind === 'year' ? 'All years' : 'All' }
    control = (
      <select data-testid={id} className={cls} value={value} onChange={e => onChange(e.target.value)}>
        {blank && <option value={blank.value}>{blank.label}</option>}
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{f.label}{f.required ? ' *' : ''}</label>
      {control}
    </div>
  )
}

function ExportCard({ e, catalog, schoolId, onDone }: { e: CatalogEntry; catalog: Catalog; schoolId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(e.filters.map(f => [f.key, defaultFor(f, catalog)])))
  const [format, setFormat] = useState<ExportFormat>(e.formats.includes('xlsx') ? 'xlsx' : 'csv')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const backup = e.group === 'backup'

  async function download() {
    setError('')
    for (const f of e.filters) if (f.required && !values[f.key]) { setError(`${f.label} is required`); return }
    setBusy(true)
    try {
      const q = new URLSearchParams({ school_id: String(schoolId), format })
      for (const f of e.filters) if (values[f.key]) q.set(f.key, values[f.key])
      const r = await fetch(`/api/data-export/${e.key}?${q.toString()}`)
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error || 'Could not create this export'); return
      }
      const blob = await r.blob()
      const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? `${e.key}.${format}`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      URL.revokeObjectURL(a.href)
      const rows = r.headers.get('X-Export-Rows')
      toast.success(`${e.label} downloaded${rows ? ` (${rows} rows)` : ''}`)
      onDone()
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid={`export-card-${e.key}`} className={`border-b overflow-hidden ${backup ? 'border-[#9bb7a4] bg-[#edf2eb]' : 'border-gray-200 bg-white'}`}>
      <button data-testid={`export-open-${e.key}`} onClick={() => setOpen(o => !o)} className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50/60">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">{e.label}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{e.description}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {e.formats.map(f => <span key={f} className="text-[10px] font-bold uppercase text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{f === 'xlsx' ? 'Excel' : 'CSV'}</span>)}
            {e.personal && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><ShieldCheck size={12} aria-hidden="true" />Personal data</span>}
          </div>
        </div>
        <span className={`text-gray-300 mt-1 transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-50">
          {e.filters.length > 0 && (
            <div className="grid grid-cols-2 gap-3 pt-3">
              {e.filters.map(f => (
                <FilterField key={f.key} exportKey={e.key} f={f} catalog={catalog} value={values[f.key] ?? ''} onChange={v => setValues(s => ({ ...s, [f.key]: v }))} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            {e.formats.length > 1 && (
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                {e.formats.map(f => (
                  <button key={f} data-testid={`export-format-${e.key}-${f}`} onClick={() => setFormat(f)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold ${format === f ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}>{f === 'xlsx' ? 'Excel' : 'CSV'}</button>
                ))}
              </div>
            )}
            <button data-testid={`export-download-${e.key}`} onClick={download} disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-[#245b46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#173e2f] disabled:opacity-60">
              {busy ? 'Preparing…' : <><Download size={15} aria-hidden="true" />Download</>}
            </button>
          </div>
          {error && <p data-testid={`export-error-${e.key}`} className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

// Export Data: one place to download everything the school has — grouped by what an admin thinks in
// (people, academics, attendance, fees…), only for the modules the school's plan includes.
export default function ExportCenter({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState<'downloads' | 'report-cards' | 'log'>('downloads')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [group, setGroup] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [log, setLog] = useState<LogRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/data-export/catalog?school_id=${schoolId}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load the export list'); return r.json() })
      .then((c: Catalog) => { if (!cancelled) setCatalog(c) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the export list') })
    return () => { cancelled = true }
  }, [schoolId])

  const loadLog = useCallback(async () => {
    try {
      const r = await fetch(`/api/data-export/log?school_id=${schoolId}`)
      setLog(r.ok ? await r.json() : [])
    } catch { setLog([]) }
  }, [schoolId])

  useEffect(() => { if (tab === 'log') loadLog() }, [tab, loadLog])

  const labelOf = useMemo(() => new Map((catalog?.exports ?? []).map(e => [e.key, e.label])), [catalog])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (catalog?.exports ?? []).filter(e => (group === 'all' || e.group === group) && (!q || `${e.label} ${e.description}`.toLowerCase().includes(q)))
  }, [catalog, group, query])

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-gray-900">Export data</h2>
        <p className="text-sm text-gray-400 mt-0.5">Download your school’s records as Excel or CSV. Every download is recorded.</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([['downloads', 'Downloads'], ['report-cards', 'Report cards'], ['log', 'Recent exports']] as const).map(([k, l]) => (
          <button key={k} data-testid={`export-tab-${k}`} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'report-cards' && <ExportReportCards schoolId={schoolId} />}

      {tab === 'log' && (
        <div data-testid="export-log" className="bg-white border-y border-gray-200 overflow-x-auto">
          {log === null ? <p className="p-6 text-sm text-gray-400">Loading…</p> : log.length === 0 ? <p className="p-8 text-sm text-gray-400 text-center">Nothing has been downloaded yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 uppercase bg-gray-50"><th className="px-4 py-2">When</th><th className="px-4 py-2">Export</th><th className="px-4 py-2">By</th><th className="px-4 py-2">Format</th><th className="px-4 py-2 text-right">Rows</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {log.map(l => (
                  <tr key={l.id} data-testid="export-log-row">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtWhen(l.created_at)}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{labelOf.get(l.export_key) ?? (l.export_key === 'full-backup' ? 'Full school backup' : l.export_key)}</td>
                    <td className="px-4 py-2 text-gray-500">{l.by_name ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500 uppercase">{l.format}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{l.row_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'downloads' && (
        <>
          {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
          {!catalog && !error && <p className="text-sm text-gray-400">Loading…</p>}
          {catalog && (
            <>
              <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:flex-wrap sm:items-center">
                <button data-testid="export-group-all" onClick={() => setGroup('all')}
                  className={`min-h-10 border-b-2 px-2 text-sm font-semibold ${group === 'all' ? 'border-[#245b46] text-[#173e2f]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>All</button>
                {catalog.groups.map(g => (
                  <button key={g.key} data-testid={`export-group-${g.key}`} onClick={() => setGroup(g.key)} title={g.description}
                    className={`inline-flex min-h-10 items-center gap-1.5 border-b-2 px-2 text-sm font-semibold ${group === g.key ? 'border-[#245b46] text-[#173e2f]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                    {(() => { const Icon = GROUP_ICON[g.key] ?? BookOpen; return <Icon size={14} aria-hidden="true" /> })()} {g.label}
                  </button>
                ))}
                <label className="relative sm:ml-auto">
                  <span className="sr-only">Search downloads</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input data-testid="export-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search downloads…"
                    className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[#245b46] focus:outline-none focus:ring-2 focus:ring-[#245b46]/20 sm:w-60" />
                </label>
              </div>

              {visible.length === 0 ? <p className="text-sm text-gray-400 py-10 text-center">No downloads match.</p> : (
                <div className="border-t border-gray-200">
                  {visible.map(e => <ExportCard key={e.key} e={e} catalog={catalog} schoolId={schoolId} onDone={() => { if (tab === 'downloads') setLog(null) }} />)}
                </div>
              )}
              <p className="flex items-start gap-2 text-xs leading-relaxed text-gray-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#245b46]" aria-hidden="true" />Exports marked as personal data are for school use only. Keep downloaded files safe and delete them when no longer needed.</p>
            </>
          )}
        </>
      )}
    </div>
  )
}
