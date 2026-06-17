'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { parseCSV } from '@/lib/parseCSV'

type Props = { schoolId: number; onRefresh?: () => void }

type StudentRow = {
  last_name: string; first_name: string; email: string; grade: string; section: string
  parent_name: string; parent_phone: string; parent_email: string; phone: string
}

const EMPTY_ROW: StudentRow = { last_name: '', first_name: '', email: '', grade: '', section: '', parent_name: '', parent_phone: '', parent_email: '', phone: '' }
const CSV_HEADER = 'last_name,first_name,email,grade,section,parent_name,parent_phone,parent_email,phone'
const CSV_EXAMPLE = `Mehta,Arjun,arjun@student.com,10,A,Suresh Mehta,9876543210,suresh@parent.com,
Patel,Priya,priya@student.com,10,A,Ramesh Patel,9876543211,ramesh@parent.com,`

// Staff CSV markers — if uploaded to student form by mistake
const STAFF_CSV_MARKERS = ['department', 'qualification', 'staff_type', 'subject', 'employee_id', 'teaches_grades']

function downloadTemplate() {
  const content = CSV_HEADER + '\n' + CSV_EXAMPLE
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'student_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function StudentOnboarding({ schoolId, onRefresh }: Props) {
  const [rows, setRows] = useState<StudentRow[]>([{ ...EMPTY_ROW }])
  const [mode, setMode] = useState<'manual' | 'csv'>('manual')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; students: { roll_number: string }[]; errors: { row: number; message: string }[] } | null>(null)
  const [error, setError] = useState('')
  const [csvWarn, setCsvWarn] = useState('')
  const [studentCount, setStudentCount] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchStudentCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/overview?school_id=${schoolId}&features=`)
      if (res.ok) {
        const d = await res.json()
        setStudentCount(d.core?.students ?? null)
      }
    } catch { /* non-critical */ }
  }, [schoolId])

  useEffect(() => { fetchStudentCount() }, [fetchStudentCount])

  function updateRow(index: number, field: keyof StudentRow, value: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() { setRows(prev => [...prev, { ...EMPTY_ROW, grade: filterGrade, section: filterSection }]) }

  function removeRow(index: number) {
    if (rows.length === 1) return
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function parseText(text: string) {
    setCsvWarn('')
    const allRows = parseCSV(text.trim())
    if (allRows.length === 0) return

    const firstRowLower = allRows[0].map(c => c.toLowerCase().trim())
    const hasHeader = firstRowLower.some(c => ['last_name', 'first_name', 'name', 'email', 'grade', 'student'].includes(c))

    // Conflict detection: check if this looks like a staff CSV
    if (hasHeader) {
      const isStaffCsv = STAFF_CSV_MARKERS.some(m => firstRowLower.includes(m))
      if (isStaffCsv) {
        setCsvWarn('This looks like a Staff CSV (contains staff-specific columns like department, qualification, etc.). Please use this form only for student data.')
        return
      }
    }

    const dataRows = hasHeader ? allRows.slice(1) : allRows
    const parsed: StudentRow[] = dataRows.map(cols => ({
      last_name: cols[0] ?? '',
      first_name: cols[1] ?? '',
      email: cols[2] ?? '',
      grade: cols[3] ?? filterGrade,
      section: cols[4] ?? filterSection,
      parent_name: cols[5] ?? '',
      parent_phone: cols[6] ?? '',
      parent_email: cols[7] ?? '',
      phone: cols[8] ?? '',
    }))
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

  function applyClassToAll() {
    if (!filterGrade && !filterSection) return
    setRows(prev => prev.map(r => ({ ...r, grade: filterGrade || r.grade, section: filterSection || r.section })))
  }

  async function handleSubmit() {
    const valid = rows.filter(r => r.last_name.trim() || r.first_name.trim())
    if (valid.length === 0) { setError('At least one student name is required'); return }

    // Validate required fields
    const missing: string[] = []
    valid.forEach((r, i) => {
      if (!r.last_name.trim())    missing.push(`Row ${i + 1}: Last Name is required`)
      if (!r.first_name.trim())   missing.push(`Row ${i + 1}: First Name is required`)
      if (!r.email.trim())        missing.push(`Row ${i + 1}: Student Email is required — login credentials will be sent here`)
      if (r.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) missing.push(`Row ${i + 1}: Invalid email`)
      if (!r.grade.trim())        missing.push(`Row ${i + 1}: Grade is required`)
      // Section is optional
      if (!r.parent_name.trim())  missing.push(`Row ${i + 1}: Parent Name is required`)
      if (!r.parent_phone.trim()) missing.push(`Row ${i + 1}: Parent Phone is required`)
    })
    if (missing.length > 0) { setError(missing.join(' · ')); return }

    // Combine last_name + first_name → full name sent to API
    const students = valid.map(({ last_name, first_name, ...rest }) => ({
      ...rest, name: `${last_name} ${first_name}`.trim(),
    }))

    setSubmitting(true); setError(''); setResult(null); setCsvWarn('')
    try {
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, students }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setRows([{ ...EMPTY_ROW }])
      fetchStudentCount()
      onRefresh?.()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to enroll students')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-green-300'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Student Onboarding</h2>
            <p className="text-sm text-gray-500 mt-0.5">Bulk enroll students — parent email auto-creates parent account</p>
          </div>
          {studentCount !== null && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
              <span className="text-2xl font-black text-green-600">{studentCount}</span>
              <div>
                <p className="text-xs font-semibold text-green-700 leading-none">Students</p>
                <button onClick={fetchStudentCount} className="text-[10px] text-green-400 hover:text-green-600">refresh</button>
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
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'csv' ? 'bg-green-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
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
              <p className="font-medium">✓ {result.inserted} student{result.inserted !== 1 ? 's' : ''} enrolled</p>
              {result.students[0]?.roll_number && (
                <p className="text-xs text-green-500 mt-0.5">First roll no: {result.students[0].roll_number}</p>
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
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300 font-mono resize-none"
            rows={8} placeholder="Paste CSV data here..."
            onChange={e => {
              if (e.target.value.trim()) { parseText(e.target.value); e.target.value = '' }
            }}
          />
          <p className="text-xs text-gray-400 mt-2">Paste triggers auto-parse — or use &quot;Import CSV&quot; button above</p>
        </div>
      ) : (
        <>
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grade filter</label>
              <input value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 bg-white w-24 focus:outline-none focus:ring-1 focus:ring-green-300" placeholder="e.g. 10" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Section</label>
              <input value={filterSection} onChange={e => setFilterSection(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 bg-white w-20 focus:outline-none focus:ring-1 focus:ring-green-300" placeholder="e.g. A" />
            </div>
            <button onClick={applyClassToAll} disabled={!filterGrade && !filterSection}
              className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50 disabled:opacity-40">
              Apply to all rows
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-8">#</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Last Name <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">First Name <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[140px]">Student Email</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-16">Grade <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-16">Section</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[120px]">Parent Name <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Parent Phone <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[150px] bg-orange-50">Parent Email</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[100px]">Student Phone</th>
                    <th className="px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Last name" value={row.last_name} onChange={e => updateRow(i, 'last_name', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="First name" value={row.first_name} onChange={e => updateRow(i, 'first_name', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={`${inputCls} ${!row.email.trim() ? 'border-amber-300' : ''}`} placeholder="Email *" type="email" value={row.email} onChange={e => updateRow(i, 'email', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="10" value={row.grade} onChange={e => updateRow(i, 'grade', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="A" value={row.section} onChange={e => updateRow(i, 'section', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Parent name" value={row.parent_name} onChange={e => updateRow(i, 'parent_name', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Phone" value={row.parent_phone} onChange={e => updateRow(i, 'parent_phone', e.target.value)} /></td>
                      <td className="px-3 py-2 bg-orange-50/40"><input className={inputCls} placeholder="parent@email.com" type="email" value={row.parent_email} onChange={e => updateRow(i, 'parent_email', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Phone" value={row.phone} onChange={e => updateRow(i, 'phone', e.target.value)} /></td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-orange-50/30 border-t border-orange-100">
              <p className="text-xs text-orange-500">Parent Email (orange) auto-creates linked parent account</p>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <button onClick={addRow} className="text-sm text-green-600 hover:text-green-800 font-medium">+ Add Row</button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{rows.filter(r => r.last_name.trim() || r.first_name.trim()).length} of {rows.length} rows ready</span>
                <button onClick={handleSubmit} disabled={submitting || rows.every(r => !r.last_name.trim() && !r.first_name.trim())}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {submitting ? 'Enrolling...' : 'Enroll Students'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
