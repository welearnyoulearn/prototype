'use client'

import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { QR_POINT_KINDS } from '@/lib/feedback-defaults'
import type { QrPoint } from './FeedbackQrPointsTab'

const CONFIRM_WORD = 'DELETE'

// Permanent delete of an event/place QR (its Submissions folder) — lists
// exactly what goes, offers Pause as the safe alternative, and needs the
// admin to type DELETE before the button unlocks.
export default function DeleteQrPointDialog({
  point, onClose, onDeleted, onPauseInstead,
}: {
  point: QrPoint
  onClose: () => void
  onDeleted: () => void
  onPauseInstead?: () => void
}) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const kind = QR_POINT_KINDS.find(k => k.key === point.kind)
  const ready = typed.trim().toUpperCase() === CONFIRM_WORD

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

  return (
    <Dialog open onOpenChange={open => !open && !deleting && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="feedback-delete-folder-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <AlertTriangle size={20} aria-hidden="true" />Delete this folder?
          </DialogTitle>
        </DialogHeader>

        <p className="-mt-1 line-clamp-2 break-words text-sm font-bold text-gray-900">{kind?.icon} {point.title}</p>

        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <p className="mb-1.5 font-bold">This permanently deletes:</p>
          <ul className="space-y-1 text-[13px]">
            <li>🗂️ <b>{point.response_count}</b> submission{point.response_count === 1 ? '' : 's'} and all their ratings &amp; voice notes</li>
            <li>🚨 <b>{point.open_issues}</b> open issue{point.open_issues === 1 ? '' : 's'} in the Issue Pipeline</li>
            <li>📍 The QR code itself — <b>printed posters will stop working</b> (&ldquo;form not available&rdquo;)</li>
          </ul>
          <p className="mt-2 text-xs font-semibold">This cannot be undone.</p>
        </div>

        {onPauseInstead && point.is_active && (
          <p className="text-xs text-gray-600">
            Just want to stop new feedback but keep what you have?{' '}
            <button type="button" onClick={onPauseInstead} disabled={deleting} className="font-bold text-[#245b46] hover:underline">Pause it instead</button>
          </p>
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
      </DialogContent>
    </Dialog>
  )
}
