'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  const [issues, setIssues] = useState<Issue[]>([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  function load() {
    setLoading(true)
    const filter = statusFilter !== 'all' ? `&status=${statusFilter}` : ''
    fetch(`/api/feedback/issues?school_id=${schoolId}${filter}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => { setIssues(data); setError('') })
      .catch(() => setError('Failed to load issues'))
      .finally(() => setLoading(false))
  }

  // Standard fetch-on-mount/on-filter-change — see FeedbackDashboardTab.tsx for why
  // set-state-in-effect is suppressed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load() }, [schoolId, statusFilter])

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id)
    try {
      await fetch(`/api/feedback/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      load()
    } finally {
      setUpdatingId(null)
    }
  }

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
        <span className="text-xs text-gray-400">{issues.length} issue{issues.length === 1 ? '' : 's'}</span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-500">{error}</div>
      ) : issues.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">No issues here.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Issue</th>
                <th className="px-4 py-2.5 text-left">Department</th>
                <th className="px-4 py-2.5 text-left">Priority</th>
                <th className="px-4 py-2.5 text-left">Reported</th>
                <th className="px-4 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {issues.map(issue => (
                <tr key={issue.id} data-testid={`feedback-issue-row-${issue.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{issue.category_label}</div>
                    {issue.free_text && <div className="mt-0.5 line-clamp-1 text-xs text-gray-400">{issue.free_text}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{issue.department || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={issue.priority === 'high' ? 'destructive' : 'secondary'}>{issue.priority}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(issue.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Select value={issue.status} onValueChange={v => updateStatus(issue.id, v)} disabled={updatingId === issue.id}>
                      <SelectTrigger className="w-36" data-testid={`feedback-issue-status-select-${issue.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
