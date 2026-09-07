'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFeedbackFetch } from './useFeedbackFetch'

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
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
]

export default function FeedbackIssueTable({ schoolId }: { schoolId: number }) {
  const [statusFilter, setStatusFilter] = useState('open')
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const filter = statusFilter !== 'all' ? `&status=${statusFilter}` : ''
  const { data: issues, loading, error, reload } = useFeedbackFetch<Issue[]>(
    `/api/feedback/issues?school_id=${schoolId}${filter}`, [schoolId, statusFilter], 'Failed to load issues'
  )

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id)
    try {
      await fetch(`/api/feedback/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      reload()
    } finally {
      setUpdatingId(null)
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

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">No issues here.</div>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(issue => (
                <TableRow key={issue.id} data-testid={`feedback-issue-row-${issue.id}`}>
                  <TableCell>
                    <div className="font-medium text-gray-800">{issue.category_label}</div>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
