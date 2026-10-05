'use client'

import { rollLabel, plural } from './format'
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
type YearEndStudent = { student_id: number; student_name: string; roll_number: string; school_roll_number?: number | null; grade: string; section: string; student_status: string; is_leaver: boolean; leaver_reason: string | null; total_unpaid: number; bills: YearEndBill[] }
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

type SignoffRequest = { id: number; student_id: number; student_name: string; grade: string; section: string; amount: string; reason: string | null; status: 'pending' | 'approved' | 'rejected' | 'applied'; requested_by: string | null; decided_by: string | null; decision_note: string | null }
type Signoff = { approval_required: boolean; settings: { writeoff_limit: number }; approver_name: string | null; owner_name: string | null; can_approve: boolean; my_user_id: number; requests: SignoffRequest[] }

// Year-end closure: review outstanding dues, decide per-student (carry/write-off/
// passout/leave-open), apply, then close the year. Creating the next academic year, promoting
// students and switching the active year live in the Year Rollover tab, which requires this
// year to be closed first. Subscribes to yearEndVersion from the shared fee store so a payment,
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
  onGoToYearRollover,
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
  onGoToYearRollover: () => void
  onStatsChanged: () => void
  onLedgerChanged: () => void
  onAcademicYearsChanged: () => void
  onPassoutChanged: () => void
}) {
  const yearEndVersion = useFeeStore(s => s.yearEndVersion)
  const bumpReports = useFeeStore(s => s.bumpReports)

  const [yearEnd, setYearEnd]               = useState<YearEndState | null>(null)
  const [yearEndLoading, setYearEndLoading] = useState(false)
  const [yearEndError, setYearEndError]     = useState('')
  // per-student decision: studentId -> 'carry' | 'writeoff' | 'open' | 'passout'
  const [yeDecisions, setYeDecisions]       = useState<Record<number, 'carry' | 'writeoff' | 'open' | 'passout'>>({})
  const [yeReasons, setYeReasons]           = useState<Record<number, string>>({})
  const [yeFilter, setYeFilter]             = useState<'all' | 'leavers' | 'continuing'>('all')
  const [yeProcessing, setYeProcessing]     = useState(false)
  const [yeMsg, setYeMsg]                   = useState('')
  // Write-off sign-off (only when the school has an approver and at least two logins)
  const [signoff, setSignoff]               = useState<Signoff | null>(null)
  const [signoffBusy, setSignoffBusy]       = useState<number | null>(null)
  const [signoffMsg, setSignoffMsg]         = useState('')
  const [rejectNote, setRejectNote]         = useState<Record<number, string>>({})
  const [yeClosing, setYeClosing]           = useState(false)
  // Reopen year modal
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [reopenReason, setReopenReason]       = useState('')
  // Close year confirm modal
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  // Apply decisions confirm modal
  const [showApplyConfirm, setShowApplyConfirm] = useState(false)

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

  const loadSignoff = useCallback(async () => {
    if (!academicYear) return
    try {
      const r = await fetch(`/api/fees/year-end/writeoff-requests?school_id=${schoolId}&academic_year=${academicYear}`)
      if (r.ok) setSignoff(await r.json())
    } catch { /* sign-off panel just stays hidden */ }
  }, [schoolId, academicYear])
  useEffect(() => { loadSignoff() }, [loadSignoff, yearEndVersion])

  // Where a student's write-off stands: does it need sign-off, and has it been given?
  function signoffState(s: YearEndStudent): 'none' | 'needed' | 'pending' | 'approved' | 'rejected' {
    if (!signoff?.approval_required || s.total_unpaid <= signoff.settings.writeoff_limit) return 'none'
    const r = signoff.requests.find(x => x.student_id === s.student_id)
    if (!r) return 'needed'
    if (r.status === 'approved' && Number(r.amount) + 0.01 >= s.total_unpaid) return 'approved'
    if (r.status === 'pending') return 'pending'
    if (r.status === 'rejected') return 'rejected'
    return 'needed'   // applied earlier, or approved for a smaller amount — needs a fresh look
  }

  async function decideSignoff(id: number, action: 'approve' | 'reject') {
    setSignoffBusy(id); setSignoffMsg('')
    const r = await fetch('/api/fees/year-end/writeoff-requests', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, id, action, note: rejectNote[id] || '' }),
    })
    const d = await r.json()
    if (r.ok) { setSignoff(prev => prev ? { ...prev, requests: d.requests } : prev); setSignoffMsg(action === 'approve' ? '✓ Approved' : '✓ Rejected') }
    else setSignoffMsg(d.error || 'Could not save the decision')
    setSignoffBusy(null)
  }

  async function applyYearEndDecisions() {
    if (!yearEnd) return
    // Build decisions only for students who have an actionable (non-'open') decision
    const decisions = yearEnd.students
      .map(s => ({ student_id: s.student_id, decision: yeDecisions[s.student_id] || 'open', reason: yeReasons[s.student_id] }))
      .filter(d => d.decision === 'carry' || d.decision === 'writeoff' || d.decision === 'passout')
    if (decisions.length === 0) { setYeMsg('No carry-forward, write-off, or passout decisions selected.'); return }

    // Guard on client too: leavers cannot carry
    const badLeaver = yearEnd.students.find(s => s.is_leaver && yeDecisions[s.student_id] === 'carry')
    if (badLeaver) { setYeMsg(`${badLeaver.student_name} is leaving — cannot carry forward. Choose Passout, Write Off, or Leave Open.`); return }

    const targetYear = yearEnd.target_year
    if (decisions.some(d => d.decision === 'carry') && !yearEnd.target_year_exists) {
      setYeMsg(`${yearEnd.target_year} does not exist yet — create it in the Year Rollover tab first, then carry the dues forward.`)
      return
    }

    setYeProcessing(true); setYeMsg('')

    // Large write-offs go to the approver first; everything else is applied now.
    let toApply = decisions
    let sentForSignoff = 0
    if (signoff?.approval_required) {
      const waiting = decisions.filter(d => {
        if (d.decision !== 'writeoff') return false
        const st = yearEnd.students.find(s => s.student_id === d.student_id)
        const state = st ? signoffState(st) : 'none'
        return state === 'needed' || state === 'pending' || state === 'rejected'
      })
      if (waiting.length > 0) {
        const missing = waiting.find(d => (d.reason ?? '').trim().length < 3)
        if (missing) {
          const nm = yearEnd.students.find(s => s.student_id === missing.student_id)?.student_name
          setYeMsg(`Write a reason for ${nm}'s write-off — the approver needs it to sign off.`)
          setYeProcessing(false); return
        }
        const fresh = waiting.filter(d => signoffState(yearEnd.students.find(s => s.student_id === d.student_id)!) !== 'pending')
        if (fresh.length > 0) {
          const rr = await fetch('/api/fees/year-end/writeoff-requests', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, items: fresh.map(d => ({ student_id: d.student_id, reason: d.reason })) }),
          })
          const rd = await rr.json()
          if (!rr.ok) { setYeMsg(rd.error || 'Could not send the write-offs for sign-off'); setYeProcessing(false); return }
          sentForSignoff = fresh.length
        }
        const waitingIds = new Set(waiting.map(w => w.student_id))
        toApply = decisions.filter(d => !waitingIds.has(d.student_id))
        await loadSignoff()
        if (toApply.length === 0) {
          setYeMsg(`${sentForSignoff > 0 ? `Sent ${sentForSignoff} write-off${sentForSignoff === 1 ? '' : 's'} to ${signoff.approver_name ?? 'the approver'} for sign-off. ` : ''}Nothing else to apply — come back once ${waiting.length === 1 ? 'it is' : 'they are'} approved.`)
          setYeProcessing(false); return
        }
      }
    }

    const r = await fetch('/api/fees/year-end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'apply', school_id: schoolId, from_year: academicYear,
        to_year: targetYear, done_by: adminName || 'Admin', decisions: toApply,
      }),
    })
    const d = await r.json()
    if (r.ok) {
      const passoutPart = d.passout?.count > 0 ? `, ${d.passout.count} to passout ledger (${fmt(d.passout.total)})` : ''
      const closedPart = d.closed ? ` — ${academicYear} is now fully resolved and closed.` : ''
      const signoffPart = sentForSignoff > 0 ? ` ${sentForSignoff} write-off${sentForSignoff === 1 ? ' was' : 's were'} sent to ${signoff?.approver_name ?? 'the approver'} for sign-off.` : ''
      setYeMsg(`✓ Applied — ${d.carried.count} carried (${fmt(d.carried.total)}), ${d.writeoff.count} written off (${fmt(d.writeoff.total)})${passoutPart}${closedPart}${signoffPart}`)
      loadYearEnd(); loadSignoff(); onStatsChanged(); onLedgerChanged(); bumpReports()
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
        <p className="text-xs text-gray-400 mt-0.5">Decide each student’s dues, then close the year. Once it is closed, run the Year Rollover tab to promote students and move the whole school to the new year.</p>
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
                  <button data-testid="btn-yearend-reopen" onClick={() => { setReopenReason(''); setShowReopenModal(true) }} disabled={yeClosing}
                    className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg hover:bg-gray-500 disabled:opacity-50">
                    {yeClosing ? 'Working…' : 'Reopen'}
                  </button>
                  <button data-testid="btn-yearend-go-year-rollover" onClick={onGoToYearRollover}
                    className="text-xs bg-green-500 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-green-400">
                    Next: Year Rollover →
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
              {plural(yearEnd.students.length, 'student')} {yearEnd.students.length === 1 ? 'has' : 'have'} unpaid dues ({plural(yearEnd.unpaid_count, 'bill')}). Decide what to do with each below.
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
                    <button data-testid="btn-yearend-bulk-carry" onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { if (!s.is_leaver) next[s.student_id] = 'carry' }); setYeDecisions(next) }}
                      className="text-xs border border-blue-200 text-blue-600 px-2.5 py-1 rounded-lg hover:bg-blue-50">All → Carry Forward</button>
                    <button data-testid="btn-yearend-bulk-writeoff" onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { next[s.student_id] = 'writeoff' }); setYeDecisions(next) }}
                      className="text-xs border border-red-200 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50">All → Write Off</button>
                    <button data-testid="btn-yearend-bulk-open" onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { next[s.student_id] = 'open' }); setYeDecisions(next) }}
                      className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1 rounded-lg hover:bg-gray-100">All → Leave Open</button>
                  </div>
                )}

                <div className="divide-y divide-gray-50 max-h-[460px] overflow-y-auto">
                  {visibleYeStudents.map(s => {
                    const decision = yeDecisions[s.student_id] || 'open'
                    return (
                      <div key={s.student_id} className="px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-800">{s.student_name}</p>
                              <span className="text-xs text-gray-400">Gr.{s.grade}{s.section}{rollLabel(s.school_roll_number) ? ` · ${rollLabel(s.school_roll_number)}` : ''}</span>
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
                                  data-testid={`btn-yearend-decision-carry-${s.student_id}`}
                                  onClick={() => !s.is_leaver && setYeDecisions(p => ({ ...p, [s.student_id]: 'carry' }))}
                                  disabled={s.is_leaver}
                                  title={s.is_leaver ? 'Leavers cannot carry forward — use Passout instead' : ''}
                                  className={`px-2.5 py-1 transition-colors ${decision === 'carry' ? 'bg-blue-600 text-white' : s.is_leaver ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                  Carry
                                </button>
                                {s.is_leaver && (
                                  <button
                                    data-testid={`btn-yearend-decision-passout-${s.student_id}`}
                                    onClick={() => setYeDecisions(p => ({ ...p, [s.student_id]: 'passout' }))}
                                    title="Move unpaid dues to the always-open Passout Ledger"
                                    className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${decision === 'passout' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-500 hover:bg-indigo-50'}`}>
                                    Passout
                                  </button>
                                )}
                                <button
                                  data-testid={`btn-yearend-decision-writeoff-${s.student_id}`}
                                  onClick={() => setYeDecisions(p => ({ ...p, [s.student_id]: 'writeoff' }))}
                                  className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${decision === 'writeoff' ? 'bg-red-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                  Write Off
                                </button>
                                <button
                                  data-testid={`btn-yearend-decision-open-${s.student_id}`}
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
                          <>
                            <input type="text" placeholder={signoffState(s) === 'none' ? 'Reason for write-off (recommended)…' : 'Reason for write-off (required — the approver sees this)…'}
                              value={yeReasons[s.student_id] || ''}
                              onChange={e => setYeReasons(p => ({ ...p, [s.student_id]: e.target.value }))}
                              className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-red-300" />
                            {signoffState(s) !== 'none' && (
                              <p data-testid={`signoff-state-${s.student_id}`} className={`mt-1 text-xs font-medium ${
                                signoffState(s) === 'approved' ? 'text-green-700' : signoffState(s) === 'rejected' ? 'text-red-600' : 'text-amber-700'}`}>
                                {signoffState(s) === 'needed' && `Above ₹${signoff!.settings.writeoff_limit.toLocaleString('en-IN')} — Apply will send this to ${signoff!.approver_name ?? 'the approver'} for sign-off.`}
                                {signoffState(s) === 'pending' && `Waiting for ${signoff!.approver_name ?? 'the approver'} to sign off.`}
                                {signoffState(s) === 'approved' && '✓ Signed off — it will be applied.'}
                                {signoffState(s) === 'rejected' && `Rejected${signoff!.requests.find(x => x.student_id === s.student_id)?.decision_note ? `: ${signoff!.requests.find(x => x.student_id === s.student_id)!.decision_note}` : ''} — choose another action.`}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Write-off sign-off: who has asked for what, and the approver's buttons */}
              {signoff?.approval_required && signoff.requests.length > 0 && (
                <div data-testid="signoff-card" className="bg-white rounded-xl border border-amber-200 p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Write-off sign-off</p>
                    <p className="text-xs text-gray-500">
                      Write-offs above ₹{signoff.settings.writeoff_limit.toLocaleString('en-IN')} are signed off by <strong>{signoff.approver_name ?? 'the approver'}</strong>
                      {signoff.can_approve ? ' — that is you.' : '.'}
                    </p>
                  </div>
                  {signoffMsg && <p className={`text-sm font-medium ${signoffMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{signoffMsg}</p>}
                  <div className="divide-y divide-gray-50">
                    {signoff.requests.map(rq => (
                      <div key={rq.id} data-testid={`signoff-row-${rq.student_id}`} className="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">{rq.student_name} <span className="text-xs text-gray-400">Gr.{rq.grade}{rq.section}</span> · <span className="text-red-600">{fmt(rq.amount)}</span></p>
                          <p className="text-xs text-gray-500">{rq.reason || '—'} · asked by {rq.requested_by || '—'}</p>
                          {rq.decided_by && <p className="text-xs text-gray-400">{rq.status === 'rejected' ? 'Rejected' : 'Approved'} by {rq.decided_by}{rq.decision_note ? ` — ${rq.decision_note}` : ''}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${rq.status === 'approved' ? 'bg-green-100 text-green-700' : rq.status === 'rejected' ? 'bg-red-100 text-red-700' : rq.status === 'applied' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>{rq.status === 'pending' ? 'waiting' : rq.status}</span>
                          {rq.status === 'pending' && signoff.can_approve && (
                            <>
                              <input type="text" placeholder="Note (needed to reject)" value={rejectNote[rq.id] || ''} onChange={e => setRejectNote(p => ({ ...p, [rq.id]: e.target.value }))}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-40" />
                              <button data-testid={`signoff-approve-${rq.student_id}`} disabled={signoffBusy === rq.id} onClick={() => decideSignoff(rq.id, 'approve')}
                                className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">Approve</button>
                              <button data-testid={`signoff-reject-${rq.student_id}`} disabled={signoffBusy === rq.id} onClick={() => decideSignoff(rq.id, 'reject')}
                                className="text-xs border border-red-300 text-red-600 px-3 py-1 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50">Reject</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                        <span data-testid="yearend-target-missing" className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⚠ Not created yet — create it in the Year Rollover tab</span>
                        <button data-testid="btn-yearend-open-year-rollover" onClick={onGoToYearRollover}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-blue-700">
                          Open Year Rollover →
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
