'use client'

import { useRef, useState } from 'react'
import { parseCSV } from '@/lib/parseCSV'

type Props = { schoolId: number }

type TeacherRow = {
  name: string
  email: string
  subject: string
  phone: string
  department: string
  qualification: string
  date_of_joining: string
  staff_type: string
  class_teacher_grade: string
  class_teacher_section: string
  teaches_grades: string
}

const EMPTY_ROW: TeacherRow = {
  name: '', email: '', subject: '', phone: '',
  department: '', qualification: '', date_of_joining: '', staff_type: 'teaching',
  class_teacher_grade: '', class_teacher_section: '', teaches_grades: ''
}

const CSV_TEMPLATE = 'name,email,subject,phone,department,qualification,date_of_joining,staff_type,class_teacher_grade,class_teacher_section,teaches_grades'
const CSV_EXAMPLE = `Priya Sharma,priya@school.com,Mathematics,9876543210,Science,B.Ed,2023-06-01,teaching,8,A,"8A,8B"
Raj Kumar,raj@school.com,Physics,9876543211,Science,M.Sc,2022-07-15,teaching,,,9A
Suresh Patel,suresh@school.com,,,Admin,,2021-01-10,non_teaching,,,`

function normalizeStaffType(raw: string): string {
  const v = raw.toLowerCase().replace(/[\s\-]/g, '_')
  return v.includes('non') ? 'non_teaching' : 'teaching'
}

export default function StaffOnboarding({ schoolId }: Props) {
  const [rows, setRows] = useState<TeacherRow[]>([{ ...EMPTY_ROW }])
  const [mode, setMode] = useState<'manual' | 'csv'>('manual')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; teachers: { employee_id: string }[]; errors: { row: number; message: string }[] } | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function updateRow(index: number, field: keyof TeacherRow, value: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() { setRows(prev => [...prev, { ...EMPTY_ROW }]) }

  function removeRow(index: number) {
    if (rows.length === 1) return
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function parseText(text: string) {
    const allRows = parseCSV(text.trim())
    if (allRows.length === 0) return
    const firstRowLower = allRows[0].map(c => c.toLowerCase())
    const hasHeader = firstRowLower.some(c => ['name', 'email', 'subject', 'phone', 'department'].includes(c))
    const dataRows = hasHeader ? allRows.slice(1) : allRows
    const parsed: TeacherRow[] = dataRows.map(cols => ({
      name: cols[0] ?? '',
      email: cols[1] ?? '',
      subject: cols[2] ?? '',
      phone: cols[3] ?? '',
      department: cols[4] ?? '',
      qualification: cols[5] ?? '',
      date_of_joining: cols[6] ?? '',
      staff_type: normalizeStaffType(cols[7] ?? ''),
      class_teacher_grade: cols[8] ?? '',
      class_teacher_section: cols[9] ?? '',
      teaches_grades: cols[10] ?? '',
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

  async function handleSubmit() {
    const valid = rows.filter(r => r.name.trim())
    if (valid.length === 0) { setError('At least one staff member with a name is required'); return }
    setSubmitting(true); setError(''); setResult(null)
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to onboard staff')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Staff Onboarding</h2>
          <p className="text-sm text-gray-500 mt-0.5">CT Grade + CT Section auto-assigns class teacher in Class Management</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileImport} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import CSV File
          </button>
          <button onClick={() => setMode(m => m === 'csv' ? 'manual' : 'csv')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'csv' ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Paste CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {result && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          <p className="font-medium">✓ {result.inserted} staff member{result.inserted !== 1 ? 's' : ''} onboarded — e.g. {result.teachers[0]?.employee_id}</p>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {result.errors.map((e, i) => <p key={i} className="text-orange-600 text-xs">Row {e.row}: {e.message}</p>)}
            </div>
          )}
        </div>
      )}

      {mode === 'csv' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-1">CSV Format</p>
            <code className="block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs text-gray-600 font-mono">{CSV_TEMPLATE}</code>
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
          <p className="text-xs text-gray-400 mt-2">Paste triggers auto-parse — or use &quot;Import CSV File&quot; button above</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-8">#</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[130px]">Name *</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[140px]">Email</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Subject</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[100px]">Phone</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Department</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[120px]">Qualification</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Joining Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Staff Type</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-14 bg-blue-50">CT Gr.</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-14 bg-blue-50">CT Sec.</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[120px] bg-blue-50">Teaches</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2"><input className={inputCls} placeholder="Full name" value={row.name} onChange={e => updateRow(i, 'name', e.target.value)} /></td>
                    <td className="px-3 py-2"><input className={inputCls} placeholder="Email" type="email" value={row.email} onChange={e => updateRow(i, 'email', e.target.value)} /></td>
                    <td className="px-3 py-2"><input className={inputCls} placeholder="Subject" value={row.subject} onChange={e => updateRow(i, 'subject', e.target.value)} /></td>
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
                    <td className="px-3 py-2 bg-blue-50/30"><input className={inputCls} placeholder="8" value={row.class_teacher_grade} onChange={e => updateRow(i, 'class_teacher_grade', e.target.value)} /></td>
                    <td className="px-3 py-2 bg-blue-50/30"><input className={inputCls} placeholder="A" value={row.class_teacher_section} onChange={e => updateRow(i, 'class_teacher_section', e.target.value)} /></td>
                    <td className="px-3 py-2 bg-blue-50/30"><input className={inputCls} placeholder="8A,9A" value={row.teaches_grades} onChange={e => updateRow(i, 'teaches_grades', e.target.value)} /></td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-blue-50/30 border-t border-blue-100">
            <p className="text-xs text-blue-500">Blue cols: CT Grade + CT Section = auto class teacher · Teaches = e.g. 8A,8B</p>
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
