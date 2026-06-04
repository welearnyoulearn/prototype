'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { parseCSV } from '@/lib/parseCSV'

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

const CSV_HEADER = 'name,email,subject,phone,department,qualification,date_of_joining,staff_type,teaches_grades'
const CSV_EXAMPLE = `Priya Sharma,priya@school.com,Mathematics,9876543210,Science,B.Ed,2023-06-01,teaching,"8,9,10"
Raj Kumar,raj@school.com,Physics,9876543211,Science,M.Sc,2022-07-15,teaching,"11,12"
Suresh Patel,suresh@school.com,,,Admin,,2021-01-10,non_teaching,
# Note: wrap grades in quotes — "8,9,10" — or leave blank for all grades`

const STUDENT_CSV_MARKERS = ['roll_number', 'parent_name', 'parent_phone', 'parent_email']
const ALL_GRADES = Array.from({ length: 12 }, (_, i) => String(i + 1))

function normalizeStaffType(raw: string): string {
  const v = raw.toLowerCase().replace(/[\s\-]/g, '_')
  return v.includes('non') ? 'non_teaching' : 'teaching'
}

function downloadTemplate() {
  const content = CSV_HEADER + '\n' + CSV_EXAMPLE
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'staff_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

// Inline grade multi-select for table rows
function InlineGrades({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

  function toggle(g: string) {
    const next = selected.includes(g) ? selected.filter(x => x !== g) : [...selected, g]
    onChange(next.sort((a, b) => parseInt(a) - parseInt(b)).join(','))
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-left bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 flex justify-between items-center min-w-[110px]">
        <span className={selected.length ? 'text-gray-900 truncate' : 'text-gray-400'}>
          {selected.length ? selected.join(', ') : 'All grades'}
        </span>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-44">
          <div className="grid grid-cols-4 gap-1">
            {ALL_GRADES.map(g => (
              <button key={g} type="button" onClick={() => toggle(g)}
                className={`py-1 rounded text-xs font-medium transition-colors ${
                  selected.includes(g) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {g}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-2 pt-1 border-t border-gray-100">
            <button type="button" onClick={() => onChange(ALL_GRADES.join(','))}
              className="text-[10px] text-blue-500 hover:text-blue-700">All</button>
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className="text-[10px] text-red-500 hover:text-red-700">Clear</button>
            <button type="button" onClick={() => setOpen(false)}
              className="text-[10px] text-gray-500 hover:text-gray-700">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

function rowErrors(row: TeacherRow): string[] {
  const errs: string[] = []
  if (!row.name.trim()) errs.push('Name required')
  if (!row.email.trim()) errs.push('Email required — login credentials will be sent here')
  if (row.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) errs.push('Invalid email')
  if (row.staff_type === 'teaching' && !row.subject.trim()) errs.push('Subject required for teaching staff')
  if (row.phone.trim() && !/^\+?[\d\s\-()\[\]]{7,15}$/.test(row.phone.trim())) errs.push('Invalid phone')
  return errs
}

export default function StaffOnboarding({ schoolId, onRefresh }: Props) {
  const [rows, setRows] = useState<TeacherRow[]>([{ ...EMPTY_ROW }])
  const [mode, setMode] = useState<'manual' | 'csv'>('manual')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; teachers: { employee_id: string }[]; errors: { row: number; message: string }[] } | null>(null)
  const [error, setError] = useState('')
  const [csvWarn, setCsvWarn] = useState('')
  const [staffCount, setStaffCount] = useState<number | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchStaffCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/overview?school_id=${schoolId}&features=`)
      if (res.ok) {
        const d = await res.json()
        setStaffCount(d.core?.teachers ?? null)
      }
    } catch { /* non-critical */ }
  }, [schoolId])

  useEffect(() => { fetchStaffCount() }, [fetchStaffCount])

  function updateRow(index: number, field: keyof TeacherRow, value: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() { setRows(prev => [...prev, { ...EMPTY_ROW }]) }

  function removeRow(index: number) {
    if (rows.length === 1) return
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function parseText(text: string) {
    setCsvWarn('')
    const allRows = parseCSV(text.trim())
    if (allRows.length === 0) return

    const firstRowLower = allRows[0].map(c => c.toLowerCase().trim())
    const hasHeader = firstRowLower.some(c => ['name', 'email', 'subject', 'phone', 'department'].includes(c))

    if (hasHeader) {
      const isStudentCsv = STUDENT_CSV_MARKERS.some(m => firstRowLower.includes(m))
      if (isStudentCsv) {
        setCsvWarn('This looks like a Student CSV. Please use this form only for staff data.')
        return
      }
    }

    const dataRows = (hasHeader ? allRows.slice(1) : allRows)
      .filter(cols => !(cols[0] ?? '').trim().startsWith('#'))
    const parsed: TeacherRow[] = dataRows.map(cols => {
      // Grades recovery: if user wrote 8,9,10 without quotes, CSV parser spills them into cols 8,9,10...
      // Detect: col 8 onwards are all grade numbers (1–12), merge them back
      const isGrade = (v: string) => /^\d{1,2}$/.test(v.trim()) && +v.trim() >= 1 && +v.trim() <= 12
      let teachesGrades = cols[8] ?? ''
      if (cols.length > 9 && isGrade(cols[8] ?? '')) {
        const spilledGrades = cols.slice(8).filter(c => isGrade(c))
        if (spilledGrades.length > 1) teachesGrades = spilledGrades.map(g => g.trim()).join(',')
      }
      return {
        name:            cols[0] ?? '',
        email:           cols[1] ?? '',
        subject:         cols[2] ?? '',
        phone:           cols[3] ?? '',
        department:      cols[4] ?? '',
        qualification:   cols[5] ?? '',
        date_of_joining: cols[6] ?? '',
        staff_type:      normalizeStaffType(cols[7] ?? ''),
        teaches_grades:  teachesGrades,
      }
    })
    if (parsed.length > 0) { setRows(parsed); setMode('manual') }
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { parseText(ev.target?.result as string) }
    reader.readAsText(file)
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
      setRows([{ ...EMPTY_ROW }])
      setShowErrors(false)
      fetchStaffCount()
      onRefresh?.()
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
    if (field === 'name' && !row.name.trim()) return inputErrCls
    if (field === 'subject' && row.staff_type === 'teaching' && !row.subject.trim()) return inputErrCls
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
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileImport} className="hidden" />
          <button onClick={downloadTemplate}
            title="Download CSV template"
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Template
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import CSV
          </button>
          <button onClick={() => setMode(m => m === 'csv' ? 'manual' : 'csv')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'csv' ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Paste CSV
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
            <button onClick={() => setResult(null)}
              className="text-green-400 hover:text-green-600 text-xs border border-green-200 px-2 py-1 rounded flex-shrink-0">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {mode === 'csv' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-1">CSV Format</p>
            <code className="block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs text-gray-600 font-mono">{CSV_HEADER}</code>
          </div>
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-1">Example:</p>
            <code className="block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs text-gray-500 font-mono whitespace-pre">{CSV_EXAMPLE}</code>
          </div>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono resize-none"
            rows={8} placeholder="Paste CSV data here..."
            onChange={e => {
              if (e.target.value.trim()) {
                parseText(e.target.value)
                e.target.value = ''
              }
            }}
          />
          <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-amber-700">
              <strong>Grades column:</strong> always wrap in quotes — <code className="bg-amber-100 px-1 rounded font-mono">&quot;8,9,10&quot;</code> — or leave blank for all grades. Without quotes, the CSV parser will split grades into wrong columns.
            </p>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Paste triggers auto-parse — or use &quot;Import CSV&quot; button above</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-8">#</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[130px]">Name <span className="text-red-400">*</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[140px]">Email</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Subject <span className="text-orange-400 text-[10px]">(req. for teaching)</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[100px]">Phone</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Department</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[120px]">Qualification</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Joining Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Staff Type</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[130px]">
                    Teaches Grades <span className="text-amber-400 text-[10px] font-semibold">← important</span>
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
                        <input className={cellCls(row, 'name')} placeholder="Full name *" value={row.name} onChange={e => updateRow(i, 'name', e.target.value)} />
                      </td>
                      <td className="px-3 py-2"><input className={cellCls(row, 'email')} placeholder="Email *" type="email" value={row.email} onChange={e => updateRow(i, 'email', e.target.value)} /></td>
                      <td className="px-3 py-2">
                        <input className={cellCls(row, 'subject')} placeholder={row.staff_type === 'teaching' ? 'Required *' : 'N/A'} value={row.subject} onChange={e => updateRow(i, 'subject', e.target.value)} />
                      </td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Phone" value={row.phone} onChange={e => updateRow(i, 'phone', e.target.value)} /></td>
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
                        <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-gray-400">
              <strong className="text-gray-500">Teaches Grades</strong> — use the dropdown to select grades. In CSV, always wrap grades in quotes: <code className="bg-gray-100 px-1 rounded font-mono text-[10px]">&quot;8,9,10&quot;</code>
            </p>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
            <button onClick={addRow} className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Add Row</button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{rows.filter(r => r.name.trim()).length} of {rows.length} rows ready</span>
              <button onClick={handleSubmit} disabled={submitting || rows.every(r => !r.name.trim())}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {submitting ? 'Onboarding...' : 'Onboard Staff'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
