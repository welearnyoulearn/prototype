'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { Inbox, PanelRightOpen } from 'lucide-react'
import { useFeedbackFetch } from './useFeedbackFetch'
import SubmissionDetailSheet from './SubmissionDetailSheet'
import type { Submission } from './submissionUi'

interface Issue {
  id: number
  submission_id: number
  category_label: string
  department: string | null
  rating: number
  priority: 'high' | 'medium'
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed'
  created_at: string
  role: string
  is_anonymous: boolean
  submitter_name: string | null
  free_text: string | null
  qr_point_title: string | null
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
]

export default function FeedbackIssueTable({ schoolId, source }: { schoolId: number; source: string }) {
  const [statusFilter, setStatusFilter] = useState('open')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  // Full submission behind an issue, shown in the shared detail panel
  const [opened, setOpened] = useState<Submission | null>(null)
  const [openingId, setOpeningId] = useState<number | null>(null)

  const filter = statusFilter !== 'all' ? `&status=${statusFilter}` : ''
  const { data: issues, loading, error, reload } = useFeedbackFetch<Issue[]>(
    `/api/feedback/issues?school_id=${schoolId}${filter}&source=${source}`, [schoolId, statusFilter, source], 'Failed to load issues'
  )

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id); setActionError('')
    try {
      const res = await fetch(`/api/feedback/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      const label = STATUS_OPTIONS.find(o => o.value === status)?.label ?? status
      setNotice(`Issue marked ${label.toLowerCase()}`)
      setTimeout(() => setNotice(''), 2500)
      reload()
    } catch {
      setActionError('Could not update the issue — please try again.')
    } finally {
      setUpdatingId(null)
    }
  }

  async function openSubmission(submissionId: number) {
    setOpeningId(submissionId); setActionError('')
    try {
      const res = await fetch(`/api/feedback/submissions/${submissionId}`)
      if (!res.ok) throw new Error()
      setOpened(await res.json())
    } catch {
      setActionError('Could not open this feedback — please try again.')
    } finally {
      setOpeningId(null)
    }
  }

  const rows = issues ?? []

  return (
    <div data-testid="feedback-issue-pipeline">
      <div className="mb-4 flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="feedback-issues-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-400">{rows.length} issue{rows.length === 1 ? '' : 's'}</span>
      </div>

      {actionError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" data-testid="feedback-issue-error">{actionError}</div>}
      {notice && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">✅ {notice}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="No issues here." className="border-0 py-16" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Feedback</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(issue => (
                <TableRow key={issue.id} data-testid={`feedback-issue-row-${issue.id}`}>
                  <TableCell>
                    <div className="font-medium text-gray-800">{issue.category_label}</div>
                    {issue.qr_point_title && <div className="mt-0.5 text-[11px] font-semibold text-amber-700">📍 {issue.qr_point_title}</div>}
                    {issue.free_text && <div className="mt-0.5 line-clamp-1 text-xs text-gray-400">{issue.free_text}</div>}
                  </TableCell>
                  <TableCell className="text-gray-600">{issue.department || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={issue.priority === 'high' ? 'destructive' : 'secondary'}>{issue.priority}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-gray-400">{new Date(issue.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Select value={issue.status} onValueChange={v => updateStatus(issue.id, v)} disabled={updatingId === issue.id}>
                      <SelectTrigger className="w-36" data-testid={`feedback-issue-status-select-${issue.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      data-testid={`feedback-issue-open-${issue.id}`}
                      onClick={() => openSubmission(issue.submission_id)}
                      disabled={openingId === issue.submission_id}
                      title="See the full feedback: comment, contact, voice note"
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-[#245b46] transition-colors hover:bg-[#edf2eb] disabled:opacity-50"
                    >
                      <PanelRightOpen size={13} aria-hidden="true" />{openingId === issue.submission_id ? '…' : 'View'}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SubmissionDetailSheet submission={opened} onClose={() => setOpened(null)} />
    </div>
  )
}
