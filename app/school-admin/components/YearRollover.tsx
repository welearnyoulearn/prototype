'use client'

import { useEffect, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type AcademicYear = {
  id: number
  label: string
  start_date: string
  end_date: string
  is_current: boolean
  student_snapshot_count: number
}

type GradeGroup = { grade: string; section: string; student_count: number }

type RolloverResult = {
  snapshotted: number
  promoted: number
  graduated: number
  errors: string[]
  message: string
}

// Default grade sequence — admin can edit in UI
const DEFAULT_SEQUENCE = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

// ── Helper ─────────────────────────────────────────────────────────────────

function nextGrade(grade: string, sequence: string[]): string | null {
  const idx = sequence.indexOf(grade)
  if (idx === -1 || idx === sequence.length - 1) return null
  return sequence[idx + 1]
}

function genLabel(startYear: number) {
  return `${startYear}-${String(startYear + 1).slice(-2)}`
}

// ── Component ──────────────────────────────────────────────────────────────

export default function YearRollover({ schoolId }: { schoolId: number }) {
  const [years, setYears]             = useState<AcademicYear[]>([])
  const [groups, setGroups]           = useState<GradeGroup[]>([])
  const [loading, setLoading]         = useState(true)
  const [step, setStep]               = useState<'setup' | 'configure' | 'confirm' | 'done'>('setup')
  const [result, setResult]           = useState<RolloverResult | null>(null)
  const [rolling, setRolling]         = useState(false)
  const [error, setError]             = useState('')

  // Year setup form
  const currentYear = new Date().getFullYear()
  const [newLabel, setNewLabel]       = useState(genLabel(currentYear))
  const [newStart, setNewStart]       = useState(`${currentYear + 1}-04-01`)
  const [newEnd, setNewEnd]           = useState(`${currentYear + 2}-03-31`)
  const [creatingYear, setCreatingYear]     = useState(false)
  const [selectedToYear, setSelectedToYear] = useState<number | null>(null)
  const [settingCurrent, setSettingCurrent] = useState<number | null>(null)

  // Grade config
  const [sequenceStr, setSequenceStr] = useState(DEFAULT_SEQUENCE.join(', '))
  const [finalGrade, setFinalGrade]   = useState('12')

  useEffect(() => { init() }, [schoolId])

  async function init() {
    setLoading(true)
    try {
      const [yr, gr] = await Promise.all([
        fetch(`/api/academic-years?school_id=${schoolId}`).then(r => r.json()),
        fetch(`/api/students/promote?school_id=${schoolId}`).then(r => r.json()),
      ])
      setYears(Array.isArray(yr) ? yr : [])
      setGroups(gr.groups ?? [])
    } finally {
      setLoading(false)
    }
  }

  const currentYearObj = years.find(y => y.is_current)
  const sequence = sequenceStr.split(',').map(s => s.trim()).filter(Boolean)

  // Preview: what happens to each grade group
  const preview = groups.map(g => {
    const isGrad = g.grade === finalGrade
    const to = isGrad ? null : nextGrade(g.grade, sequence)
    return { ...g, to, isGrad }
  })

  const totalStudents  = groups.reduce((s, g) => s + g.student_count, 0)
  const gradStudents   = groups.filter(g => g.grade === finalGrade).reduce((s, g) => s + g.student_count, 0)
  const promoteStudents = totalStudents - gradStudents

  // ── Set a year as current ────────────────────────────────────────────────

  async function setAsCurrent(yearId: number) {
    setSettingCurrent(yearId); setError('')
    try {
      const r = await fetch(`/api/academic-years?id=${yearId}&school_id=${schoolId}`, {
        method: 'PATCH',
      })
      if (!r.ok) throw new Error((await r.json()).error)
      await init()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to set current year')
    } finally {
      setSettingCurrent(null)
    }
  }

  // ── Create new academic year ─────────────────────────────────────────────

  async function createYear() {
    setCreatingYear(true); setError('')
    try {
      const r = await fetch('/api/academic-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          label: newLabel,
          start_date: newStart,
          end_date: newEnd,
          set_current: false,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      await init()
      setSelectedToYear(d.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create year')
    } finally {
      setCreatingYear(false)
    }
  }

  // ── Execute rollover ─────────────────────────────────────────────────────

  async function doRollover() {
    if (!currentYearObj || !selectedToYear) return
    setRolling(true); setError('')
    try {
      const r = await fetch('/api/academic-years/rollover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          from_year_id: currentYearObj.id,
          to_year_id: selectedToYear,
          final_grade: finalGrade || null,
          grade_sequence: sequence,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setResult(d)
      setStep('done')
      await init()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rollover failed')
      setStep('configure')
    } finally {
      setRolling(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">Academic Year Rollover</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Advance all students to next year — every student's history is permanently recorded before promotion
        </p>
      </div>

      {/* How it works */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
        <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest mb-3">How this works</p>
        <div className="grid grid-cols-4 gap-3 text-center">
          {[
            { step: '1', label: 'Snapshot', desc: 'Every student\'s current grade is archived permanently under the current year' },
            { step: '2', label: 'Promote', desc: 'Each student\'s grade is incremented (6→7, 7→8, etc.) automatically' },
            { step: '3', label: 'Graduate', desc: 'Final grade students are marked Graduated — not just updated' },
            { step: '4', label: 'Switch Year', desc: 'New academic year becomes active — full history preserved' },
          ].map(s => (
            <div key={s.step} className="bg-white rounded-xl p-3 shadow-sm">
              <div className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-2">{s.step}</div>
              <p className="text-xs font-semibold text-gray-700 mb-1">{s.label}</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* ── DONE STATE ────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="bg-white border-2 border-green-200 rounded-2xl p-8 text-center space-y-5">
          <div className="text-5xl">🎓</div>
          <h3 className="text-xl font-bold text-gray-800">Rollover Complete!</h3>
          <p className="text-sm text-gray-500">{result.message}</p>
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-3xl font-black text-blue-600">{result.snapshotted}</p>
              <p className="text-xs text-gray-500 mt-1">History Records Created</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-3xl font-black text-green-600">{result.promoted}</p>
              <p className="text-xs text-gray-500 mt-1">Students Promoted</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4">
              <p className="text-3xl font-black text-purple-600">{result.graduated}</p>
              <p className="text-xs text-gray-500 mt-1">Students Graduated</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-left max-w-lg mx-auto">
              <p className="text-xs font-semibold text-amber-700 mb-2">⚠ {result.errors.length} warning(s):</p>
              {result.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-amber-600">{e}</p>
              ))}
            </div>
          )}
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-green-700">
            <strong>Every student's previous class is now permanently recorded.</strong><br />
            Any student profile will show their full academic journey year by year.
          </div>
        </div>
      )}

      {step !== 'done' && (
        <div className="grid grid-cols-2 gap-5">

          {/* LEFT: Academic Years panel */}
          <div className="space-y-4">
            {/* Step indicator */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Steps to Rollover</p>
              {[
                { n: 1, label: 'Create this year (FROM)', done: !!currentYearObj, hint: currentYearObj ? `✓ ${currentYearObj.label} is current` : 'Create a year and click "Set as Current"' },
                { n: 2, label: 'Create next year (TO)',   done: years.filter(y => !y.is_current).length > 0, hint: years.filter(y => !y.is_current).length > 0 ? '✓ Year created — click "Select as Next Year"' : 'Create the next academic year below' },
                { n: 3, label: 'Select next year',        done: !!selectedToYear, hint: selectedToYear ? `✓ ${years.find(y => y.id === selectedToYear)?.label} selected` : 'Click "Select as Next Year" in the list below' },
              ].map(s => (
                <div key={s.n} className={`flex items-start gap-3 px-3 py-2 rounded-lg ${s.done ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${s.done ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                    {s.done ? '✓' : s.n}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${s.done ? 'text-green-700' : 'text-gray-700'}`}>{s.label}</p>
                    <p className="text-[10px] text-gray-400">{s.hint}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Create next year */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Create Next Academic Year</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Label (e.g. 2025-26)</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="2025-26"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newStart} onChange={e => setNewStart(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newEnd} onChange={e => setNewEnd(e.target.value)} />
                </div>
              </div>
              <button onClick={createYear} disabled={creatingYear || !newLabel.trim()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                {creatingYear ? 'Creating…' : '+ Create Year'}
              </button>
            </div>

            {/* All years list */}
            {years.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <p className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-50">All Academic Years</p>
                <div className="divide-y divide-gray-50">
                  {years.map(y => (
                    <div key={y.id}
                      className={`px-5 py-3 transition-colors ${
                        y.is_current ? 'bg-green-50/50' :
                        selectedToYear === y.id ? 'bg-indigo-50/60' : 'hover:bg-gray-50'
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${y.is_current ? 'bg-green-500' : selectedToYear === y.id ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800">{y.label}</p>
                          <p className="text-[10px] text-gray-400">{y.start_date} → {y.end_date}</p>
                          {y.student_snapshot_count > 0 && (
                            <p className="text-[10px] text-indigo-500">{y.student_snapshot_count} students archived</p>
                          )}
                        </div>
                        {/* Action buttons */}
                        <div className="flex gap-2 flex-shrink-0">
                          {y.is_current ? (
                            <span className="text-[10px] bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-bold">✓ CURRENT</span>
                          ) : (
                            <button
                              onClick={() => setAsCurrent(y.id)}
                              disabled={settingCurrent === y.id}
                              className="text-[10px] bg-green-100 hover:bg-green-200 text-green-700 px-2.5 py-1 rounded-full font-semibold transition-colors disabled:opacity-50"
                            >
                              {settingCurrent === y.id ? '…' : 'Set as Current'}
                            </button>
                          )}
                          {!y.is_current && (
                            selectedToYear === y.id ? (
                              <span className="text-[10px] bg-indigo-600 text-white px-2.5 py-1 rounded-full font-bold">✓ Next Year</span>
                            ) : (
                              <button
                                onClick={() => setSelectedToYear(y.id)}
                                className="text-[10px] bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2.5 py-1 rounded-full font-semibold transition-colors"
                              >
                                Select as Next Year →
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Promotion config + preview */}
          <div className="space-y-4">
            {/* Grade sequence */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grade Sequence</p>
              <p className="text-xs text-gray-400">Comma-separated, in order from lowest to highest. Students move to the next grade in this list.</p>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
                rows={3}
                value={sequenceStr}
                onChange={e => setSequenceStr(e.target.value)}
              />
              <div className="flex gap-1 flex-wrap">
                {sequence.map((g, i) => (
                  <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{g}</span>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Final Grade (graduates)</label>
                <input
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-28"
                  value={finalGrade}
                  onChange={e => setFinalGrade(e.target.value)}
                  placeholder="12"
                />
              </div>
            </div>

            {/* Promotion preview */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Promotion Preview</p>
                <span className="text-xs text-gray-400">{totalStudents} students total</span>
              </div>
              {groups.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No active students found</div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  {preview.map((g, i) => (
                    <div key={i} className={`flex items-center gap-3 px-5 py-2.5 text-sm ${g.isGrad ? 'bg-purple-50/50' : ''}`}>
                      <span className="text-gray-600 font-medium w-20">{g.grade}-{g.section}</span>
                      <span className="text-xs text-gray-400">{g.student_count} students</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        {g.isGrad ? (
                          <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">🎓 Graduate</span>
                        ) : g.to ? (
                          <>
                            <span className="text-gray-400 text-xs">{g.grade}</span>
                            <span className="text-indigo-400">→</span>
                            <span className="text-indigo-700 font-bold text-xs">{g.to}</span>
                          </>
                        ) : (
                          <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">⚠ Not in sequence</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex gap-4 text-xs text-gray-500">
                <span>🔼 {promoteStudents} promoted</span>
                <span>🎓 {gradStudents} graduate</span>
                <span>📚 {totalStudents} history records</span>
              </div>
            </div>

            {/* Execute button */}
            {step === 'setup' || step === 'configure' ? (
              <div className="space-y-3">
                {(!currentYearObj || !selectedToYear) && (
                  <div className="bg-amber-50 border border-amber-100 text-amber-700 text-xs px-4 py-3 rounded-xl space-y-1">
                    {!currentYearObj && <p>① Create a year → click <strong>"Set as Current"</strong> (this is the year students are in NOW)</p>}
                    {currentYearObj && !selectedToYear && <p>② Create the next year → click <strong>"Select as Next Year →"</strong></p>}
                  </div>
                )}
                <button
                  onClick={() => setStep('confirm')}
                  disabled={!currentYearObj || !selectedToYear || groups.length === 0}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-40"
                >
                  Review Rollover →
                </button>
              </div>
            ) : step === 'confirm' ? (
              <div className="bg-white border-2 border-red-200 rounded-xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="text-sm font-bold text-red-800">This cannot be undone</p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>{currentYearObj?.label}</strong> → <strong>{years.find(y => y.id === selectedToYear)?.label}</strong><br />
                      {promoteStudents} students promoted · {gradStudents} graduated · {totalStudents} history records written
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={doRollover} disabled={rolling}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-lg transition-colors disabled:opacity-50">
                    {rolling ? 'Processing…' : '✓ Execute Rollover'}
                  </button>
                  <button onClick={() => setStep('configure')}
                    className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
