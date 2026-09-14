'use client'

import { useCallback, useEffect, useState } from 'react'
import { FINAL_GRADE } from '@/lib/grades'
import type { ReceiptHeaderBlock } from './types'
import { escapeHtml, renderHeaderBlocks, writeAndPrint } from './receipts'
import { useFeeStore } from '@/lib/stores/feeStore'
import { LoadErrorBanner } from './LoadErrorBanner'

function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

type YearEndBill = { id: number; fee_category_id: number; category_name: string; period_label: string; amount_due: number; amount_paid: number; balance: number; due_date: string; status: string }
type YearEndStudent = { student_id: number; student_name: string; roll_number: string; grade: string; section: string; student_status: string; is_leaver: boolean; leaver_reason: string | null; total_unpaid: number; bills: YearEndBill[] }
type YearEndState = {
  academic_year: string
  summary: { total_billed: number; total_collected: number; total_waived: number; discretionary_waived?: number; total_unpaid: number }
  students: YearEndStudent[]
  unpaid_count: number
  target_year: string
  target_year_exists: boolean
  is_closed: boolean
  close_record: { closed_by: string; closed_at: string; carried_count?: number; carried_total: number; writeoff_count?: number; writeoff_total: number; open_count?: number; open_total: number } | null
}
type RolloverPreview = { requires_confirmation: boolean; pending_count: number; pending_total: number; message: string }

// Year-end closure: review outstanding dues, decide per-student (carry/write-off/
// passout/leave-open), apply, then close the year — plus the one-shot Year Rollover
// alternative. Subscribes to yearEndVersion from the shared fee store so a payment,
// waiver, or cancellation elsewhere invalidates this tab's data even while it isn't
// mounted. The other data this tab's own actions invalidate (stats, ledger, academic
// years list, passout ledger) still lives in the parent, so those go back up via
// callback props rather than the store — mirrors onViewYear/onCollect on the other
// already-extracted tabs.
export default function FeeYearEndTab({
  schoolId,
  academicYear,
  adminName,
  branding,
  onGoToSetup,
  onStatsChanged,
  onLedgerChanged,
  onAcademicYearsChanged,
  onPassoutChanged,
}: {
  schoolId: number
  academicYear: string
  adminName?: string
  branding: { school_name: string; logo_url: string | null; logo_align: 'left' | 'center' | 'right'; receipt_header_blocks: ReceiptHeaderBlock[] }
  onGoToSetup: () => void
  onStatsChanged: () => void
  onLedgerChanged: () => void
  onAcademicYearsChanged: () => void
  onPassoutChanged: () => void
}) {
  const yearEndVersion = useFeeStore(s => s.yearEndVersion)

  const [yearEnd, setYearEnd]               = useState<YearEndState | null>(null)
  const [yearEndLoading, setYearEndLoading] = useState(false)
  const [yearEndError, setYearEndError]     = useState('')
  // per-student decision: studentId -> 'carry' | 'writeoff' | 'open' | 'passout'
  const [yeDecisions, setYeDecisions]       = useState<Record<number, 'carry' | 'writeoff' | 'open' | 'passout'>>({})
  const [yeReasons, setYeReasons]           = useState<Record<number, string>>({})
  const [yeFilter, setYeFilter]             = useState<'all' | 'leavers' | 'continuing'>('all')
  const [yeProcessing, setYeProcessing]     = useState(false)
  const [yeMsg, setYeMsg]                   = useState('')
  const [yeCreateYearLoading, setYeCreateYearLoading] = useState(false)
  const [yeClosing, setYeClosing]           = useState(false)
  // Reopen year modal
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [reopenReason, setReopenReason]       = useState('')
  // Close year confirm modal
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  // Apply decisions confirm modal
  const [showApplyConfirm, setShowApplyConfirm] = useState(false)

  // Year rollover modal state
  const [showRolloverModal, setShowRolloverModal] = useState(false)
  const [rolloverPreview, setRolloverPreview] = useState<RolloverPreview | null>(null)
  const [rolloverLoading, setRolloverLoading] = useState(false)
  const [rolloverMsg, setRolloverMsg]         = useState('')
  const [rolloverDone, setRolloverDone]       = useState(false)

  // Carry-forward modal state (when target year doesn't exist)
  const [showCfModal, setShowCfModal]         = useState(false)
  const [cfExistingYears, setCfExistingYears] = useState<{ label: string; start_date: string; end_date: string }[]>([])
  const [cfSelectedYear, setCfSelectedYear]   = useState('')
  const [cfCreateMode, setCfCreateMode]       = useState(false)
  const [cfNewLabel, setCfNewLabel]           = useState('')
  const [cfNewStart, setCfNewStart]           = useState('')
  const [cfNewEnd, setCfNewEnd]               = useState('')
  const [cfCreating, setCfCreating]           = useState(false)
  const [cfMsg, setCfMsg]                     = useState('')

  const loadYearEnd = useCallback(async () => {
    if (!academicYear) return
    setYearEndLoading(true); setYeMsg('')
    try {
      const r = await fetch(`/api/fees/year-end?school_id=${schoolId}&academic_year=${academicYear}`)
      if (r.ok) {
        setYearEndError('')
        const d: YearEndState = await r.json()
        setYearEnd(d)
        // default every student to 'open' (admin decides each — no auto default action)
        const init: Record<number, 'carry' | 'writeoff' | 'open'> = {}
        d.students.forEach(s => { init[s.student_id] = 'open' })
        setYeDecisions(init)
      } else setYearEndError('Could not load year-end data — try refreshing')
    } catch { setYearEndError('Network error — year-end data could not be loaded') }
    finally { setYearEndLoading(false) }
  }, [schoolId, academicYear])

  useEffect(() => { loadYearEnd() }, [loadYearEnd, yearEndVersion])

  async function applyYearEndDecisions(overrideTargetYear?: string) {
    if (!yearEnd) return
    // Build decisions only for students who have an actionable (non-'open') decision
    const decisions = yearEnd.students
      .map(s => ({ student_id: s.student_id, decision: yeDecisions[s.student_id] || 'open', reason: yeReasons[s.student_id] }))
      .filter(d => d.decision === 'carry' || d.decision === 'writeoff' || d.decision === 'passout')
    if (decisions.length === 0) { setYeMsg('No carry-forward, write-off, or passout decisions selected.'); return }

    // Guard on client too: leavers cannot carry
    const badLeaver = yearEnd.students.find(s => s.is_leaver && yeDecisions[s.student_id] === 'carry')
    if (badLeaver) { setYeMsg(`${badLeaver.student_name} is leaving — cannot carry forward. Choose Passout, Write Off, or Leave Open.`); return }

    const targetYear = overrideTargetYear ?? yearEnd.target_year
    if (decisions.some(d => d.decision === 'carry') && !overrideTargetYear && !yearEnd.target_year_exists) {
      openCfModal(); return
    }

    setYeProcessing(true); setYeMsg('')
    const r = await fetch('/api/fees/year-end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'apply', school_id: schoolId, from_year: academicYear,
        to_year: targetYear, done_by: adminName || 'Admin', decisions,
      }),
    })
    const d = await r.json()
    if (r.ok) {
      const passoutPart = d.passout?.count > 0 ? `, ${d.passout.count} to passout ledger (${fmt(d.passout.total)})` : ''
      const closedPart = d.closed ? ` — ${academicYear} is now fully resolved and closed.` : ''
      setYeMsg(`✓ Applied — ${d.carried.count} carried (${fmt(d.carried.total)}), ${d.writeoff.count} written off (${fmt(d.writeoff.total)})${passoutPart}${closedPart}`)
      loadYearEnd(); onStatsChanged(); onLedgerChanged()
      if (d.closed) onAcademicYearsChanged()
      if (d.passout?.count > 0) onPassoutChanged()
    } else {
      setYeMsg(d.error || 'Failed to apply')
    }
    setYeProcessing(false)
  }

  async function closeYear() {
    setYeClosing(true); setYeMsg('')
    const r = await fetch('/api/fees/year-end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', school_id: schoolId, from_year: academicYear, done_by: adminName || 'Admin' }),
    })
    const d = await r.json()
    setYeMsg(r.ok ? '✓ Financial year closed and locked' : (d.error || 'Failed to close'))
    setYeClosing(false)
    if (r.ok) {
      loadYearEnd()
    }
  }

  // Two-phase year rollover: phase 1 = preview pending dues, phase 2 = confirm → execute
  async function startRollover() {
    setRolloverLoading(true); setRolloverMsg(''); setRolloverPreview(null); setRolloverDone(false)
    const r = await fetch('/api/fees/year-rollover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, from_year: academicYear }),
    })
    const d = await r.json()
    setRolloverLoading(false)
    if (d.requires_confirmation) {
      setRolloverPreview(d)
    } else if (r.ok) {
      // No pending dues — rolled over immediately
      setRolloverDone(true)
      setRolloverMsg(`✓ Rolled over to ${d.to_year} — ${d.dues_carried} student${d.dues_carried !== 1 ? 's' : ''} carried (${fmt(d.dues_amount)})`)
      loadYearEnd(); onStatsChanged(); onAcademicYearsChanged(); onLedgerChanged()
    } else {
      setRolloverMsg(d.error || 'Rollover failed')
    }
  }

  async function confirmRollover() {
    setRolloverLoading(true); setRolloverMsg('')
    const r = await fetch('/api/fees/year-rollover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, from_year: academicYear, confirmed: true }),
    })
    const d = await r.json()
    setRolloverLoading(false)
    if (r.ok) {
      setRolloverDone(true)
      setRolloverPreview(null)
      setRolloverMsg(`✓ Rolled over to ${d.to_year} — ${d.dues_carried} student${d.dues_carried !== 1 ? 's' : ''} carried (${fmt(d.dues_amount)})`)
      loadYearEnd(); onStatsChanged(); onAcademicYearsChanged(); onLedgerChanged()
    } else {
      setRolloverMsg(d.error || 'Rollover failed')
    }
  }

  async function reopenYear() {
    if (!reopenReason.trim()) return
    setShowReopenModal(false)
    setYeClosing(true); setYeMsg('')
    const r = await fetch('/api/fees/year-end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reopen', school_id: schoolId, from_year: academicYear, done_by: adminName || 'Admin', reason: reopenReason }),
    })
    const d = await r.json()
    setYeMsg(r.ok ? '✓ Year reopened — edits allowed again' : (d.error || 'Failed'))
    setReopenReason('')
    setYeClosing(false)
    if (r.ok) loadYearEnd()
  }

  // ── Carry-forward modal: open it and load existing years ────────────────────────
  async function openCfModal() {
    setCfMsg(''); setCfCreateMode(false); setCfSelectedYear(''); setShowCfModal(true)
    try {
      const r = await fetch(`/api/academic-years?school_id=${schoolId}`)
      if (r.ok) {
        const all = await r.json()
        setCfExistingYears(Array.isArray(all) ? all : [])
      } else {
        setCfMsg('Could not load existing academic years — you can still create a new one below')
      }
    } catch { setCfMsg('Network error — could not load existing academic years') }
  }

  async function createYearInCfModal() {
    if (!cfNewLabel.trim() || !cfNewStart || !cfNewEnd) { setCfMsg('All fields required'); return }
    setCfCreating(true); setCfMsg('')
    const r = await fetch('/api/academic-years', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, label: cfNewLabel.trim(), start_date: cfNewStart, end_date: cfNewEnd }),
    })
    const d = await r.json()
    if (r.ok) {
      const all = await fetch(`/api/academic-years?school_id=${schoolId}`).then(x => x.ok ? x.json() : [])
      setCfExistingYears(Array.isArray(all) ? all : [])
      setCfSelectedYear(cfNewLabel.trim())
      setCfCreateMode(false)
      setCfNewLabel(''); setCfNewStart(''); setCfNewEnd('')
      onAcademicYearsChanged()
    } else {
      setCfMsg(d.error || 'Failed')
    }
    setCfCreating(false)
  }

  // Year-end view helpers
  const visibleYeStudents = (yearEnd?.students || []).filter(s =>
    yeFilter === 'all' ? true : yeFilter === 'leavers' ? s.is_leaver : !s.is_leaver
  )
  function startYearLabel(label: string) { return label.split('-')[0] }

  function printYearEndStatement() {
    if (!yearEnd) return
    const s = yearEnd.summary
    const carryN = Object.values(yeDecisions).filter(d => d === 'carry').length
    const woN = Object.values(yeDecisions).filter(d => d === 'writeoff').length
    const openN = Object.values(yeDecisions).filter(d => d === 'open').length
    const rows = yearEnd.students.map(st => `<tr>
      <td>${st.student_name}</td><td>Gr.${st.grade}${st.section}</td>
      <td style="text-align:right">₹${Number(st.total_unpaid).toLocaleString('en-IN')}</td>
      <td>${st.is_leaver ? st.leaver_reason : 'Continuing'}</td>
      <td>${(yeDecisions[st.student_id] || 'open').replace('writeoff','Write Off').replace('carry','Carry Forward').replace('open','Leave Open')}</td>
    </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Year-End Statement ${escapeHtml(academicYear)}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:820px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:18px}
  .school{font-size:18px;font-weight:bold}
  .title{font-size:20px;font-weight:bold;margin-top:4px}.sub{font-size:13px;color:#555;margin-top:4px}
  .sumbox{display:flex;gap:12px;margin:18px 0}
  .sumbox div{flex:1;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center}
  .sumbox .l{font-size:11px;color:#888}.sumbox .v{font-size:15px;font-weight:bold;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f3f4f6;padding:8px;text-align:left;font-size:11px;border:1px solid #ddd}
  td{padding:7px 8px;font-size:12px;border:1px solid #eee}
  .ftr{margin-top:24px;text-align:center;font-size:11px;color:#aaa}
  @media print{body{padding:0}}
</style></head><body>
<div class="hdr">
  ${branding.logo_url ? `<div style="text-align:${branding.logo_align}"><img src="${escapeHtml(branding.logo_url)}" style="height:44px;margin-bottom:6px;object-fit:contain" /></div>` : ''}
  <div class="school">${escapeHtml(branding.school_name || 'School')}</div>
  ${renderHeaderBlocks(branding.receipt_header_blocks)}
  <div class="title">Year-End Financial Statement</div>
  <div class="sub">Academic Year ${escapeHtml(academicYear)}</div>
</div>
<div class="sumbox">
  <div><div class="l">Total Billed</div><div class="v">₹${Number(s.total_billed).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Collected</div><div class="v">₹${Number(s.total_collected).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Waived</div><div class="v">₹${Number(s.discretionary_waived ?? s.total_waived).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Unpaid</div><div class="v">₹${Number(s.total_unpaid).toLocaleString('en-IN')}</div></div>
</div>
<p style="font-size:12px;color:#555">Resolution plan: ${carryN} carry forward · ${woN} write off · ${openN} left open</p>
<table><thead><tr><th>Student</th><th>Class</th><th style="text-align:right">Unpaid</th><th>Status</th><th>Decision</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999">No unpaid dues</td></tr>'}</tbody></table>
<div class="ftr">Generated ${new Date().toLocaleString('en-IN')} · ${adminName || 'Admin'} · Computer-generated statement.</div>
</body></html>`
    const win = window.open('', '_blank', 'width=900,height=680')
    if (win) writeAndPrint(win, html)
  }

  return (
    <div className="space-y-5">
      <LoadErrorBanner message={yearEndError} onRetry={loadYearEnd} />
      <div>
        <h2 className="text-base font-semibold text-gray-800">Year-End Closure — {academicYear}</h2>
        <p className="text-xs text-gray-400 mt-0.5">Review the year, then roll over to the next — all dues carry forward automatically, students are promoted.</p>
      </div>

      {yearEndLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
      ) : !yearEnd ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <button onClick={loadYearEnd} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Load Year-End Review</button>
        </div>
      ) : (
        <>
          {/* Closed banner */}
          {yearEnd.is_closed && (
            <div className="bg-gray-800 text-white rounded-xl px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">🔒 {academicYear} is CLOSED</p>
                  <p className="text-xs text-gray-300 mt-0.5">
                    Closed by {yearEnd.close_record?.closed_by} on {yearEnd.close_record ? fmtDate(yearEnd.close_record.closed_at) : ''}
                    {' '}· Ledger and payments are locked.
                  </p>
                  {yearEnd.close_record && (
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      {(yearEnd.close_record.carried_count ?? 0) > 0 && (
                        <span>{yearEnd.close_record.carried_count} carried ({fmt(yearEnd.close_record.carried_total)})</span>
                      )}
                      {(yearEnd.close_record.writeoff_count ?? 0) > 0 && (
                        <span>{yearEnd.close_record.writeoff_count} written off ({fmt(yearEnd.close_record.writeoff_total)})</span>
                      )}
                      {(yearEnd.close_record.open_count ?? 0) > 0 && (
                        <span>{yearEnd.close_record.open_count} left open ({fmt(yearEnd.close_record.open_total)})</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setReopenReason(''); setShowReopenModal(true) }} disabled={yeClosing}
                    className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg hover:bg-gray-500 disabled:opacity-50">
                    {yeClosing ? 'Working…' : 'Reopen'}
                  </button>
                  <button
                    data-testid="btn-start-rollover"
                    onClick={() => { setShowRolloverModal(true); setRolloverPreview(null); setRolloverMsg(''); setRolloverDone(false) }}
                    className="text-xs bg-green-500 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-green-400">
                    Start Year Rollover →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 1 — Review summary */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Step 1 · Review</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { l: 'Total Billed', v: yearEnd.summary.total_billed,    c: 'text-gray-900' },
                { l: 'Collected',    v: yearEnd.summary.total_collected, c: 'text-green-700' },
                { l: 'Waived',       v: yearEnd.summary.discretionary_waived ?? yearEnd.summary.total_waived, c: 'text-purple-700' },
                { l: 'Still Unpaid', v: yearEnd.summary.total_unpaid,    c: 'text-red-600' },
              ].map(s => (
                <div key={s.l} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-xs text-gray-400">{s.l}</p>
                  <p className={`text-lg font-bold mt-0.5 ${s.c}`}>{fmt(s.v)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {yearEnd.students.length} students have unpaid dues ({yearEnd.unpaid_count} bills). Decide what to do with each below.
            </p>
          </div>

          {yearEnd.students.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-green-200 p-10 text-center">
              <p className="text-green-700 font-medium">All dues settled — nothing to resolve!</p>
              <p className="text-gray-400 text-sm mt-1">You can close the year directly in Step 3 below.</p>
            </div>
          ) : (
            <>
              {/* STEP 2 — Decide per student */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Step 2 · Decide each student</p>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                    {([
                      { key: 'all', label: `All (${yearEnd.students.length})` },
                      { key: 'continuing', label: `Continuing (${yearEnd.students.filter(s => !s.is_leaver).length})` },
                      { key: 'leavers', label: `Leaving (${yearEnd.students.filter(s => s.is_leaver).length})` },
                    ] as const).map(f => (
                      <button key={f.key} onClick={() => setYeFilter(f.key)}
                        className={`px-3 py-1 text-xs font-medium rounded-md ${yeFilter === f.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bulk helpers */}
                {!yearEnd.is_closed && (
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400">Bulk set visible:</span>
                    <button onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { if (!s.is_leaver) next[s.student_id] = 'carry' }); setYeDecisions(next) }}
                      className="text-xs border border-blue-200 text-blue-600 px-2.5 py-1 rounded-lg hover:bg-blue-50">All → Carry Forward</button>
                    <button onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { next[s.student_id] = 'writeoff' }); setYeDecisions(next) }}
                      className="text-xs border border-red-200 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50">All → Write Off</button>
                    <button onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { next[s.student_id] = 'open' }); setYeDecisions(next) }}
                      className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1 rounded-lg hover:bg-gray-100">All → Leave Open</button>
                  </div>
                )}

                <div className="divide-y divide-gray-50 max-h-[460px] overflow-y-auto">
                  {visibleYeStudents.map(s => {
                    const decision = yeDecisions[s.student_id] || 'open'
                    return (
                      <div key={s.student_id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-800">{s.student_name}</p>
                              <span className="text-xs text-gray-400">Gr.{s.grade}{s.section} · #{s.roll_number}</span>
                              {s.is_leaver && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">⚠ {s.leaver_reason}</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{s.bills.length} unpaid bill{s.bills.length > 1 ? 's' : ''}</p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-sm font-bold text-red-600">{fmt(s.total_unpaid)}</span>
                            {!yearEnd.is_closed && (
                              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                                <button
                                  onClick={() => !s.is_leaver && setYeDecisions(p => ({ ...p, [s.student_id]: 'carry' }))}
                                  disabled={s.is_leaver}
                                  title={s.is_leaver ? 'Leavers cannot carry forward — use Passout instead' : ''}
                                  className={`px-2.5 py-1 transition-colors ${decision === 'carry' ? 'bg-blue-600 text-white' : s.is_leaver ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                  Carry
                                </button>
                                {s.is_leaver && (
                                  <button
                                    onClick={() => setYeDecisions(p => ({ ...p, [s.student_id]: 'passout' }))}
                                    title="Move unpaid dues to the always-open Passout Ledger"
                                    className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${decision === 'passout' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-500 hover:bg-indigo-50'}`}>
                                    Passout
                                  </button>
                                )}
                                <button
                                  onClick={() => setYeDecisions(p => ({ ...p, [s.student_id]: 'writeoff' }))}
                                  className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${decision === 'writeoff' ? 'bg-red-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                  Write Off
                                </button>
                                <button
                                  onClick={() => setYeDecisions(p => ({ ...p, [s.student_id]: 'open' }))}
                                  className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${decision === 'open' ? 'bg-gray-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                  Leave Open
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* write-off reason inline */}
                        {!yearEnd.is_closed && decision === 'writeoff' && (
                          <input type="text" placeholder="Reason for write-off (recommended)…"
                            value={yeReasons[s.student_id] || ''}
                            onChange={e => setYeReasons(p => ({ ...p, [s.student_id]: e.target.value }))}
                            className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-red-300" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* STEP 3 — Carry target + apply */}
              {!yearEnd.is_closed && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Step 3 · Carry-forward target</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-gray-600">Carry unpaid dues forward to:</span>
                    <span className="text-sm font-bold text-gray-800">{yearEnd.target_year}</span>
                    {yearEnd.target_year_exists ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Year exists</span>
                    ) : (
                      <>
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⚠ Not created yet</span>
                        <button
                          disabled={yeCreateYearLoading}
                          onClick={async () => {
                            const startNum = parseInt(startYearLabel(yearEnd.target_year))
                            if (isNaN(startNum)) return
                            setYeCreateYearLoading(true)
                            const r = await fetch('/api/academic-years', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                school_id: schoolId,
                                label: yearEnd.target_year,
                                start_date: `${startNum}-04-01`,
                                end_date: `${startNum + 1}-03-31`,
                                set_current: false,
                              }),
                            })
                            setYeCreateYearLoading(false)
                            if (r.ok) { loadYearEnd(); onAcademicYearsChanged() }
                            else { const e = await r.json(); setYeMsg(e.error || 'Failed to create year') }
                          }}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                          {yeCreateYearLoading ? 'Creating…' : `Create ${yearEnd.target_year}`}
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    Carried dues become a single <strong>“Previous Year Dues ({academicYear})”</strong> bill on each student, due {startYearLabel(yearEnd.target_year)}-04-30. Works regardless of the student&apos;s new class.
                  </p>
                  {yeMsg && <p className={`text-sm font-medium ${yeMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{yeMsg}</p>}
                  {(() => {
                    const carryN   = Object.values(yeDecisions).filter(d => d === 'carry').length
                    const woN      = Object.values(yeDecisions).filter(d => d === 'writeoff').length
                    const passoutN = Object.values(yeDecisions).filter(d => d === 'passout').length
                    const total    = carryN + woN + passoutN
                    const label    = [
                      carryN   > 0 ? `${carryN} carry`   : '',
                      woN      > 0 ? `${woN} write off`  : '',
                      passoutN > 0 ? `${passoutN} passout` : '',
                    ].filter(Boolean).join(', ')
                    return (
                      <button data-testid="btn-apply-yearend" onClick={() => setShowApplyConfirm(true)} disabled={yeProcessing || total === 0}
                        className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                        {yeProcessing ? 'Applying…' : `Apply Decisions (${label || 'none'})`}
                      </button>
                    )
                  })()}
                </div>
              )}
            </>
          )}

          {/* STEP 4 & 5 — Statement + Close */}
          {!yearEnd.is_closed && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Step 4 · Statement &amp; Close</p>
              <p className="text-xs text-gray-500">
                Print the year-end financial statement for your records, then close the year. Closing locks {academicYear} —
                no further payments or edits until reopened. Any students still “Leave Open” keep their dues unresolved.
              </p>
              <div className="flex items-center gap-2">
                <button onClick={printYearEndStatement}
                  className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">🖨 Print Statement</button>
                <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger`} download
                  className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">Export Ledger CSV</a>
                <button data-testid="btn-close-year" onClick={() => setShowCloseConfirm(true)}
                  disabled={yeClosing}
                  className="ml-auto text-sm bg-gray-800 text-white px-5 py-2 rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50">
                  {yeClosing ? 'Closing…' : `🔒 Close Financial Year ${academicYear}`}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Carry-forward modal (target year missing) ── */}
      {showCfModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Select Target Academic Year for Carry Forward</h2>
              <button onClick={() => setShowCfModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <p className="text-sm text-gray-600">The next year <strong>{yearEnd?.target_year}</strong> doesn&apos;t exist yet. Select an existing year or create a new one to carry unpaid dues into.</p>

            {!cfCreateMode ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Select Year</label>
                  <select data-testid="cf-year-select" value={cfSelectedYear} onChange={e => setCfSelectedYear(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Choose a year —</option>
                    {cfExistingYears.filter(y => y.label !== academicYear).map(y => (
                      <option key={y.label} value={y.label}>{y.label} ({y.start_date?.slice(0,10)} → {y.end_date?.slice(0,10)})</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => setCfCreateMode(true)} className="text-sm text-blue-600 hover:underline">+ Create new academic year instead</button>
                {cfMsg && <p className="text-sm text-red-600">{cfMsg}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowCfModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                  <button data-testid="cf-confirm" disabled={!cfSelectedYear} onClick={() => {
                    if (!yearEnd) return
                    setShowCfModal(false)
                    applyYearEndDecisions(cfSelectedYear)
                  }} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                    Confirm & Carry Forward
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Year Label (e.g. 2026-27)</label>
                  <input data-testid="cf-new-label" value={cfNewLabel} onChange={e => setCfNewLabel(e.target.value)}
                    placeholder="2026-27" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                    <input data-testid="cf-new-start" type="date" value={cfNewStart} onChange={e => setCfNewStart(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                    <input data-testid="cf-new-end" type="date" value={cfNewEnd} onChange={e => setCfNewEnd(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                {cfMsg && <p className="text-sm text-red-600">{cfMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setCfCreateMode(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Back</button>
                  <button data-testid="cf-create-year" onClick={createYearInCfModal} disabled={cfCreating}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {cfCreating ? 'Creating…' : 'Create Year'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Year Rollover Modal ═════════════════════════════════════════════════ */}
      {showRolloverModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget && !rolloverLoading) setShowRolloverModal(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Year Rollover — {academicYear}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Creates next academic year and carries forward unpaid dues</p>
              </div>
              {!rolloverLoading && (
                <button onClick={() => setShowRolloverModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              )}
            </div>

            {!rolloverPreview && !rolloverDone && !rolloverMsg && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1.5">
                  <p className="font-semibold">What this does:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Creates the next academic year and sets it as current</li>
                    <li>Carries all remaining unpaid dues forward as &quot;Previous Year Dues&quot;</li>
                    <li>Grade {FINAL_GRADE} students and leavers are excluded from auto-carry</li>
                  </ul>
                </div>
                <p className="text-xs text-gray-500">This is irreversible. Make sure all year-end decisions (carry / write-off / passout) are applied first.</p>
                <button
                  data-testid="btn-rollover-preview"
                  onClick={startRollover}
                  disabled={rolloverLoading}
                  className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                  {rolloverLoading ? 'Checking…' : 'Check & Start Rollover'}
                </button>
              </div>
            )}

            {rolloverPreview && !rolloverDone && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-800 mb-1">Pending dues will be carried forward</p>
                  <p className="text-xs text-blue-700">{rolloverPreview.pending_count} ledger entries · {fmt(rolloverPreview.pending_total)} will become &quot;Previous Year Dues&quot; in the new year</p>
                </div>
                <p className="text-xs text-gray-500">Confirm to proceed. This cannot be undone without reopening the year.</p>
                {rolloverMsg && <p className="text-sm text-red-600">{rolloverMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setRolloverPreview(null) }} disabled={rolloverLoading}
                    className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    data-testid="btn-rollover-confirm"
                    onClick={confirmRollover}
                    disabled={rolloverLoading}
                    className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                    {rolloverLoading ? 'Rolling over…' : `Confirm — Carry ${rolloverPreview.pending_count} entries`}
                  </button>
                </div>
              </div>
            )}

            {(rolloverDone || (rolloverMsg && !rolloverPreview)) && (
              <div className="space-y-4">
                <p className={`text-sm font-medium ${rolloverMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{rolloverMsg}</p>
                {rolloverDone && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                    Rollover complete. The new academic year is now active. Go to the Setup tab to generate fee bills for the new year.
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setShowRolloverModal(false)}
                    className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">
                    Close
                  </button>
                  {rolloverDone && (
                    <button onClick={() => { setShowRolloverModal(false); onGoToSetup() }}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-blue-700">
                      Go to Setup →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Reopen Year Modal ════════════════════════════════════════════════════ */}
      {showReopenModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowReopenModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-base font-bold text-gray-900">Reopen {academicYear}?</p>
              <p className="text-xs text-gray-400 mt-1">This unlocks the year for edits. The reason is logged permanently.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Reason (required)</label>
              <input autoFocus type="text" value={reopenReason} onChange={e => setReopenReason(e.target.value)}
                placeholder="e.g. Correction of waiver entry"
                className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowReopenModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={reopenYear} disabled={!reopenReason.trim() || yeClosing}
                className="flex-1 bg-amber-500 text-white py-2 rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
                {yeClosing ? 'Reopening…' : 'Confirm Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Close Year Confirm Modal ══════════════════════════════════════════════ */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCloseConfirm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-base font-bold text-gray-900">Close {academicYear}?</p>
              <p className="text-sm text-gray-500 mt-1">This locks the year — no new payments or waivers can be added. You can reopen it later if needed.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCloseConfirm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => { setShowCloseConfirm(false); closeYear() }} disabled={yeClosing}
                className="flex-1 bg-gray-800 text-white py-2 rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50">
                {yeClosing ? 'Closing…' : `Close ${academicYear}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Apply Year-End Decisions Confirm Modal ════════════════════════════════ */}
      {showApplyConfirm && yearEnd && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowApplyConfirm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-base font-bold text-gray-900">Apply Year-End Decisions?</p>
              <p className="text-xs text-gray-400 mt-1">This action modifies student ledgers and cannot be undone without reopening the year.</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1 text-sm">
              {(() => {
                const carryN   = Object.values(yeDecisions).filter(d => d === 'carry').length
                const woN      = Object.values(yeDecisions).filter(d => d === 'writeoff').length
                const passoutN = Object.values(yeDecisions).filter(d => d === 'passout').length
                return <>
                  {carryN   > 0 && <p className="text-blue-700"><strong>{carryN}</strong> student{carryN !== 1 ? 's' : ''} — carry dues to {yearEnd.target_year}</p>}
                  {woN      > 0 && <p className="text-red-600"><strong>{woN}</strong> student{woN !== 1 ? 's' : ''} — write off outstanding dues</p>}
                  {passoutN > 0 && <p className="text-indigo-700"><strong>{passoutN}</strong> student{passoutN !== 1 ? 's' : ''} — move to passout ledger</p>}
                </>
              })()}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowApplyConfirm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => { setShowApplyConfirm(false); applyYearEndDecisions() }} disabled={yeProcessing}
                className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {yeProcessing ? 'Applying…' : 'Confirm & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
