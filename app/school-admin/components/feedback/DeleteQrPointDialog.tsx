'use client'

import { useState } from 'react'
import { AlertTriangle, Archive, CheckCircle2, Download, Info, Pause, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { QR_POINT_KINDS } from '@/lib/feedback-defaults'
import type { QrPoint } from './FeedbackQrPointsTab'
import { downloadFeedbackExcel } from './FolderMaintenance'

const CONFIRM_WORD = 'DELETE'

type SaferOption = 'pause' | 'clear' | 'download'

// Permanent delete of an event/place QR (its Submissions folder). Leads with
// the safer alternatives — Pause (keep everything), Clear folder (Excel copy +
// move reviews to the Archive, keep the QR) and a plain Excel download — then
// lists exactly what goes and needs DELETE typed before the button unlocks.
export default function DeleteQrPointDialog({
  schoolId, point, onClose, onDeleted, onPauseInstead, onClearInstead,
}: {
  schoolId: number
  point: QrPoint
  onClose: () => void
  onDeleted: () => void
  onPauseInstead?: () => void
  onClearInstead?: () => void
}) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState('')
  const [error, setError] = useState('')
  // Which safer option is waiting for confirmation in the pop-up
  const [confirming, setConfirming] = useState<SaferOption | null>(null)
  const kind = QR_POINT_KINDS.find(k => k.key === point.kind)
  const ready = typed.trim().toUpperCase() === CONFIRM_WORD
  const live = point.response_count
  const archived = point.archived_count ?? 0
  const empty = live === 0 && archived === 0

  async function download() {
    setDownloading(true); setError('')
    try {
      // The live folder; archived reviews are in the Archive's own download
      setDownloaded(await downloadFeedbackExcel(schoolId, String(point.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  async function remove() {
    setDeleting(true); setError('')
    try {
      const res = await fetch(`/api/feedback/qr-points/${point.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to delete — please try again')
      }
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete — please try again')
      setDeleting(false)
    }
  }

  const option = 'flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-[#9bb7a4] hover:bg-[#f5f7f3] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <Dialog open onOpenChange={open => !open && !deleting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="feedback-delete-folder-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <AlertTriangle size={20} aria-hidden="true" />Delete this folder?
          </DialogTitle>
        </DialogHeader>

        <p className="-mt-1 line-clamp-2 break-all text-sm font-bold text-gray-900">{kind?.icon} {point.title}</p>

        {/* Safer alternatives */}
        {!empty && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Safer options</p>
            {onPauseInstead && !point.is_active && (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                <Pause size={16} className="shrink-0" aria-hidden="true" />This QR is already paused — nobody can send new feedback through it.
              </div>
            )}
            {onPauseInstead && point.is_active && (
              <button type="button" onClick={() => setConfirming('pause')} disabled={deleting} className={option} data-testid="feedback-delete-alt-pause">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700"><Pause size={16} aria-hidden="true" /></span>
                <span>
                  <span className="block text-sm font-bold text-gray-900">Pause the QR</span>
                  <span className="block text-xs text-gray-500">Stops new feedback. Keeps the folder, all reviews and the QR code — resume any time.</span>
                </span>
              </button>
            )}
            {onClearInstead && live > 0 && (
              <button type="button" onClick={() => setConfirming('clear')} disabled={deleting} className={option} data-testid="feedback-delete-alt-clear">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Archive size={16} aria-hidden="true" /></span>
                <span>
                  <span className="block text-sm font-bold text-gray-900">Clear folder instead</span>
                  <span className="block text-xs text-gray-500">Download an Excel copy, then move the {live} review{live === 1 ? '' : 's'} to the Archive. The QR keeps working.</span>
                </span>
              </button>
            )}
            {live > 0 && (
              <button type="button" onClick={() => setConfirming('download')} disabled={deleting || downloading} className={option} data-testid="feedback-delete-alt-download">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${downloaded ? 'bg-emerald-50 text-emerald-700' : 'bg-[#edf2eb] text-[#245b46]'}`}>
                  {downloaded ? <CheckCircle2 size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-gray-900">{downloading ? 'Preparing…' : downloaded ? 'Copy downloaded' : 'Download a copy first'}</span>
                  <span className="block truncate text-xs text-gray-500">{downloaded || 'Excel with every review, rating, comment and form answer.'}</span>
                </span>
              </button>
            )}
          </div>
        )}

        {/* What goes */}
        {empty ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            📭 This folder has no reviews. Deleting removes only the QR code — <b>printed posters will stop working</b> (&ldquo;form not available&rdquo;).
          </div>
        ) : (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <p className="mb-1.5 font-bold">Deleting permanently removes:</p>
            <ul className="space-y-1 text-[13px]">
              <li>🗂️ <b>{live}</b> review{live === 1 ? '' : 's'} in this folder, with ratings &amp; voice notes</li>
              {archived > 0 && <li>🗄️ <b>{archived}</b> archived review{archived === 1 ? '' : 's'} that came from this folder</li>}
              {point.open_issues > 0 && <li>🚨 <b>{point.open_issues}</b> open issue{point.open_issues === 1 ? '' : 's'} in the Issue Pipeline</li>}
              <li>📍 The QR code — <b>printed posters will stop working</b></li>
            </ul>
            <p className="mt-2 text-xs font-semibold">This cannot be undone.</p>
          </div>
        )}

        <div>
          <label htmlFor="feedback-delete-confirm" className="mb-1.5 block text-xs font-bold text-gray-600">
            Type <span className="rounded bg-gray-100 px-1 font-mono">{CONFIRM_WORD}</span> to confirm
          </label>
          <input
            id="feedback-delete-confirm"
            data-testid="feedback-delete-folder-confirm-input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            autoComplete="off"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
          {!empty && live > 0 && !downloaded && ready && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-700">Tip: you haven&apos;t downloaded a copy — once deleted, these reviews can&apos;t be recovered.</p>
          )}
        </div>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={deleting} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            data-testid="feedback-delete-folder-confirm-btn"
            onClick={remove}
            disabled={!ready || deleting}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={14} aria-hidden="true" />{deleting ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>

        {confirming && (
          <Dialog open onOpenChange={open => { if (!open) setConfirming(null) }}>
            <DialogContent className="sm:max-w-md" data-testid={`feedback-safer-confirm-${confirming}`}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {confirming === 'pause' && <><Pause size={18} className="text-gray-700" aria-hidden="true" />Pause this QR code?</>}
                  {confirming === 'clear' && <><Archive size={18} className="text-amber-700" aria-hidden="true" />Clear this folder instead?</>}
                  {confirming === 'download' && <><Download size={18} className="text-[#245b46]" aria-hidden="true" />Download a copy?</>}
                </DialogTitle>
              </DialogHeader>
              <p className="-mt-1 line-clamp-2 break-all text-sm font-semibold text-gray-700">{kind?.icon} {point.title}</p>

              <div className="rounded-lg border border-gray-200 bg-[#f5f7f3] p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500"><Info size={13} aria-hidden="true" />What will happen</p>
                <ul className="space-y-1.5 text-[13px] text-gray-700">
                  {confirming === 'pause' && <>
                    <li>🚫 New scans of the poster show <b>&ldquo;Feedback for this event is closed&rdquo;</b>.</li>
                    <li>🗂️ All <b>{live}</b> review{live === 1 ? '' : 's'} stay in this folder{archived > 0 ? ` (and ${archived} in the Archive)` : ''}.</li>
                    <li>📊 The Dashboard and Issue Pipeline keep showing them.</li>
                    <li>▶️ Resume any time with the play button on its card in <b>Event &amp; Place QRs</b> — the same printed poster starts working again.</li>
                  </>}
                  {confirming === 'clear' && <>
                    <li>⬇️ You&apos;ll first <b>download an Excel copy</b> — the next step stays locked until you do.</li>
                    <li>🗄️ The <b>{live}</b> review{live === 1 ? '' : 's'} then move to the <b>Archive</b> — they are not deleted.</li>
                    <li>📍 The QR code and folder stay; <b>new feedback keeps arriving</b> here.</li>
                    <li>↩️ Restore them any time from the 🗄️ Archive folder in Submissions.</li>
                  </>}
                  {confirming === 'download' && <>
                    <li>📄 An Excel file with 3 sheets: <b>Feedback</b> (one row per review), <b>Ratings</b> (one row per rating) and <b>Summary</b>.</li>
                    <li>🔐 It includes names and phone numbers of people who didn&apos;t stay anonymous — store it safely.</li>
                    <li>✅ Nothing in the folder is changed or deleted.</li>
                  </>}
                </ul>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirming(null)} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Back</button>
                <button
                  type="button"
                  data-testid="feedback-safer-confirm-btn"
                  disabled={downloading}
                  onClick={async () => {
                    const choice = confirming
                    setConfirming(null)
                    if (choice === 'pause') onPauseInstead?.()
                    else if (choice === 'clear') onClearInstead?.()
                    else await download()
                  }}
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${confirming === 'clear' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#245b46] hover:bg-[#173e2f]'}`}
                >
                  {confirming === 'pause' ? 'Yes, pause QR' : confirming === 'clear' ? 'Continue to Clear folder' : 'Download Excel'}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
