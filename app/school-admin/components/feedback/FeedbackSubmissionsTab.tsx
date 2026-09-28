'use client'

import { useState } from 'react'
import { Archive, ChevronLeft, ChevronRight, Folder, FolderOpen, Trash2 } from 'lucide-react'
import { QR_POINT_KINDS, formatFeedbackDate } from '@/lib/feedback-defaults'
import { useFeedbackFetch } from './useFeedbackFetch'
import type { QrPoint } from './FeedbackQrPointsTab'
import DeleteQrPointDialog from './DeleteQrPointDialog'
import SubmissionList from './SubmissionList'
import { ArchiveTools, ClearFolderDialog, DownloadButton } from './FolderMaintenance'
import type { Submission } from './submissionUi'

interface SubmissionsResponse { data: Submission[]; total: number }

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'No responses yet'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'Last response just now'
  if (mins < 60) return `Last response ${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `Last response ${hrs} h ago`
  return `Last response ${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
}

// Folder home: one folder for the school-wide QR plus one per event/place QR
// point, so feedback from a specific event is kept together and apart from
// everything else. `source` ('all' = folder home, 'general', '<point id>')
// is shared with the Dashboard/Issue Pipeline source filter.
function FolderHome({ schoolId, points, onOpen, onDelete }: { schoolId: number; points: QrPoint[]; onOpen: (source: string) => void; onDelete: (p: QrPoint) => void }) {
  const { data: general } = useFeedbackFetch<SubmissionsResponse>(
    `/api/feedback/submissions?school_id=${schoolId}&source=general&limit=1`, [schoolId], 'Failed to load'
  )
  const { data: archived } = useFeedbackFetch<SubmissionsResponse>(
    `/api/feedback/submissions?school_id=${schoolId}&source=archived&limit=1`, [schoolId], 'Failed to load'
  )
  const folderCls = 'group flex w-full flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#9bb7a4] hover:shadow-md'

  return (
    <div data-testid="feedback-submission-folders">
      <p className="mb-3 text-xs text-gray-500">Feedback is filed by where it came from. Open a folder to see its submissions.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button type="button" data-testid="feedback-folder-general" onClick={() => onOpen('general')} className={folderCls}>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#edf2eb] text-[#245b46]">
              <Folder size={22} className="group-hover:hidden" aria-hidden="true" />
              <FolderOpen size={22} className="hidden group-hover:block" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-gray-900">🏫 School-wide QR</div>
              <div className="text-[11px] text-gray-400">General feedback from the main poster</div>
            </div>
            <ChevronRight size={16} className="text-gray-300" aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="font-bold text-gray-700">{general ? general.total : '…'} submission{general?.total === 1 ? '' : 's'}</span>
            <span className="text-gray-400">{timeAgo(general?.data[0]?.created_at)}</span>
          </div>
        </button>

        {points.map(p => {
          const kind = QR_POINT_KINDS.find(k => k.key === p.kind)
          const sub = [formatFeedbackDate(p.event_date), p.venue].filter(Boolean).join(' · ')
          return (
            <div key={p.id} className="relative">
            <button type="button" data-testid={`feedback-folder-${p.id}`} onClick={() => onOpen(String(p.id))} className={folderCls}>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Folder size={22} className="group-hover:hidden" aria-hidden="true" />
                  <FolderOpen size={22} className="hidden group-hover:block" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-gray-900" title={p.title}>{kind?.icon} {p.title}</div>
                  <div className="truncate text-[11px] text-gray-400">{sub || (kind?.label ?? '')}</div>
                </div>
                <ChevronRight size={16} className="text-gray-300" aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-gray-700">
                  {p.response_count} submission{p.response_count === 1 ? '' : 's'}
                  {p.open_issues > 0 && <span className="ml-2 whitespace-nowrap rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">{p.open_issues} open issue{p.open_issues === 1 ? '' : 's'}</span>}
                </span>
                <span className="shrink-0 pr-8 text-gray-400">{timeAgo(p.last_response_at)}</span>
              </div>
            </button>
            <button
              type="button"
              data-testid={`feedback-folder-delete-btn-${p.id}`}
              onClick={() => onDelete(p)}
              title="Delete folder"
              aria-label={`Delete folder ${p.title}`}
              className="absolute bottom-3 right-3 rounded-md p-1.5 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
            </div>
          )
        })}
      </div>
      {archived && archived.total > 0 && (
        <button
          type="button"
          data-testid="feedback-folder-archived"
          onClick={() => onOpen('archived')}
          className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-left transition hover:border-gray-400 hover:bg-white"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600"><Archive size={18} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-800">🗄️ Archive</span>
            <span className="block text-[11px] text-gray-500">Reviews moved out with &ldquo;Clear folder&rdquo; — read, download, restore or delete</span>
          </span>
          <span className="shrink-0 text-xs font-bold text-gray-600">{archived.total} review{archived.total === 1 ? '' : 's'}</span>
          <ChevronRight size={16} className="text-gray-300" aria-hidden="true" />
        </button>
      )}
      {points.length === 0 && (
        <p className="mt-4 text-xs text-gray-400">Create an event or place QR in the <b>Event &amp; Place QRs</b> tab — its feedback will get its own folder here.</p>
      )}
    </div>
  )
}

export default function FeedbackSubmissionsTab({
  schoolId, source, points, onSourceChange, onPointsChanged,
}: {
  schoolId: number
  source: string
  points: QrPoint[]
  onSourceChange: (source: string) => void
  onPointsChanged: () => void // re-fetch the QR point list after a delete/pause
}) {
  const [deleting, setDeleting] = useState<QrPoint | null>(null)
  const [clearFor, setClearFor] = useState<QrPoint | null>(null)
  // Bumped after a clear started from the delete dialog so an open folder re-fetches
  const [listVersion, setListVersion] = useState(0)

  async function pauseInstead(p: QrPoint) {
    setDeleting(null)
    await fetch(`/api/feedback/qr-points/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    }).catch(() => {})
    onPointsChanged()
  }

  return (
    <>
      {/* A QR point deleted elsewhere can't stay open as a folder */}
      {source === 'all' || (/^\d+$/.test(source) && points.length > 0 && !points.some(p => String(p.id) === source))
        ? <FolderHome schoolId={schoolId} points={points} onOpen={onSourceChange} onDelete={setDeleting} />
        : <FolderContents key={`${source}-${listVersion}`} schoolId={schoolId} source={source} points={points} onBack={() => onSourceChange('all')} onDelete={setDeleting} onChanged={onPointsChanged} />}
      {deleting && (
        <DeleteQrPointDialog
          schoolId={schoolId}
          point={deleting}
          onClose={() => setDeleting(null)}
          onPauseInstead={() => pauseInstead(deleting)}
          onClearInstead={() => { setClearFor(deleting); setDeleting(null) }}
          onDeleted={() => { setDeleting(null); onSourceChange('all'); onPointsChanged() }}
        />
      )}
      {clearFor && (
        <ClearFolderDialog
          schoolId={schoolId}
          source={String(clearFor.id)}
          folderName={`${QR_POINT_KINDS.find(k => k.key === clearFor.kind)?.icon ?? ''} ${clearFor.title}`}
          onClose={() => setClearFor(null)}
          onDone={() => { setClearFor(null); setListVersion(v => v + 1); onPointsChanged() }}
        />
      )}
    </>
  )
}

function FolderContents({
  schoolId, source, points, onBack, onDelete, onChanged,
}: {
  schoolId: number
  source: string
  points: QrPoint[]
  onBack: () => void
  onDelete: (p: QrPoint) => void
  onChanged: () => void // folder counts changed (clear / restore / purge)
}) {
  const point = points.find(p => String(p.id) === source)
  const isArchive = source === 'archived'
  const folderName = isArchive ? '🗄️ Archive' : source === 'general' ? '🏫 School-wide QR' : point ? `${QR_POINT_KINDS.find(k => k.key === point.kind)?.icon ?? ''} ${point.title}` : 'Folder'
  const [clearing, setClearing] = useState(false)
  const [notice, setNotice] = useState('')
  // Bumped after clear/restore/purge so the list re-fetches
  const [version, setVersion] = useState(0)

  function changed(message: string) {
    setNotice(message)
    setVersion(v => v + 1)
    onChanged()
    setTimeout(() => setNotice(''), 4000)
  }

  return (
    <div data-testid="feedback-submissions-tab">
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        {/* Main way back to the other folders — styled as a real button and
            pulsed 3× each time a folder opens (see .anim-attention-pulse) */}
        <button
          type="button"
          data-testid="feedback-folders-back-btn"
          onClick={onBack}
          className="anim-attention-pulse inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#9bb7a4] bg-[#edf2eb] py-1.5 pl-2 pr-3.5 text-sm font-bold text-[#245b46] transition-colors hover:bg-[#245b46] hover:text-white"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <Folder size={15} aria-hidden="true" />All folders
          {points.length > 0 && (
            <span className="rounded-full bg-white/80 px-1.5 text-[11px] font-bold text-[#245b46]">{points.length + 1}</span>
          )}
        </button>
        <span className="text-gray-300">/</span>
        <FolderOpen size={16} className="shrink-0 text-amber-600" aria-hidden="true" />
        <span className="truncate font-bold text-gray-900" data-testid="feedback-folder-name" title={folderName}>{folderName}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <DownloadButton schoolId={schoolId} source={source} />
          {isArchive ? (
            <ArchiveTools schoolId={schoolId} onChanged={changed} />
          ) : (
            <button
              type="button"
              data-testid="feedback-folder-clear-btn"
              onClick={() => setClearing(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
            >
              <Archive size={13} aria-hidden="true" />Clear folder
            </button>
          )}
          {point && (
            <button
              type="button"
              data-testid="feedback-folder-delete-btn"
              onClick={() => onDelete(point)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
            >
              <Trash2 size={13} aria-hidden="true" />Delete folder
            </button>
          )}
        </div>
      </div>
      {notice && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" data-testid="feedback-folder-notice">✅ {notice}</div>}
      {isArchive && (
        <p className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          🗄️ Archived reviews are hidden from their folders, the Dashboard and the Issue Pipeline. Restore them to bring them back, or empty the archive to delete them for good.
        </p>
      )}
      {clearing && (
        <ClearFolderDialog
          schoolId={schoolId}
          source={source}
          folderName={folderName}
          onClose={() => setClearing(false)}
          onDone={n => { setClearing(false); changed(`${n} review${n === 1 ? '' : 's'} moved to the 🗄️ Archive`) }}
        />
      )}
      {point && (point.event_date || point.venue) && (
        <p className="mb-3 text-xs text-gray-500">{[formatFeedbackDate(point.event_date), point.venue].filter(Boolean).join(' · ')}</p>
      )}
      <SubmissionList key={version} schoolId={schoolId} source={source} />
    </div>
  )
}
