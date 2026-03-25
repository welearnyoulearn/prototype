'use client'

import { useEffect, useState } from 'react'

type LeaveRequest = {
  id: number
  leave_type: string
  start_date: string
  end_date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
}

type Props = {
  teacherId: number
  schoolId: number
}

const LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Earned Leave', 'Maternity Leave', 'Emergency Leave', 'Other']

function daysBetween(start: string, end: string) {
  return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1
}

export default function TeacherLeave({ teacherId, schoolId }: Props) {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    leave_type: 'Sick Leave',
    start_date: '',
    end_date: '',
    reason: '',
  })

  useEffect(() => {
    fetch(`/api/leave-requests?teacher_id=${teacherId}`)
      .then(r => r.json())
      .then(data => setLeaveRequests(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [teacherId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    // Client-side overlap check
    const reqStart = new Date(form.start_date + 'T00:00:00')
    const reqEnd = new Date(form.end_date + 'T00:00:00')
    const overlap = leaveRequests.find(r => {
      if (r.status === 'rejected') return false
      const s = new Date(r.start_date.slice(0, 10) + 'T00:00:00')
      const en = new Date(r.end_date.slice(0, 10) + 'T00:00:00')
      return s <= reqEnd && en >= reqStart
    })
    if (overlap) {
      const s = new Date(overlap.start_date.slice(0, 10) + 'T00:00:00').toLocaleDateString()
      const en = new Date(overlap.end_date.slice(0, 10) + 'T00:00:00').toLocaleDateString()
      setError(
        overlap.status === 'approved'
          ? `You already have an approved leave for overlapping dates (${s} – ${en}). Please contact admin to modify it.`
          : `You already have a pending leave request for overlapping dates (${s} – ${en}). Please cancel it before submitting a new one.`
      )
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId, school_id: schoolId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLeaveRequests(prev => [data, ...prev])
      setShowForm(false)
      setForm({ leave_type: 'Sick Leave', start_date: '', end_date: '', reason: '' })
      setSuccess('Leave request submitted — school admin will review it.')
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const pending = leaveRequests.filter(r => r.status === 'pending').length
  const approved = leaveRequests.filter(r => r.status === 'approved').length

  const statusBadge = (status: string) => {
    if (status === 'pending') return 'bg-orange-100 text-orange-700'
    if (status === 'approved') return 'bg-green-100 text-green-700'
    return 'bg-red-100 text-red-600'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Leave Requests</h2>
          <p className="text-sm text-gray-500 mt-0.5">Submit and track your leave applications</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ Apply for Leave'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{leaveRequests.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Requests</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-orange-600">{pending}</p>
          <p className="text-xs text-gray-400 mt-0.5">Pending</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-600">{approved}</p>
          <p className="text-xs text-gray-400 mt-0.5">Approved</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">✓ {success}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-green-200 p-6 mb-5 space-y-4">
          <h3 className="font-semibold text-gray-800">New Leave Application</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type *</label>
            <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
              {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From *</label>
              <input type="date" required value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To *</label>
              <input type="date" required min={form.start_date} value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300" />
            </div>
          </div>
          {form.start_date && form.end_date && (
            <p className="text-xs text-green-700 font-medium">
              Duration: {daysBetween(form.start_date, form.end_date)} day{daysBetween(form.start_date, form.end_date) !== 1 ? 's' : ''}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <textarea rows={3} value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
              placeholder="Brief reason for leave..." />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-gray-400">Loading...</div>
        ) : leaveRequests.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-gray-400">No leave requests yet</p>
            <p className="text-gray-300 text-sm mt-1">Click &quot;Apply for Leave&quot; to submit</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Leave Type</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Duration</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Reason</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaveRequests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium text-gray-900">{r.leave_type}</td>
                  <td className="px-5 py-4">
                    <div className="text-gray-700 text-xs">{new Date(r.start_date.slice(0,10) + 'T00:00:00').toLocaleDateString()} – {new Date(r.end_date.slice(0,10) + 'T00:00:00').toLocaleDateString()}</div>
                    <div className="text-xs text-gray-400">{daysBetween(r.start_date, r.end_date)} day{daysBetween(r.start_date, r.end_date) !== 1 ? 's' : ''}</div>
                  </td>
                  <td className="px-5 py-4 text-gray-500 max-w-[180px] truncate text-xs">{r.reason || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">{new Date(r.created_at.slice(0,10) + 'T00:00:00').toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
