'use client'

import { useState } from 'react'
import { Archive, CheckCircle2, Download, RotateCcw, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFeedbackFetch } from './useFeedbackFetch'

interface Preview { count: number; open_issues: number; oldest: string | null; newest: string | null }

const RANGES: { key: string; label: string }[] = [
  { key: 'all', label: 'All reviews' },
  { key: '30', label: 'Older than 30 days' },
  { key: '90', label: 'Older than 90 days' },
  { key: '180', label: 'Older than 6 months' },
]

function exportUrl(schoolId: number, source: string, olderDays: string) {
  return `/api/feedback/export?school_id=${schoolId}&source=${source}${olderDays !== 'all' ? `&older_than_days=${olderDays}` : ''}`
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// Fetches the Excel export and saves it; resolves with the file name.
export async function downloadFeedbackExcel(schoolId: number, source: string, olderDays = 'all'): Promise<string> {
  const res = await fetch(exportUrl(schoolId, source, olderDays))
  if (!res.ok) throw new Error('Download failed — please try again')
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'feedback.xlsx'
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

async function archiveAction(schoolId: number, action: 'archive' | 'restore' | 'purge', source: string, olderDays = 'all') {
  const res = await fetch('/api/feedback/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ school_id: schoolId, action, source, older_than_days: olderDays === 'all' ? null : Number(olderDays) }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Something went wrong — please try again')
  return json.count as number
}

export function DownloadButton({ schoolId, source }: { schoolId: number; source: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      data-testid="feedback-folder-download-btn"
      disabled={busy}
      onClick={async () => { setBusy(true); try { await downloadFeedbackExcel(schoolId, source) } catch { /* surfaced by the browser */ } finally { setBusy(false) } }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      <Download size={13} aria-hidden="true" />{busy ? 'Preparing…' : 'Download Excel'}
    </button>
  )
}

// Clear folder: 1) download an Excel of what will be cleared (required),
// 2) move those reviews to the Archive. Nothing is deleted here.
export function ClearFolderDialog({
  schoolId, source, folderName, onClose, onDone,
}: {
  schoolId: number
  source: string
  folderName: string
  onClose: () => void
  onDone: (count: number) => void
}) {
  const [range, setRange] = useState('all')
  const [downloadedFor, setDownloadedFor] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState<'download' | 'archive' | null>(null)
  const [error, setError] = useState('')
  const { data: preview, loading } = useFeedbackFetch<Preview>(
    `/api/feedback/archive?school_id=${schoolId}&source=${source}${range !== 'all' ? `&older_than_days=${range}` : ''}`,
    [schoolId, source, range], 'Failed to count reviews'
  )
  const count = preview?.count ?? 0
  const downloaded = downloadedFor === range

  async function download() {
    setBusy('download'); setError('')
    try {
      setFileName(await downloadFeedbackExcel(schoolId, source, range))
      setDownloadedFor(range)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBusy(null)
    }
  }

  async function archive() {
    setBusy('archive'); setError('')
    try {
      onDone(await archiveAction(schoolId, 'archive', source, range))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      setBusy(null)
    }
  }

  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="feedback-clear-folder-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Archive size={20} className="text-[#245b46]" aria-hidden="true" />Clear folder</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 truncate text-sm font-bold text-gray-900" title={folderName}>{folderName}</p>

        <div>
          <span className="mb-1.5 block text-xs font-bold text-gray-600">What should be cleared?</span>
          <div className="grid grid-cols-2 gap-2">
            {RANGES.map(r => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                data-testid={`feedback-clear-range-${r.key}`}
                onClick={() => setRange(r.key)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${range === r.key ? 'border-[#245b46] bg-[#245b46] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-[#9bb7a4]'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500" data-testid="feedback-clear-preview">
            {loading ? 'Counting…' : count === 0 ? 'Nothing to clear for this choice.' : (
              <>
                <b className="text-gray-900">{count}</b> review{count === 1 ? '' : 's'}
                {preview?.oldest && <> · {fmtDate(preview.oldest)} – {fmtDate(preview.newest)}</>}
                {preview && preview.open_issues > 0 && <> · <span className="font-semibold text-rose-700">{preview.open_issues} open issue{preview.open_issues === 1 ? '' : 's'}</span></>}
              </>
            )}
          </p>
        </div>

        {/* Step 1 */}
        <div className={`rounded-xl border p-3 ${downloaded ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">① Download a copy</p>
              <p className="truncate text-xs text-gray-500">
                {downloaded ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 size={12} aria-hidden="true" />Saved {fileName}</span> : 'Excel file with every review, rating, comment and form answer.'}
              </p>
            </div>
            <button
              type="button"
              data-testid="feedback-clear-download-btn"
              onClick={download}
              disabled={count === 0 || !!busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#245b46] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#173e2f] disabled:opacity-40"
            >
              <Download size={13} aria-hidden="true" />{busy === 'download' ? 'Preparing…' : downloaded ? 'Download again' : 'Download Excel'}
            </button>
          </div>
        </div>

        {/* Step 2 */}
        <div className={`rounded-xl border p-3 ${downloaded ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-60'}`}>
          <p className="text-sm font-bold text-gray-900">② Move to Archive</p>
          <p className="mt-0.5 text-xs text-gray-500">
            The reviews leave this folder, the Dashboard and the Issue Pipeline. They are <b>not deleted</b> — open the 🗄️ Archive folder to read, restore or permanently delete them.
          </p>
          <button
            type="button"
            data-testid="feedback-clear-archive-btn"
            onClick={archive}
            disabled={!downloaded || count === 0 || !!busy}
            title={downloaded ? undefined : 'Download the Excel copy first'}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Archive size={13} aria-hidden="true" />{busy === 'archive' ? 'Moving…' : `Move ${count} review${count === 1 ? '' : 's'} to Archive`}
          </button>
          {!downloaded && count > 0 && <p className="mt-1.5 text-[11px] font-semibold text-amber-700">Download the copy first to unlock this step.</p>}
        </div>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={!!busy} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Close</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Buttons shown inside the Archive folder: restore everything, or empty it
// for good (type DELETE). Both report back so the parent can refresh.
export function ArchiveTools({ schoolId, onChanged }: { schoolId: number; onChanged: (message: string) => void }) {
  const [mode, setMode] = useState<'restore' | 'purge' | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { data: preview } = useFeedbackFetch<Preview>(`/api/feedback/archive?school_id=${schoolId}&source=archived`, [schoolId, mode], 'Failed')
  const count = preview?.count ?? 0

  async function run() {
    if (!mode) return
    setBusy(true); setError('')
    try {
      const n = await archiveAction(schoolId, mode, 'archived')
      setMode(null); setTyped('')
      onChanged(mode === 'restore' ? `${n} review${n === 1 ? '' : 's'} restored to their folders` : `${n} archived review${n === 1 ? '' : 's'} permanently deleted`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" data-testid="feedback-archive-restore-btn" onClick={() => setMode('restore')} disabled={count === 0} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40">
        <RotateCcw size={13} aria-hidden="true" />Restore all
      </button>
      <button type="button" data-testid="feedback-archive-purge-btn" onClick={() => setMode('purge')} disabled={count === 0} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40">
        <Trash2 size={13} aria-hidden="true" />Empty archive
      </button>

      {mode && (
        <Dialog open onOpenChange={open => { if (!open && !busy) { setMode(null); setTyped('') } }}>
          <DialogContent className="sm:max-w-md" data-testid="feedback-archive-action-dialog">
            <DialogHeader>
              <DialogTitle className={mode === 'purge' ? 'text-rose-700' : ''}>
                {mode === 'restore' ? '↩ Restore archived reviews?' : '⚠️ Empty the archive?'}
              </DialogTitle>
            </DialogHeader>
            {mode === 'restore' ? (
              <p className="text-sm text-gray-600">All <b>{count}</b> archived review{count === 1 ? '' : 's'} go back to the folders they came from, and show up again on the Dashboard and in the Issue Pipeline.</p>
            ) : (
              <>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  This <b>permanently deletes {count}</b> archived review{count === 1 ? '' : 's'} with their ratings, issues and voice notes. <b>This cannot be undone.</b>
                </div>
                <p className="text-xs text-gray-600">Tip: <button type="button" onClick={() => downloadFeedbackExcel(schoolId, 'archived')} className="font-bold text-[#245b46] hover:underline">download an Excel copy</button> first.</p>
                <div>
                  <label htmlFor="feedback-purge-confirm" className="mb-1.5 block text-xs font-bold text-gray-600">Type <span className="rounded bg-gray-100 px-1 font-mono">DELETE</span> to confirm</label>
                  <input id="feedback-purge-confirm" data-testid="feedback-archive-purge-input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" className="w-full rounded-md border border-gray-200 px-3 py-2 text-base sm:text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200" />
                </div>
              </>
            )}
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setMode(null); setTyped('') }} disabled={busy} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                data-testid="feedback-archive-action-confirm-btn"
                onClick={run}
                disabled={busy || (mode === 'purge' && typed.trim().toUpperCase() !== 'DELETE')}
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40 ${mode === 'purge' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#245b46] hover:bg-[#173e2f]'}`}
              >
                {busy ? 'Working…' : mode === 'restore' ? 'Restore all' : 'Delete forever'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
