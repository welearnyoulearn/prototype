'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { isValidName } from '@/lib/nameValidation'
import { GradesMultiSelect } from '@/components/ui/grades-multiselect'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { normalizeStaffInput } from '@/lib/staffValidation'

type Props = { schoolId: number; onRefresh?: () => void }
type SubjectOption = { name: string; source: 'master' | 'custom' }

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
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000
const hasAnyValue = (row: TeacherRow) => Object.values(row).some(value => value.trim() && value !== 'teaching')

function normalizeStaffType(raw: string): string {
  const v = raw.toLowerCase().replace(/[\s\-]/g, '_')
  if (v === 'nonteaching' || v === 'non_teaching') return 'non_teaching'
  return v || 'teaching'
}

// Excel is intentional: its dropdown uses the same canonical master +
// school-custom subject catalog as this screen and the bulk API.
function downloadExcelTemplate(schoolId: number) {
  const a = document.createElement('a')
  a.href = `/api/teachers/template?school_id=${schoolId}`
  a.download = 'staff_template.xlsx'
  a.click()
}

function rowErrors(row: TeacherRow): string[] {
  return normalizeStaffInput(row).errors
}

export default function StaffOnboarding({ schoolId, onRefresh }: Props) {
  const [rows, setRows] = useState<TeacherRow[]>([{ ...EMPTY_ROW }])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    inserted: number
    teachers: { employee_id: string }[]
    credentials: { employee_id: string; email: string; temp_password: string }[]
    errors: { row: number; message: string }[]
  } | null>(null)
  const [error, setError] = useState('')
  const [csvWarn, setCsvWarn] = useState('')
  const [staffCount, setStaffCount] = useState<number | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([])

  const fetchStaffCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/overview?school_id=${schoolId}&features=`)
      if (res.ok) {
        const d = await res.json()
        setStaffCount(d.core?.teachers ?? null)
      }
    } catch { /* non-critical */ }
  }, [schoolId])

  const fetchSubjectOptions = useCallback(async () => {
    try {
      const res = await fetch(`/api/teachers/subject-options?school_id=${schoolId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load subjects')
      setSubjectOptions(Array.isArray(data.subjects) ? data.subjects : [])
    } catch (err) {
      setSubjectOptions([])
      setError(err instanceof Error ? err.message : 'Failed to load subjects')
    }
  }, [schoolId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchStaffCount(); void fetchSubjectOptions() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchStaffCount, fetchSubjectOptions])

  useEffect(() => {
    const key = `staff-onboarding-draft:${schoolId}`
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(key)
        if (raw) {
          const saved = JSON.parse(raw) as { savedAt: number; rows: TeacherRow[] }
          if (Date.now() - saved.savedAt < DRAFT_TTL_MS && Array.isArray(saved.rows) && saved.rows.length) setRows(saved.rows)
          else sessionStorage.removeItem(key)
        }
      } catch { sessionStorage.removeItem(key) }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [schoolId])

  useEffect(() => {
    const key = `staff-onboarding-draft:${schoolId}`
    const timer = window.setTimeout(() => {
      if (rows.some(hasAnyValue)) sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), rows }))
      else sessionStorage.removeItem(key)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [rows, schoolId])

  function updateRow(index: number, field: keyof TeacherRow, value: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() { setRows(prev => [...prev, { ...EMPTY_ROW }]) }

  function removeRow(index: number) {
    if (rows.length === 1) return
    setRows(prev => prev.filter((_, i) => i !== index))
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
    const populated = rows.map((row, index) => ({ row, index })).filter(({ row }) => hasAnyValue(row))
    if (populated.length === 0) { setError('Add at least one staff member before submitting'); return }

    const allErrs = populated.flatMap(({ row, index }) => rowErrors(row).map(e => `Row ${index + 1}: ${e}`))
    if (allErrs.length > 0) { setError(allErrs.join(' · ')); return }

    setSubmitting(true); setError(''); setResult(null); setCsvWarn('')
    try {
      const res = await fetch('/api/teachers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, teachers: populated.map(item => item.row) }),
      })
      const data = await res.json()
      if (!res.ok) {
        const rowDetails = Array.isArray(data.errors) ? data.errors.map((e: { row: number; message: string }) => `Row ${e.row}: ${e.message}`).join(' · ') : ''
        const message = [data.error, rowDetails].filter(Boolean).join(' — ')
        if (res.status === 401) throw new Error('Your session expired. Your draft is saved — sign in again and return to Staff Onboarding.')
        throw new Error(message || 'Failed to onboard staff')
      }
      setResult(data)
      setRows([{ ...EMPTY_ROW }])
      setShowErrors(false)
      sessionStorage.removeItem(`staff-onboarding-draft:${schoolId}`)
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
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Staff Onboarding</h2>
            <p className="text-sm text-gray-500 mt-0.5">Assign class teachers from Class Management after onboarding</p>
          </div>
          {staffCount !== null && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-4 py-2">
              <span className="text-2xl font-semibold text-blue-600">{staffCount}</span>
              <div>
                <p className="text-xs font-semibold text-blue-700 leading-none">Staff</p>
                <button onClick={fetchStaffCount} className="text-xs text-blue-400 hover:text-blue-600">refresh</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
        <div role="status" aria-live="polite" className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>⚠ {csvWarn}</span>
          <button onClick={() => setCsvWarn('')} className="text-amber-400 hover:text-amber-600 ml-4">✕</button>
        </div>
      )}

      {error && (
        <div role="alert" aria-live="assertive" className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}{error.includes('session expired') && <> <a href="/login?role=school" className="font-semibold underline">Sign in again</a></>}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      <Dialog open={Boolean(result)} onOpenChange={open => { if (!open) { setResult(null); onRefresh?.() } }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{result?.inserted} staff member{result?.inserted === 1 ? '' : 's'} onboarded</DialogTitle>
            <DialogDescription>
              Email delivery is attempted automatically. Save these one-time passwords now so you can securely help anyone whose email is delayed.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50"><tr><th className="p-2 text-left">Employee ID</th><th className="p-2 text-left">Login email</th><th className="p-2 text-left">Temporary password</th></tr></thead>
              <tbody>
                {result?.credentials.map(credential => (
                  <tr key={credential.employee_id} className="border-t">
                    <td className="p-2 font-mono">{credential.employee_id}</td>
                    <td className="p-2">{credential.email}</td>
                    <td className="p-2 font-mono">{credential.temp_password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => navigator.clipboard.writeText((result?.credentials ?? []).map(c => `${c.employee_id}\t${c.email}\t${c.temp_password}`).join('\n'))}
              className="border border-gray-200 px-4 py-2 rounded-md text-sm">Copy credentials</button>
            <button type="button" data-testid="staff-onboard-dismiss-result" onClick={() => { setResult(null); onRefresh?.() }}
              className="bg-primary text-white px-4 py-2 rounded-md text-sm">Done</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 w-8">#</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[130px]">Name <span className="text-red-400">*</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-700 min-w-[140px] bg-blue-50">Email <span className="text-red-400">*</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Subject <span className="text-red-400">*</span> <span className="text-muted-foreground text-xs">(teaching only)</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[100px]">Phone <span className="text-red-400">*</span></th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Department</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[120px]">Qualification</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Joining Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[110px]">Staff Type</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-[130px]">
                    Teaches Grades <span className="text-amber-500 text-xs font-semibold">← important</span>
                  </th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => {
                  const errs = showErrors ? rowErrors(row) : []
                  return (
                    <tr key={i} className={`hover:bg-gray-50 ${errs.length > 0 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <input required aria-required="true" aria-label={`Row ${i + 1} staff name`} data-testid={`staff-row-name-${i}`} className={cellCls(row, 'name')} placeholder="Full name *" value={row.name} onChange={e => updateRow(i, 'name', e.target.value)} />
                      </td>
                      <td className="px-3 py-2"><input required aria-required="true" aria-label={`Row ${i + 1} login email`} data-testid={`staff-row-email-${i}`} className={cellCls(row, 'email')} placeholder="Email *" type="email" value={row.email} onChange={e => updateRow(i, 'email', e.target.value)} /></td>
                      <td className="px-3 py-2">
                        <select
                          required={row.staff_type === 'teaching'}
                          aria-required={row.staff_type === 'teaching'}
                          aria-label={`Row ${i + 1} subject`}
                          disabled={row.staff_type !== 'teaching'}
                          className={cellCls(row, 'subject')}
                          value={row.subject}
                          onChange={e => updateRow(i, 'subject', e.target.value)}>
                          <option value="">{row.staff_type === 'teaching' ? 'Select subject *' : 'N/A'}</option>
                          {subjectOptions.some(option => option.source === 'master') && (
                            <optgroup label="Master syllabus">
                              {subjectOptions.filter(option => option.source === 'master').map(option => (
                                <option key={`master-${option.name}`} value={option.name}>{option.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {subjectOptions.some(option => option.source === 'custom') && (
                            <optgroup label="This school’s custom subjects">
                              {subjectOptions.filter(option => option.source === 'custom').map(option => (
                                <option key={`custom-${option.name}`} value={option.name}>{option.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-2"><input required aria-required="true" aria-label={`Row ${i + 1} phone`} data-testid={`staff-row-phone-${i}`} className={cellCls(row, 'phone')} placeholder="Phone *" value={row.phone} onChange={e => updateRow(i, 'phone', e.target.value)} /></td>
                      <td className="px-3 py-2"><input aria-label={`Row ${i + 1} department`} className={inputCls} placeholder="Department" value={row.department} onChange={e => updateRow(i, 'department', e.target.value)} /></td>
                      <td className="px-3 py-2"><input aria-label={`Row ${i + 1} qualification`} className={inputCls} placeholder="B.Ed, M.Sc..." value={row.qualification} onChange={e => updateRow(i, 'qualification', e.target.value)} /></td>
                      <td className="px-3 py-2"><input aria-label={`Row ${i + 1} date of joining`} className={inputCls} type="date" value={row.date_of_joining} onChange={e => updateRow(i, 'date_of_joining', e.target.value)} /></td>
                      <td className="px-3 py-2">
                        <select aria-label={`Row ${i + 1} staff type`} value={row.staff_type} onChange={e => {
                          const staffType = e.target.value
                          setRows(prev => prev.map((item, index) => index === i
                            ? { ...item, staff_type: staffType, ...(staffType === 'non_teaching' ? { subject: '', teaches_grades: '' } : {}) }
                            : item))
                        }}
                          className="w-full border border-gray-200 rounded px-1.5 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300">
                          <option value="teaching">Teaching</option>
                          <option value="non_teaching">Non-Teaching</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {row.staff_type === 'teaching' ? (
                          <div className="space-y-0.5">
                            <GradesMultiSelect
                              value={row.teaches_grades}
                              onChange={v => updateRow(i, 'teaches_grades', v)}
                              testIdBase={`teaches-grade-${i}`}
                              size="sm"
                              align="end"
                              panelWidth={240}
                            />
                            {!row.teaches_grades.trim() && row.name.trim() && (
                              <p className="text-xs text-amber-500 leading-tight">
                                ⚠ No grades = teaches all
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs italic">N/A</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" aria-label={`Remove staff row ${i + 1}`} data-testid={`staff-row-remove-${i}`} onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-blue-50/30 border-t border-blue-100 flex items-center gap-4 flex-wrap">
            <p className="text-xs text-blue-600 font-medium">Email (blue) is required — login credentials are sent there</p>
            <p className="text-xs text-muted-foreground">Phone is required for all staff</p>
            <p className="text-xs text-muted-foreground">Subject required for teaching staff only</p>
            <p className="text-xs text-amber-600">Teaches Grades — leave blank for all grades</p>
          </div>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-muted-foreground">
              <strong className="text-gray-500">Teaches Grades</strong> — use the dropdown to select grades, or leave blank to teach all grades.
            </p>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-3 bg-gray-50 sm:flex-row sm:items-center sm:justify-between">
            <button onClick={addRow} data-testid="staff-add-row" className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Add Row</button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{rows.filter(r => r.name.trim()).length} of {rows.length} rows ready</span>
              <button onClick={handleSubmit} disabled={submitting}
                data-testid="staff-onboard-submit"
                className="bg-primary hover:bg-primary/90 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {submitting ? 'Onboarding...' : 'Onboard Staff'}
              </button>
            </div>
          </div>
        </div>
    </div>
  )
}
