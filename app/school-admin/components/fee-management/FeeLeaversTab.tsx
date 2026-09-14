'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoadErrorBanner } from './LoadErrorBanner'

export type RemovedStudent = {
  student_id: number
  student_name: string
  roll_number: string
  grade: string | null
  section: string | null
  student_status: string
  passout_year: string | null
  total_billed: number
  total_collected: number
  outstanding: number
  academic_years: string[]
}

function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// Every student no longer on the active roster (graduated/passout or otherwise
// removed) who still carries an unresolved balance. Nothing here is deleted, so
// amounts owed stay visible and collectible. "Collect" hands the student to the
// parent, which primes the existing Collect tab's payment form for them — that
// flow needs several pieces of Collect-tab state (pay amount, mode, selected
// entries, etc.), so it stays owned by the parent rather than duplicated here.
export default function FeeLeaversTab({
  schoolId,
  onCollect,
}: {
  schoolId: number
  onCollect: (student: RemovedStudent) => Promise<void>
}) {
  const [removedData, setRemovedData] = useState<{
    summary: { student_count: number; total_outstanding: number }
    students: RemovedStudent[]
  } | null>(null)
  const [removedLoading, setRemovedLoading] = useState(false)
  const [removedError, setRemovedError]     = useState('')
  const [collectingId, setCollectingId]     = useState<number | null>(null)

  const loadRemovedStudents = useCallback(async () => {
    setRemovedLoading(true)
    try {
      const res = await fetch(`/api/fees/removed-students?school_id=${schoolId}`)
      if (res.ok) { setRemovedError(''); setRemovedData(await res.json()) }
      else setRemovedError('Could not load removed-student dues — try refreshing')
    } catch { setRemovedError('Network error — could not load removed-student dues') }
    finally { setRemovedLoading(false) }
  }, [schoolId])

  useEffect(() => { loadRemovedStudents() }, [loadRemovedStudents])

  async function handleCollect(s: RemovedStudent) {
    setCollectingId(s.student_id)
    try { await onCollect(s) } finally { setCollectingId(null) }
  }

  return (
    <div className="space-y-5">
      <LoadErrorBanner message={removedError} onRetry={loadRemovedStudents} />

      <div>
        <h2 className="text-base font-semibold text-gray-800">Leavers & Dues</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Every student no longer on the active roster — graduated/passout or otherwise removed —
          who still has unresolved dues. Nothing here is deleted, so amounts owed stay visible and collectible.
        </p>
      </div>

      {removedLoading && !removedData ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : removedData && removedData.students.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-gray-500 text-sm">No removed students with outstanding dues.</p>
        </div>
      ) : removedData && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">
              {removedData.summary.student_count} student{removedData.summary.student_count === 1 ? '' : 's'} · {fmt(removedData.summary.total_outstanding)} outstanding
            </p>
            <button onClick={loadRemovedStudents} disabled={removedLoading}
              className="text-xs text-gray-500 hover:text-gray-700">
              {removedLoading ? '…' : '↻ Refresh'}
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left px-4 py-2 font-semibold">Student</th>
                <th className="text-left px-4 py-2 font-semibold">Status</th>
                <th className="text-left px-4 py-2 font-semibold">Years</th>
                <th className="text-right px-4 py-2 font-semibold">Billed</th>
                <th className="text-right px-4 py-2 font-semibold">Collected</th>
                <th className="text-right px-4 py-2 font-semibold">Outstanding</th>
                <th className="text-right px-4 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {removedData.students.map(s => (
                <tr key={s.student_id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800">{s.student_name}</p>
                    <p className="text-xs text-gray-400">
                      {s.roll_number}{s.grade ? ` · Gr.${s.grade}${s.section || ''}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 capitalize">
                    {s.student_status}
                    {s.passout_year && <span className="block text-[10px] text-gray-400 normal-case">passed out {s.passout_year}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{s.academic_years.filter(y => y !== 'passout').join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{fmt(s.total_billed)}</td>
                  <td className="px-4 py-2.5 text-right text-green-600">{fmt(s.total_collected)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmt(s.outstanding)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      data-testid={`btn-leaver-collect-${s.student_id}`}
                      onClick={() => handleCollect(s)}
                      disabled={collectingId === s.student_id}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
                      {collectingId === s.student_id ? '…' : 'Collect'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
