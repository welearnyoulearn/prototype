'use client'

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { parseCSV } from '@/lib/parseCSV'

type Props = { schoolId: number; onRefresh?: () => void }

type StudentRow = {
  last_name: string; first_name: string; email: string; grade: string; section: string
  parent_name: string; parent_phone: string; parent_email: string; phone: string; school_roll_number: string
}

type StudentCredential = {
  name: string; grade: string; section: string; school_roll_number: number | null
  login: string; temp_password: string
}

type ParentCredential = {
  name: string; phone: string; login: string; temp_password: string; is_new: boolean
}

type OnboardingResult = {
  inserted: number
  skipped: { row: number; name: string; reason: string }[]
  students: { id: number; roll_number: string; name: string }[]
  errors: { row: number; message: string }[]
  credentials: { students: StudentCredential[]; parents: ParentCredential[] }
}

type DupCheckMatch = {
  row: number
  name: string
  reason: 'roll_number' | 'phone' | 'name+parent_phone'
  matched_student: { id: number; name: string; created_at: string }
}

const EMPTY_ROW: StudentRow = { last_name: '', first_name: '', email: '', grade: '', section: '', parent_name: '', parent_phone: '', parent_email: '', phone: '', school_roll_number: '' }
const CSV_HEADER = 'roll_no,last_name,first_name,email,grade,section,parent_name,parent_phone,parent_email,phone'
const CSV_EXAMPLE = `1,Mehta,Arjun,arjun@student.com,10,A,Suresh Mehta,9876543210,suresh@parent.com,
2,Patel,Priya,,10,A,Ramesh Patel,9876543211,,`

const STAFF_CSV_MARKERS = ['department', 'qualification', 'staff_type', 'subject', 'employee_id', 'teaches_grades']

function rollKey(grade: string, section: string, roll: string): string {
  return `${grade.trim().toLowerCase()}|${section.trim().toLowerCase()}|${roll.trim()}`
}

function downloadTemplate() {
  const a = document.createElement('a')
  a.href = '/api/students/template'
  a.download = 'student_template.xlsx'
  a.click()
}

function copyAllCredentials(creds: OnboardingResult['credentials']) {
  const lines: string[] = ['=== STUDENT CREDENTIALS ===']
  creds.students.forEach(s => {
    lines.push(`${s.name} | Grade ${s.grade}${s.section ? '-' + s.section : ''} | Roll ${s.school_roll_number ?? '-'} | Login: ${s.login} | Password: ${s.temp_password}`)
  })
  if (creds.parents.length > 0) {
    lines.push('', '=== PARENT CREDENTIALS (NEW ACCOUNTS) ===')
    creds.parents.forEach(p => {
      lines.push(`${p.name} | Login: ${p.login} | Password: ${p.temp_password}`)
    })
  }
  navigator.clipboard.writeText(lines.join('\n')).catch(console.error)
}

export default function StudentOnboarding({ schoolId, onRefresh }: Props) {
  const [rows, setRows] = useState<StudentRow[]>([{ ...EMPTY_ROW }])
  const [mode, setMode] = useState<'manual' | 'csv'>('manual')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)
  const [result, setResult] = useState<OnboardingResult | null>(null)
  const [showCredentials, setShowCredentials] = useState(false)
  const [dupRollError, setDupRollError] = useState('')
  const [error, setError] = useState('')
  const [csvWarn, setCsvWarn] = useState('')
  const [studentCount, setStudentCount] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [resetingId, setResetingId] = useState<number | null>(null)
  const [resetResults, setResetResults] = useState<Record<number, { password: string; error?: string }>>({})
  const [dupPreview, setDupPreview] = useState<{ existing: DupCheckMatch[]; new_count: number; existing_count: number } | null>(null)
  const [showDupPreview, setShowDupPreview] = useState(false)
  const [pendingStudents, setPendingStudents] = useState<{ name: string; grade?: string; section?: string; school_roll_number?: number; phone?: string; parent_phone?: string; email?: string; parent_name?: string; parent_email?: string }[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [existingRollKeys, setExistingRollKeys] = useState<Set<string>>(new Set())

  const fetchStudentCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/overview?school_id=${schoolId}&features=`)
      if (res.ok) { const d = await res.json(); setStudentCount(d.core?.students ?? null) }
    } catch { /* non-critical */ }
  }, [schoolId])

  const fetchExistingRolls = useCallback(async () => {
    try {
      const res = await fetch(`/api/students?school_id=${schoolId}`)
      if (!res.ok) return
      const list: { grade: string | null; section: string | null; school_roll_number: number | null; status?: string }[] = await res.json()
      const keys = new Set<string>()
      for (const s of list) {
        if (s.status === 'inactive') continue
        if (s.school_roll_number != null && s.grade) {
          keys.add(rollKey(s.grade, s.section ?? '', String(s.school_roll_number)))
        }
      }
      setExistingRollKeys(keys)
    } catch { /* non-critical */ }
  }, [schoolId])

  useEffect(() => { fetchStudentCount(); fetchExistingRolls() }, [fetchStudentCount, fetchExistingRolls])

  function updateRow(index: number, field: keyof StudentRow, value: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() { setRows(prev => [...prev, { ...EMPTY_ROW, grade: filterGrade, section: filterSection }]) }

  function removeRow(index: number) {
    if (rows.length === 1) return
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function applyClassToAll() {
    if (!filterGrade && !filterSection) return
    setRows(prev => prev.map(r => ({ ...r, grade: filterGrade || r.grade, section: filterSection || r.section })))
  }

  function parseText(text: string) {
    setCsvWarn('')
    const allRows = parseCSV(text.trim())
    if (allRows.length === 0) return
    const firstRowLower = allRows[0].map(c => c.toLowerCase().trim())
    const hasHeader = firstRowLower.some(c => ['last_name', 'first_name', 'name', 'email', 'grade', 'student'].includes(c))
    if (hasHeader) {
      const isStaffCsv = STAFF_CSV_MARKERS.some(m => firstRowLower.includes(m))
      if (isStaffCsv) { setCsvWarn('This looks like a Staff CSV. Please use this form only for student data.'); return }
    }
    const dataRows = hasHeader ? allRows.slice(1) : allRows
    const parsed: StudentRow[] = dataRows.map(cols => ({
      school_roll_number: cols[0] ?? '',
      last_name: cols[1] ?? '',
      first_name: cols[2] ?? '',
      email: cols[3] ?? '',
      grade: cols[4] ?? filterGrade,
      section: cols[5] ?? filterSection,
      parent_name: cols[6] ?? '',
      parent_phone: cols[7] ?? '',
      parent_email: cols[8] ?? '',
      phone: cols[9] ?? '',
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

  function buildStudentsPayload(valid: StudentRow[]) {
    return valid.map(({ last_name, first_name, ...rest }) => ({
      ...rest,
      name: `${last_name} ${first_name}`.trim(),
      school_roll_number: rest.school_roll_number.trim() ? parseInt(rest.school_roll_number.trim()) : undefined,
    }))
  }

  async function doSubmit(students: typeof pendingStudents) {
    if (!students) return
    setSubmitCount(students.length)
    setSubmitting(true); setError(''); setResult(null); setCsvWarn(''); setDupRollError('')
    try {
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, students }),
      })
      const data: OnboardingResult & { error?: string } = await res.json()
      if (res.status === 409) { setDupRollError(data.error || 'Duplicate roll number'); return }
      if (!res.ok) throw new Error(data.error)

      setResult(data)
      setResetResults({})

      if (data.inserted > 0) {
        setShowCredentials(true)
        setRows([{ ...EMPTY_ROW }])
        fetchStudentCount()
        fetchExistingRolls()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        setShowCredentials(false)
        const msg = data.errors.length > 0
          ? data.errors.map(e => `Row ${e.row}: ${e.message}`).join(' · ')
          : data.skipped?.length > 0
            ? `All ${data.skipped.length} students already exist`
            : 'No students were enrolled'
        setError(msg)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to enroll students')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit() {
    const valid = rows.filter(r => r.last_name.trim() || r.first_name.trim())
    if (valid.length === 0) { setError('At least one student name is required'); return }

    const missing: string[] = []
    valid.forEach((r, i) => {
      if (!r.last_name.trim())    missing.push(`Row ${i + 1}: Last Name is required`)
      if (!r.first_name.trim())   missing.push(`Row ${i + 1}: First Name is required`)
      if (r.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) missing.push(`Row ${i + 1}: Invalid student email`)
      if (r.parent_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.parent_email.trim())) missing.push(`Row ${i + 1}: Invalid parent email`)
      if (!r.grade.trim())        missing.push(`Row ${i + 1}: Grade is required`)
      if (!r.parent_name.trim())  missing.push(`Row ${i + 1}: Parent Name is required`)
      if (!r.parent_phone.trim()) missing.push(`Row ${i + 1}: Parent Phone is required`)
      if (!r.school_roll_number.trim()) missing.push(`Row ${i + 1}: Roll No is required`)
      else if (!/^\d+$/.test(r.school_roll_number.trim()) || parseInt(r.school_roll_number.trim()) <= 0)
        missing.push(`Row ${i + 1}: Roll No must be a positive number`)
    })
    if (missing.length > 0) { setError(missing.join(' · ')); return }

    const rollMap = new Map<string, number>()
    let dupFound = false
    const dupErrors: string[] = []
    for (let i = 0; i < valid.length; i++) {
      const r = valid[i]
      const key = `${r.grade.trim()}|${r.section.trim()}|${r.school_roll_number.trim()}`
      if (rollMap.has(key)) {
        dupErrors.push(`Row ${i + 1}: Roll No ${r.school_roll_number} duplicated with Row ${rollMap.get(key)! + 1} in Grade ${r.grade} Section ${r.section}`)
        dupFound = true
      } else { rollMap.set(key, i) }
    }
    if (dupFound) { setError(dupErrors.join(' · ')); return }

    const students = buildStudentsPayload(valid)
    setPendingStudents(students)

    setChecking(true)
    try {
      const res = await fetch('/api/students/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, students }),
      })
      const data = await res.json()
      if (data.existing_count > 0) {
        setDupPreview(data)
        setShowDupPreview(true)
      } else {
        await doSubmit(students)
      }
    } catch {
      await doSubmit(students)
    } finally {
      setChecking(false)
    }
  }

  async function handleResetCredentials(studentId: number) {
    setResetingId(studentId)
    try {
      const res = await fetch(`/api/students/${studentId}/reset-credentials`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reset failed')
      setResetResults(prev => ({ ...prev, [studentId]: { password: data.temp_password } }))
    } catch (err: unknown) {
      setResetResults(prev => ({ ...prev, [studentId]: { password: '', error: err instanceof Error ? err.message : 'Reset failed' } }))
    } finally {
      setResetingId(null)
    }
  }

  function handleCopyAll() {
    if (!result) return
    copyAllCredentials(result.credentials)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-green-300'

  const rowDupWarnings = useMemo(() => {
    const warnings: string[] = rows.map(() => '')
    const batchFirstSeen = new Map<string, number>()
    rows.forEach((r, i) => {
      const roll = r.school_roll_number.trim()
      if (!roll || !r.grade.trim()) return
      if (!/^\d+$/.test(roll) || parseInt(roll) <= 0) return
      const key = rollKey(r.grade, r.section, roll)
      if (existingRollKeys.has(key)) {
        warnings[i] = `Roll No ${roll} already exists in Grade ${r.grade}${r.section.trim() ? ` Section ${r.section}` : ''}`
        return
      }
      if (batchFirstSeen.has(key)) {
        warnings[i] = `Roll No ${roll} duplicated with row ${batchFirstSeen.get(key)! + 1}`
      } else {
        batchFirstSeen.set(key, i)
      }
    })
    return warnings
  }, [rows, existingRollKeys])

  const hasRowDupes = rowDupWarnings.some(w => w !== '')
  const hasCredentials = result && (result.credentials.students.length > 0 || result.credentials.parents.length > 0)

  function reasonLabel(reason: string) {
    if (reason === 'roll_number') return 'Same roll number'
    if (reason === 'name+parent_phone') return 'Same name + parent phone'
    if (reason === 'phone') return 'Same phone'
    return reason
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Student Onboarding</h2>
            <p className="text-sm text-gray-500 mt-0.5">Bulk enroll students — parent phone required, emails optional</p>
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
          {hasCredentials && (
            <button onClick={() => setShowCredentials(true)}
              data-testid="view-credentials-btn"
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              View Credentials
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" onChange={handleFileImport} className="hidden" />
          <button onClick={downloadTemplate} title="Download Excel template"
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

      {dupRollError && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-red-200 max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-base">Duplicate Roll Number</h3>
                <p className="text-sm text-red-700 mt-1">{dupRollError}</p>
              </div>
            </div>
            <button onClick={() => setDupRollError('')}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              OK, fix it
            </button>
          </div>
        </div>
      )}

      {/* Duplicate preview modal */}
      {showDupPreview && dupPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Students Already Exist</h3>
              <div className="flex gap-4 mt-3">
                <div className="flex-1 bg-green-50 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-black text-green-600">{dupPreview.new_count}</p>
                  <p className="text-xs text-green-700 font-medium mt-0.5">New</p>
                </div>
                <div className="flex-1 bg-amber-50 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-black text-amber-600">{dupPreview.existing_count}</p>
                  <p className="text-xs text-amber-700 font-medium mt-0.5">Already Exist</p>
                </div>
                <div className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-black text-gray-600">{dupPreview.new_count + dupPreview.existing_count}</p>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">Total Detected</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 max-h-64 overflow-y-auto">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Already in system ({dupPreview.existing_count})</p>
              <div className="space-y-1.5">
                {dupPreview.existing.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-amber-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-gray-800">Row {m.row}: {m.name}</span>
                    <span className="text-amber-600 ml-2">{reasonLabel(m.reason)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl text-xs text-gray-500">
              Duplicates will be skipped automatically — only new students will be enrolled.
            </div>
            <div className="px-6 py-4 flex gap-3 justify-end">
              <button
                data-testid="cancel-dup-preview-btn"
                onClick={() => { setShowDupPreview(false); setPendingStudents(null) }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                data-testid="upload-new-only-btn"
                onClick={async () => { setShowDupPreview(false); await doSubmit(pendingStudents) }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                Upload Only New ({dupPreview.new_count})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success banner */}
      {result && !showCredentials && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">✓ {result.inserted} student{result.inserted !== 1 ? 's' : ''} enrolled</p>
              {result.skipped?.length > 0 && (
                <p className="text-amber-600 text-xs mt-1">
                  {result.skipped.length} skipped — already exist
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {result.errors.map((e, i) => <p key={i} className="text-orange-600 text-xs">Row {e.row}: {e.message}</p>)}
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {hasCredentials && (
                <button onClick={() => setShowCredentials(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                  View Credentials
                </button>
              )}
              <button onClick={() => setResult(null)}
                className="text-green-400 hover:text-green-600 text-xs border border-green-200 px-2 py-1 rounded">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials modal */}
      {showCredentials && result && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Enrollment Complete — Credentials</h3>
                <p className="text-xs text-amber-600 mt-0.5">Save these now — passwords are shown once and cannot be recovered</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCopyAll} data-testid="copy-all-credentials-btn"
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${copiedAll ? 'bg-green-100 text-green-700' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {copiedAll ? '✓ Copied!' : 'Copy All'}
                </button>
                <button onClick={() => { setShowCredentials(false); onRefresh?.() }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1">×</button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-6">
              {result.skipped?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800 mb-1">
                    {result.skipped.length} student{result.skipped.length !== 1 ? 's' : ''} skipped — already exist
                  </p>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {result.skipped.map((s, i) => (
                      <p key={i} className="text-xs text-amber-700">Row {s.row}: {s.name} — {s.reason}</p>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">S</span>
                  Student Credentials
                </h4>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Student</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Grade / Roll</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Login (Email)</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Temp Password</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Reset</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.credentials.students.map((s, idx) => {
                        const stu = result.students[idx]
                        const resetResult = stu ? resetResults[stu.id] : undefined
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-medium text-gray-900">{s.name}</td>
                            <td className="px-3 py-2.5 text-gray-600">
                              {s.grade}{s.section ? `-${s.section}` : ''} {s.school_roll_number != null ? `· Roll ${s.school_roll_number}` : ''}
                            </td>
                            <td className="px-3 py-2.5">
                              {s.login.startsWith('(') ? (
                                <span className="text-gray-400 italic">{s.login}</span>
                              ) : (
                                <span className="font-mono text-gray-700">{s.login}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {resetResult ? (
                                resetResult.error ? (
                                  <span className="text-red-500 text-xs">{resetResult.error}</span>
                                ) : (
                                  <span className="font-mono bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-200">{resetResult.password}</span>
                                )
                              ) : (
                                <span className="font-mono bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">{s.temp_password}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {stu && (
                                <button
                                  data-testid={`reset-student-${stu.id}`}
                                  onClick={() => handleResetCredentials(stu.id)}
                                  disabled={resetingId === stu.id}
                                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50">
                                  {resetingId === stu.id ? 'Resetting…' : 'Reset'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {result.credentials.parents.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-600 text-xs flex items-center justify-center font-bold">P</span>
                    Parent Credentials <span className="font-normal text-gray-400">(new accounts only)</span>
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Parent Name</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Phone</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Login (Email / Phone)</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Temp Password</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {result.credentials.parents.map((p, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-medium text-gray-900">{p.name}</td>
                            <td className="px-3 py-2.5 text-gray-600">{p.phone || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-gray-700">{p.login}</td>
                            <td className="px-3 py-2.5">
                              <span className="font-mono bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">{p.temp_password}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                <strong>Note:</strong> These credentials are shown once only. After closing this panel, you can reset individual student passwords using the &quot;View Credentials&quot; button above.
                {' '}When WhatsApp is configured for your school, credentials will be sent automatically to parent phones.
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={handleCopyAll}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${copiedAll ? 'bg-green-100 text-green-700' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {copiedAll ? '✓ Copied!' : 'Copy All'}
              </button>
              <button onClick={() => { setShowCredentials(false); onRefresh?.() }}
                className="bg-gray-900 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'csv' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-1">CSV Format <span className="text-xs font-normal text-amber-600">(roll_no = class roll number, unique per grade+section)</span></p>
            <code className="block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs text-gray-600 font-mono">{CSV_HEADER}</code>
          </div>
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-1">Example (email columns optional):</p>
            <code className="block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs text-gray-500 font-mono whitespace-pre">{CSV_EXAMPLE}</code>
          </div>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300 font-mono resize-none"
            rows={8} placeholder="Paste CSV data here..."
            onChange={e => { if (e.target.value.trim()) { parseText(e.target.value); e.target.value = '' } }}
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
              <table className="w-full text-xs" data-testid="onboarding-table">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-8">#</th>
                    <th className="text-left px-3 py-2.5 font-medium text-amber-700 min-w-[80px] bg-amber-50">Roll No <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Last Name <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">First Name <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[140px]">Student Email <span className="text-gray-400 font-normal text-[10px]">(optional)</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-16">Grade <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-16">Section</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[120px]">Parent Name <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-700 min-w-[110px] bg-blue-50">Parent Phone <span className="text-red-400">*</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[150px]">Parent Email <span className="text-gray-400 font-normal text-[10px]">(optional)</span></th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[100px]">Student Phone</th>
                    <th className="px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 bg-amber-50/50 align-top">
                        <input
                          className={`${inputCls} ${rowDupWarnings[i] ? 'border-red-400 ring-1 ring-red-300' : !row.school_roll_number.trim() ? 'border-amber-300' : ''}`}
                          placeholder="1" type="number" min="1" value={row.school_roll_number}
                          aria-invalid={!!rowDupWarnings[i]}
                          data-testid={`roll-input-${i}`}
                          onChange={e => updateRow(i, 'school_roll_number', e.target.value)} />
                        {rowDupWarnings[i] && (
                          <p data-testid={`roll-dup-warning-${i}`} className="mt-1 text-[10px] leading-tight text-red-600">
                            {rowDupWarnings[i]}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Last name" value={row.last_name} onChange={e => updateRow(i, 'last_name', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="First name" value={row.first_name} onChange={e => updateRow(i, 'first_name', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Email (optional)" type="email" value={row.email} onChange={e => updateRow(i, 'email', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="10" value={row.grade} onChange={e => updateRow(i, 'grade', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="A" value={row.section} onChange={e => updateRow(i, 'section', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Parent name" value={row.parent_name} onChange={e => updateRow(i, 'parent_name', e.target.value)} /></td>
                      <td className="px-3 py-2 bg-blue-50/40">
                        <input className={`${inputCls} ${!row.parent_phone.trim() ? 'border-blue-300' : ''}`}
                          placeholder="Phone *" value={row.parent_phone} onChange={e => updateRow(i, 'parent_phone', e.target.value)} />
                      </td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="parent@email.com (optional)" type="email" value={row.parent_email} onChange={e => updateRow(i, 'parent_email', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className={inputCls} placeholder="Phone" value={row.phone} onChange={e => updateRow(i, 'phone', e.target.value)} /></td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-blue-50/30 border-t border-blue-100 flex items-center gap-4">
              <p className="text-xs text-blue-600 font-medium">Parent Phone (blue) is required for credential delivery</p>
              <p className="text-xs text-gray-400">Student/Parent Email optional — credentials sent by email if provided, else share manually</p>
              <p className="text-xs text-amber-600">Roll No unique within Grade + Section</p>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <button onClick={addRow} className="text-sm text-green-600 hover:text-green-800 font-medium">+ Add Row</button>
              <div className="flex items-center gap-3">
                {hasRowDupes && (
                  <span className="text-xs text-red-600 font-medium">Fix duplicate roll numbers before enrolling</span>
                )}
                <span className="text-xs text-gray-400">{rows.filter(r => r.last_name.trim() || r.first_name.trim()).length} of {rows.length} rows ready</span>
                <button onClick={handleSubmit} disabled={submitting || checking || hasRowDupes || rows.every(r => !r.last_name.trim() && !r.first_name.trim())}
                  data-testid="enroll-students-btn"
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {checking ? 'Checking...' : submitting ? 'Enrolling...' : 'Enroll Students'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {(submitting || checking) && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-5 min-w-[280px]">
            <svg className="w-10 h-10 animate-spin text-green-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="text-center">
              <p className="text-base font-bold text-gray-800">{checking ? 'Checking for duplicates…' : 'Enrolling students…'}</p>
              {submitting && <p className="text-sm text-gray-500 mt-1">Processing {submitCount} student{submitCount !== 1 ? 's' : ''}, please wait</p>}
            </div>
            {submitting && (
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-2 rounded-full bg-green-500 animate-pulse w-3/4" />
              </div>
            )}
            <p className="text-xs text-gray-400">Do not close or refresh this page</p>
          </div>
        </div>
      )}
    </div>
  )
}
