'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { GRADE_SEQUENCE } from '@/lib/grades'
import { isValidName, NAME_INVALID_MESSAGE } from '@/lib/nameValidation'

type Props = { schoolId: number; onRefresh?: () => void }

type TeacherRow = {
  name: string
  email: string
  subject: string
  phone: string
  department: string
  qualification: string
  date_of_joining: string
  staff_type: string
  teaches_grades: string
}

const EMPTY_ROW: TeacherRow = {
  name: '', email: '', subject: '', phone: '',
  department: '', qualification: '', date_of_joining: '', staff_type: 'teaching',
  teaches_grades: ''
}

const ALL_GRADES = GRADE_SEQUENCE.filter(g => /^\d+$/.test(g))

function normalizeStaffType(raw: string): string {
  const v = raw.toLowerCase().replace(/[\s\-]/g, '_')
  return v.includes('non') ? 'non_teaching' : 'teaching'
}

// Excel template with a real in-cell Subject dropdown (limited to the
// school's subscribed subjects) — the plain-CSV template above can't carry a
// dropdown at all, so a school that wants that protection downloads this
// instead, fills it in Excel, and uploads the same .xlsx file back.
function downloadExcelTemplate(schoolId: number) {
  const a = document.createElement('a')
  a.href = `/api/teachers/template?school_id=${schoolId}`
  a.download = 'staff_template.xlsx'
  a.click()
}

// Inline grade multi-select for table rows. This is always the last real
// column before the row's delete button, inside a horizontally-scrolling
// table — any `absolute`-positioned popover here is still clipped by the
// table's own overflow-x-auto no matter which edge it's anchored to (grades
// 9/10 cut off, panel invisible entirely near the right edge). Rendered
// through a portal to document.body instead, positioned in fixed viewport
// coordinates computed from the trigger's own rect, so the table's overflow
// can never clip it.
function InlineGrades({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []
  const PANEL_WIDTH = 240

  const updatePosition = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    // Right-align the panel to the trigger, but never let it run off the
    // left edge of the viewport on a narrow screen.
    const left = Math.max(8, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8))
    setPos({ top: r.bottom + 6, left })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    function onClickOutside(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    function onScrollOrResize() { updatePosition() }
    document.addEventListener('mousedown', onClickOutside)
    // capture:true so this also fires for scroll on the table's own
    // overflow-x-auto container, not just window-level scroll.
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, updatePosition])

  function toggle(g: string) {
    const next = selected.includes(g) ? selected.filter(x => x !== g) : [...selected, g]
    onChange(next.sort((a, b) => parseInt(a) - parseInt(b)).join(','))
  }

  const allSelected = selected.length === ALL_GRADES.length

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(v => !v)}
        data-testid="teaches-grades-trigger"
        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs text-left bg-white transition-colors flex justify-between items-center gap-1.5 min-w-[120px] ${
          open ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200 hover:border-gray-300'
        }`}>
        <span className={`truncate ${selected.length ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
          {selected.length === 0 ? 'All grades' : allSelected ? 'All grades (1–10)' : `Grade${selected.length > 1 ? 's' : ''} ${selected.join(', ')}`}
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_WIDTH }}
          className="z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Teaches Grades</span>
            <span className="text-[10px] text-gray-400">{selected.length === 0 ? 'All grades' : `${selected.length} selected`}</span>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-5 gap-1.5">
              {ALL_GRADES.map(g => (
                <button key={g} type="button" onClick={() => toggle(g)}
                  data-testid={`teaches-grade-${g}`}
                  className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                    selected.includes(g) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50">
            <div className="flex gap-3">
              <button type="button" onClick={() => onChange(ALL_GRADES.join(','))}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium">Select all</button>
              <button type="button" onClick={() => onChange('')}
                className="text-[11px] text-gray-500 hover:text-gray-700 font-medium">Clear</button>
            </div>
            <button type="button" onClick={() => setOpen(false)}
              className="text-[11px] text-white bg-blue-600 hover:bg-blue-700 font-medium px-3 py-1 rounded-md">Done</button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function rowErrors(row: TeacherRow): string[] {
  const errs: string[] = []
  if (!row.name.trim()) errs.push('Name required')
  else if (!isValidName(row.name)) errs.push(`Name: ${NAME_INVALID_MESSAGE}`)
  if (!row.email.trim()) errs.push('Email required — login credentials will be sent here')
  if (row.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) errs.push('Invalid email')
  if (row.staff_type === 'teaching' && !row.subject.trim()) errs.push('Subject required for teaching staff')
  if (!row.phone.trim()) errs.push('Phone required')
  if (row.phone.trim() && !/^\+?[\d\s\-()\[\]]{7,15}$/.test(row.phone.trim())) errs.push('Invalid phone')
  return errs
}

export default function StaffOnboarding({ schoolId, onRefresh }: Props) {
  const [rows, setRows] = useState<TeacherRow[]>([{ ...EMPTY_ROW }])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; teachers: { employee_id: string }[]; errors: { row: number; message: string }[] } | null>(null)
  const [error, setError] = useState('')
  const [csvWarn, setCsvWarn] = useState('')
  const [staffCount, setStaffCount] = useState<number | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Subject names to offer in the dropdown — prefer what the school has
  // actually subscribed to (Syllabus Customizer), so a teacher's subject can
  // never drift from what class_subjects/the syllabus system expects (same
  // guard already applied to Class Management). If the school hasn't
  // subscribed to anything (no Syllabus feature, or feature present but
  // unused), fall back to the full platform master catalog — still a clean
  // typo-proof list, just not narrowed to this school yet.
  const [subscribedSubjectNames, setSubscribedSubjectNames] = useState<string[]>([])
  const [subjectInputMode, setSubjectInputMode] = useState<Record<number, 'dropdown' | 'manual'>>({})

  const fetchStaffCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/overview?school_id=${schoolId}&features=`)
      if (res.ok) {
        const d = await res.json()
        setStaffCount(d.core?.teachers ?? null)
      }
    } catch { /* non-critical */ }
  }, [schoolId])

  const fetchSubscribedSubjects = useCallback(async () => {
    try {
      const res = await fetch(`/api/school/subjects?school_id=${schoolId}`)
      if (res.ok) {
        const d = await res.json()
        const rows: { subject_name: string }[] = Array.isArray(d.subjects) ? d.subjects : []
        const names = Array.from(new Set(rows.map(r => r.subject_name))).sort()
        if (names.length > 0) {
          setSubscribedSubjectNames(names)
          return
        }
      }
      // No subscribed subjects — either the school hasn't adopted the
      // Syllabus feature at all, or it has the feature but hasn't subscribed
      // to anything yet. Either way there's no per-school list to narrow to,
      // so fall back to the full platform master catalog rather than forcing
      // free text — still gives a clean, typo-proof list to pick from.
      const masterRes = await fetch('/api/platform/subjects')
      if (masterRes.ok) {
        const d = await masterRes.json()
        const rows: { subject_name: string }[] = Array.isArray(d.subjects) ? d.subjects : []
        const names = Array.from(new Set(rows.map(r => r.subject_name))).sort()
        setSubscribedSubjectNames(names)
      }
    } catch { /* non-critical — falls back to free text */ }
  }, [schoolId])

  useEffect(() => { fetchStaffCount(); fetchSubscribedSubjects() }, [fetchStaffCount, fetchSubscribedSubjects])

  function updateRow(index: number, field: keyof TeacherRow, value: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() { setRows(prev => [...prev, { ...EMPTY_ROW }]) }

  function removeRow(index: number) {
    if (rows.length === 1) return
    setRows(prev => prev.filter((_, i) => i !== index))
    // subjectInputMode is keyed by row index, so deleting a row must shift
    // every later row's entry down to match — otherwise row 3's recorded
    // mode silently reattaches to what is now row 2 after the delete.
    setSubjectInputMode(prev => {
      const next: Record<number, 'dropdown' | 'manual'> = {}
      for (const [key, value] of Object.entries(prev)) {
        const i = Number(key)
        if (i < index) next[i] = value
        else if (i > index) next[i - 1] = value
        // i === index is dropped — that row no longer exists
      }
      return next
    })
  }

  async function parseExcelFile(file: File) {
    setCsvWarn('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/teachers/parse-import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to read the Excel file')
      const parsed: TeacherRow[] = (data.rows as Record<string, string>[]).map(r => ({
        name:            r.name ?? '',
        email:           r.email ?? '',
        subject:         r.subject ?? '',
        phone:           r.phone ?? '',
        department:      r.department ?? '',
        qualification:   r.qualification ?? '',
        date_of_joining: r.date_of_joining ?? '',
        staff_type:      normalizeStaffType(r.staff_type ?? ''),
        teaches_grades:  r.teaches_grades ?? '',
      }))
      if (parsed.length > 0) setRows(parsed)
      else setCsvWarn('No staff rows found in that file.')
    } catch (err) {
      setCsvWarn(err instanceof Error ? err.message : 'Failed to read the Excel file')
    }
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    parseExcelFile(file)
    e.target.value = ''
  }

  async function handleSubmit() {
    setShowErrors(true)
    const valid = rows.filter(r => r.name.trim())
    if (valid.length === 0) { setError('At least one staff member with a name is required'); return }

    // Check for row errors
    const allErrs = valid.flatMap((r, i) => rowErrors(r).map(e => `Row ${i + 1}: ${e}`))
    if (allErrs.length > 0) { setError(allErrs.join(' · ')); return }

    setSubmitting(true); setError(''); setResult(null); setCsvWarn('')
    try {
      const res = await fetch('/api/teachers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, teachers: valid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      // Keep failed rows in the grid for correction instead of clearing
      // everything — a partial-success import (some rows duplicate/invalid)
      // used to wipe the whole form, forcing a full re-type/re-paste of the
      // rows that just failed.
      const failedRowNumbers = new Set(data.errors.map((e: { row: number }) => e.row))
      const retained = valid.filter((_, i) => failedRowNumbers.has(i + 1))
      setRows(retained.length > 0 ? retained : [{ ...EMPTY_ROW }])
      setShowErrors(retained.length > 0)
      fetchStaffCount()
      // onRefresh (which also switches the visible tab back to the
      // directory, per page.tsx) is deferred to the result banner's Dismiss
      // button — calling it here switched the tab away in the same instant
      // the success message rendered, so the admin could never actually see
      // it or the new employee ID. Same pattern as StudentOnboarding's
      // "Done" button.
      // Scroll the main content container to top (not window — sidebar layout uses overflow-y-auto on <main>)
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to onboard staff')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300'
  const inputErrCls = 'w-full border border-red-300 rounded px-2 py-1.5 text-xs text-gray-900 bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-300'

  function cellCls(row: TeacherRow, field: keyof TeacherRow) {
    if (!showErrors) return inputCls
    if (field === 'name' && (!row.name.trim() || !isValidName(row.name))) return inputErrCls
    if (field === 'email' && !row.email.trim()) return inputErrCls
    if (field === 'subject' && row.staff_type === 'teaching' && !row.subject.trim()) return inputErrCls
    if (field === 'phone' && !row.phone.trim()) return inputErrCls
    return inputCls
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Staff Onboarding</h2>
            <p className="text-sm text-gray-500 mt-0.5">Assign class teachers from Class Management after onboarding</p>
          </div>
          {staffCount !== null && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
              <span className="text-2xl font-black text-blue-600">{staffCount}</span>
              <div>
                <p className="text-xs font-semibold text-blue-700 leading-none">Staff</p>
                <button onClick={fetchStaffCount} className="text-[10px] text-blue-400 hover:text-blue-600">refresh</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFileImport} className="hidden" data-testid="staff-import-file-input" />
          <button onClick={() => downloadExcelTemplate(schoolId)}
            title="Download Excel template with Subject, Staff Type and Teaches Grades dropdowns"
            data-testid="staff-download-excel-template"
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Excel Template
          </button>
          <button onClick={() => fileRef.current?.click()}
            title="Import a filled-in .xlsx template"
            data-testid="staff-import-file-button"
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import Excel File
          </button>
        </div>
      </div>

      {csvWarn && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>⚠ {csvWarn}</span>
          <button onClick={() => setCsvWarn('')} className="text-amber-400 hover:text-amber-600 ml-4">✕</button>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {result && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">✓ {result.inserted} staff member{result.inserted !== 1 ? 's' : ''} onboarded</p>
              {result.teachers[0]?.employee_id && (
                <p className="text-xs text-green-500 mt-0.5">First ID: {result.teachers[0].employee_id}</p>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {result.errors.map((e, i) => <p key={i} className="text-orange-600 text-xs">Row {e.row}: {e.message}</p>)}
                </div>
              )}
            </div>
            <button onClick={() => { setResult(null); onRefresh?.() }}
              data-testid="staff-onboard-dismiss-result"
              className="text-green-400 hover:text-green-600 text-xs border border-green-200 px-2 py-1 rounded flex-shrink-0">
              Dismiss
            </button>
          </div>
        </div>
      )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-8">#</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[130px]">Name <span className="text-red-400">*</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700 min-w-[140px] bg-blue-50">Email <span className="text-red-400">*</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Subject <span className="text-red-400">*</span> <span className="text-gray-400 text-[10px]">(teaching only)</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[100px]">Phone</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Department</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[120px]">Qualification</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Joining Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Staff Type</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[130px]">
                    Teaches Grades <span className="text-amber-500 text-[10px] font-semibold">← important</span>
                  </th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => {
                  const errs = showErrors ? rowErrors(row) : []
                  return (
                    <tr key={i} className={`hover:bg-gray-50 ${errs.length > 0 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <input data-testid={`staff-row-name-${i}`} className={cellCls(row, 'name')} placeholder="Full name *" value={row.name} onChange={e => updateRow(i, 'name', e.target.value)} />
                      </td>
                      <td className="px-3 py-2"><input data-testid={`staff-row-email-${i}`} className={cellCls(row, 'email')} placeholder="Email *" type="email" value={row.email} onChange={e => updateRow(i, 'email', e.target.value)} /></td>
                      <td className="px-3 py-2">
                        {subscribedSubjectNames.length > 0 && subjectInputMode[i] !== 'manual' ? (
                          <select
                            className={cellCls(row, 'subject')}
                            value={subscribedSubjectNames.includes(row.subject) ? row.subject : ''}
                            onChange={e => {
                              if (e.target.value === '__other__') {
                                setSubjectInputMode(prev => ({ ...prev, [i]: 'manual' }))
                                updateRow(i, 'subject', '')
                              } else {
                                updateRow(i, 'subject', e.target.value)
                              }
                            }}>
                            <option value="">{row.staff_type === 'teaching' ? 'Select subject *' : 'N/A'}</option>
                            {subscribedSubjectNames.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                            <option value="__other__">Other (type manually)…</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input className={cellCls(row, 'subject')} placeholder={row.staff_type === 'teaching' ? 'Required *' : 'N/A'} value={row.subject} onChange={e => updateRow(i, 'subject', e.target.value)} />
                            {subscribedSubjectNames.length > 0 && (
                              <button type="button" title="Pick from the subject list"
                                onClick={() => setSubjectInputMode(prev => ({ ...prev, [i]: 'dropdown' }))}
                                className="text-[10px] text-blue-500 hover:text-blue-700 flex-shrink-0">↺</button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2"><input data-testid={`staff-row-phone-${i}`} className={cellCls(row, 'phone')} placeholder="Phone *" value={row.phone} onChange={e => updateRow(i, 'phone', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Department" value={row.department} onChange={e => updateRow(i, 'department', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="B.Ed, M.Sc..." value={row.qualification} onChange={e => updateRow(i, 'qualification', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} type="date" value={row.date_of_joining} onChange={e => updateRow(i, 'date_of_joining', e.target.value)} /></td>
                      <td className="px-3 py-2">
                        <select value={row.staff_type} onChange={e => updateRow(i, 'staff_type', e.target.value)}
                          className="w-full border border-gray-200 rounded px-1.5 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300">
                          <option value="teaching">Teaching</option>
                          <option value="non_teaching">Non-Teaching</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {row.staff_type === 'teaching' ? (
                          <div className="space-y-0.5">
                            <InlineGrades value={row.teaches_grades} onChange={v => updateRow(i, 'teaches_grades', v)} />
                            {!row.teaches_grades.trim() && row.name.trim() && (
                              <p className="text-[10px] text-amber-500 leading-tight">
                                ⚠ No grades = teaches all
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs italic">N/A</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button data-testid={`staff-row-remove-${i}`} onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-blue-50/30 border-t border-blue-100 flex items-center gap-4 flex-wrap">
            <p className="text-xs text-blue-600 font-medium">Email (blue) is required — login credentials are sent there</p>
            <p className="text-xs text-gray-400">Phone is required for all staff</p>
            <p className="text-xs text-gray-400">Subject required for teaching staff only</p>
            <p className="text-xs text-amber-600">Teaches Grades — leave blank for all grades</p>
          </div>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-gray-400">
              <strong className="text-gray-500">Teaches Grades</strong> — use the dropdown to select grades, or leave blank to teach all grades.
            </p>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
            <button onClick={addRow} data-testid="staff-add-row" className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Add Row</button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{rows.filter(r => r.name.trim()).length} of {rows.length} rows ready</span>
              <button onClick={handleSubmit} disabled={submitting || rows.every(r => !r.name.trim())}
                data-testid="staff-onboard-submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {submitting ? 'Onboarding...' : 'Onboard Staff'}
              </button>
            </div>
          </div>
        </div>
    </div>
  )
}
