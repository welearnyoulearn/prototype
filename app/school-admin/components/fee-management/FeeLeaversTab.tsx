'use client'

import { rollLabel } from './format'
import { useCallback, useEffect, useState } from 'react'
import { LoadErrorBanner } from './LoadErrorBanner'

export type RemovedStudent = {
  student_id: number
  student_name: string
  roll_number: string
  school_roll_number?: number | null
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

type Money = 'total_billed' | 'total_collected' | 'outstanding'
const sum = (list: RemovedStudent[], k: Money) => list.reduce((t, s) => t + Number(s[k]), 0)
const groupOf = (s: RemovedStudent) => (s.passout_year ? `Passed out ${s.passout_year}` : `Removed (${s.student_status})`)

// Every student no longer on the active roster (graduated/passout or otherwise
// removed) who still carries an unresolved balance. Nothing here is deleted, so
// amounts owed stay visible and collectible. "Collect" hands the student to the
// parent, which primes the existing Collect tab's payment form for them — that
// flow needs several pieces of Collect-tab state (pay amount, mode, selected
// entries, etc.), so it stays owned by the parent rather than duplicated here.
export default function FeeLeaversTab({
  schoolId,
  onCollect,
  onOpenPassbook,
}: {
  schoolId: number
  // Throws on failure (e.g. no outstanding dues found) so this tab can show the
  // error next to the row that triggered it — the actual collect-form priming
  // happens in the parent, via the shared fee store's pendingCollectRequest.
  onCollect: (student: RemovedStudent) => Promise<void>
  // Opens the shared student passbook modal (bills, payments, dues across years)
  onOpenPassbook: (studentId: number) => void
}) {
  const [removedData, setRemovedData] = useState<{
    summary: { student_count: number; total_outstanding: number }
    students: RemovedStudent[]
  } | null>(null)
  const [removedLoading, setRemovedLoading] = useState(false)
  const [removedError, setRemovedError]     = useState('')
  const [collectingId, setCollectingId]     = useState<number | null>(null)
  const [collectError, setCollectError]     = useState('')
  const [search, setSearch]                 = useState('')
  const [groupFilter, setGroupFilter]       = useState('all')

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
    setCollectingId(s.student_id); setCollectError('')
    try { await onCollect(s) }
    catch (e) { setCollectError(e instanceof Error ? e.message : 'Failed to open collection form') }
    finally { setCollectingId(null) }
  }

  const all = removedData?.students ?? []
  const term = search.trim().toLowerCase()
  const filtered = all.filter(s =>
    (groupFilter === 'all' || groupOf(s) === groupFilter) &&
    (!term || s.student_name.toLowerCase().includes(term) || s.roll_number.toLowerCase().includes(term) || String(s.school_roll_number ?? '') === term))
  const groupNames = [...new Set(all.map(groupOf))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  const groups = groupNames
    .map(name => ({ name, students: filtered.filter(s => groupOf(s) === name) }))
    .filter(g => g.students.length > 0)
  const stats = removedData ? [
    { label: 'Students', value: String(removedData.summary.student_count), tone: 'text-gray-800' },
    { label: 'Billed', value: fmt(sum(all, 'total_billed')), tone: 'text-gray-800' },
    { label: 'Collected', value: fmt(sum(all, 'total_collected')), tone: 'text-green-600' },
    { label: 'Outstanding', value: fmt(removedData.summary.total_outstanding), tone: 'text-red-600' },
  ] : []

  return (
    <div className="space-y-5">
      <LoadErrorBanner message={removedError} onRetry={loadRemovedStudents} />
      {collectError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{collectError}</div>
      )}

      <div>
        <h2 className="text-base font-semibold text-gray-800">Leavers & Dues</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Every student no longer on the active roster — graduated/passout or otherwise removed —
          who still has unresolved dues. Nothing here is deleted, so amounts owed stay visible and collectible.
        </p>
      </div>

      {removedLoading && !removedData ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : removedData && all.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-gray-500 text-sm">No removed students with outstanding dues.</p>
        </div>
      ) : removedData && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map(c => (
              <div key={c.label} data-testid={`leavers-stat-${c.label.toLowerCase()}`} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{c.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${c.tone}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-gray-100">
              <input data-testid="input-leavers-search" type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search student name or roll…"
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-full sm:w-64 focus:ring-2 focus:ring-indigo-300" />
              <select data-testid="select-leavers-group" value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700">
                <option value="all">All batches</option>
                {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {all.length} students</span>
              <button onClick={loadRemovedStudents} disabled={removedLoading}
                className="text-xs text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5">
                {removedLoading ? '…' : '↻ Refresh'}
              </button>
            </div>

            {groups.length === 0 && <p data-testid="leavers-no-match" className="px-4 py-8 text-center text-sm text-gray-400">No students match.</p>}

            {groups.map(g => (
              <div key={g.name} data-testid={`leavers-group-${g.name}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2 bg-indigo-50 border-y border-indigo-100">
                  <p className="text-xs font-bold text-indigo-700">{g.name} · {g.students.length} student{g.students.length === 1 ? '' : 's'}</p>
                  <p className="text-xs text-gray-500">Outstanding: <b className="text-red-600">{fmt(sum(g.students, 'outstanding'))}</b></p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                        <th className="text-left px-4 py-2 font-semibold">Student</th>
                        <th className="text-right px-4 py-2 font-semibold">Billed</th>
                        <th className="text-right px-4 py-2 font-semibold">Collected</th>
                        <th className="text-right px-4 py-2 font-semibold">Outstanding</th>
                        <th className="text-right px-4 py-2 font-semibold w-28">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {g.students.map(s => {
                        const years = s.academic_years.filter(y => y !== 'passout').join(', ')
                        return (
                          <tr key={s.student_id} className="hover:bg-gray-50/60">
                            <td className="px-4 py-2.5">
                              <button data-testid={`btn-leaver-details-${s.student_id}`} onClick={() => onOpenPassbook(s.student_id)}
                                title="View student details & passbook"
                                className="font-medium text-indigo-700 hover:underline text-left">{s.student_name}</button>
                              <p className="text-xs text-gray-400">
                                {[s.grade ? `Gr.${s.grade}${s.section || ''}` : '', rollLabel(s.school_roll_number), years].filter(Boolean).join(' · ')}
                                <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">{s.student_status}</span>
                              </p>
                            </td>
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
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
