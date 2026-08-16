'use client'

import { useEffect, useState } from 'react'

type AuditLog = {
  id: number
  action: string
  entity_type: string
  entity_id: number | null
  entity_name: string | null
  details: Record<string, unknown>
  created_at: string
  actor_email: string | null
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create_school:       { label: 'Created School',       color: 'bg-green-100 text-green-700' },
  update_school:       { label: 'Updated School',       color: 'bg-blue-100 text-blue-700' },
  delete_school:       { label: 'Deleted School',       color: 'bg-red-100 text-red-700' },
  update_subscription: { label: 'Changed Plan',         color: 'bg-purple-100 text-purple-700' },
  reset_password:      { label: 'Reset Password',       color: 'bg-amber-100 text-amber-700' },
  backfill_portal_access: { label: 'Activated Portal Access', color: 'bg-teal-100 text-teal-700' },
}

function formatDetails(action: string, details: Record<string, unknown>): string {
  if (action === 'update_subscription') {
    return `${details.from ?? '?'} → ${details.to ?? '?'}`
  }
  if (action === 'update_school' && Array.isArray(details.updated_fields)) {
    return `Fields: ${(details.updated_fields as string[]).join(', ')}`
  }
  if (action === 'create_school') {
    return `${details.type || ''}${details.city ? ` · ${details.city}` : ''}`
  }
  if (action === 'backfill_portal_access') {
    const parts = [
      details.students_credentialed ? `${details.students_credentialed} student(s)` : '',
      details.parents_credentialed ? `${details.parents_credentialed} parent(s)` : '',
    ].filter(Boolean)
    return `${parts.join(', ') || 'no pending accounts'}${details.actor_label ? ` · by ${details.actor_label}` : ''}`
  }
  return ''
}

export default function AuditLogPage() {
  const [logs, setLogs]     = useState<AuditLog[]>([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage]     = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    load(page)
  }, [page])

  async function load(p: number) {
    setLoading(true)
    try {
      const res = await fetch(`/api/platform/audit?limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
      }
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-gray-400 text-sm mt-0.5">{total} total actions recorded</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-gray-400">No actions recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Action</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">School</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Details</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">By</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => {
                  const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {log.entity_name ? (
                          <span className="text-gray-800 font-medium">{log.entity_name}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        {log.entity_id && (
                          <span className="text-gray-400 text-xs ml-1">#{log.entity_id}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs">
                        {formatDetails(log.action, log.details) || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs">
                        {log.actor_email || 'System'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs">
                        {new Date(log.created_at).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                Previous
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
                className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
