'use client'

import { useEffect, useRef, useState } from 'react'
import { calcGrade } from '@/lib/examGrading'

// ── Types ──────────────────────────────────────────────────────────────────

type ClassRow = { id: number; grade: string; section: string }

type ExamRow = {
  id: number
  exam_name: string
  exam_type: string
  exam_date: string | null
  status: string
  class_id: number
  grade: string
  section: string
}

type SubjectStat = {
  subject_name: string
  teacher_name: string
  max_marks: number
  avg_marks: number | null
  pass_count: number
  fail_count: number
  absent_count: number
}

type StudentResult = {
  student_id: number
  name: string
  roll_number: string
  subjects: { subject_name: string; marks_obtained: number | null; is_absent: boolean; max_marks: number }[]
  total_obtained: number
  total_max: number
  percentage: number
  grade_label: string
  result: 'PASS' | 'FAIL' | 'ABSENT'
}

type MarksData = {
  exam: { exam_name: string; exam_type: string; exam_date: string; passing_pct: number; grade: string; section: string }
  subject_stats: SubjectStat[]
  student_results: StudentResult[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test', midterm: 'Midterm', final: 'Final Exam',
  quarterly: 'Quarterly', half_yearly: 'Half-Yearly', annual: 'Annual',
}

// Uses the same grading ladder as every other exam screen (lib/examGrading.ts)
// — this file previously had its own third, different A+/A/B/C/D/F ladder,
// so the same score could show a different grade letter here than on the
// Results & Analysis tab or the student/parent portals.
function gradeLabel(pct: number): string {
  return calcGrade(pct)
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ExportCenter({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState<'attendance' | 'marks' | 'report-card'>('attendance')

  // Shared data
  const [classes, setClasses]         = useState<ClassRow[]>([])
  const [exams, setExams]             = useState<ExamRow[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  // Attendance export
  const [attClass, setAttClass]   = useState('')
  const [attFrom, setAttFrom]     = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [attTo, setAttTo]         = useState(new Date().toISOString().slice(0, 10))
  const [attLoading, setAttLoading] = useState(false)

  // Marks export
  const [marksExam, setMarksExam]     = useState('')
  const [marksLoading, setMarksLoading] = useState(false)

  // Report card
  const [rcExam, setRcExam]           = useState('')
  const [rcData, setRcData]           = useState<MarksData | null>(null)
  const [rcLoading, setRcLoading]     = useState(false)
  const [rcError, setRcError]         = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  // School info
  const [schoolName, setSchoolName]   = useState('')

  useEffect(() => {
    async function init() {
      setLoadingMeta(true)
      try {
        const [cr, er, sr] = await Promise.all([
          fetch(`/api/classes?school_id=${schoolId}`),
          fetch(`/api/exams?school_id=${schoolId}`),
          fetch(`/api/schools/${schoolId}`),
        ])
        if (cr.ok) { const d = await cr.json(); setClasses(d) }
        if (er.ok) {
          const d: ExamRow[] = await er.json()
          setExams(d.filter((e: ExamRow) => e.status === 'released'))
        }
        if (sr.ok) { const d = await sr.json(); setSchoolName(d.name) }
      } finally {
        setLoadingMeta(false)
      }
    }
    init()
  }, [schoolId])

  // ── Attendance CSV download ──────────────────────────────────────────────

  async function downloadAttendance() {
    if (!attClass || !attFrom || !attTo) return
    setAttLoading(true)
    try {
      const url = `/api/export/attendance?school_id=${schoolId}&class_id=${attClass}&from=${attFrom}&to=${attTo}`
      const r = await fetch(url)
      if (!r.ok) { alert('Export failed'); return }
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `attendance_${attFrom}_to_${attTo}.csv`
      a.click()
    } finally {
      setAttLoading(false)
    }
  }

  // ── Marks CSV download ───────────────────────────────────────────────────

  async function downloadMarks() {
    if (!marksExam) return
    setMarksLoading(true)
    try {
      const url = `/api/export/marks?school_id=${schoolId}&exam_id=${marksExam}`
      const r = await fetch(url)
      if (!r.ok) { alert('Export failed'); return }
      const blob = await r.blob()
      const examLabel = exams.find(e => String(e.id) === marksExam)?.exam_name ?? 'marks'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `marks_${examLabel.replace(/\s+/g, '_')}.csv`
      a.click()
    } finally {
      setMarksLoading(false)
    }
  }

  // ── Report card preview ──────────────────────────────────────────────────

  async function loadReportCard() {
    if (!rcExam) return
    setRcLoading(true); setRcError('')
    try {
      const r = await fetch(`/api/exams/${rcExam}/marks?school_id=${schoolId}`)
      if (!r.ok) { setRcError('Failed to load results'); return }
      const raw = await r.json()

      const exam = exams.find(e => String(e.id) === rcExam)
      if (!exam) return

      // GET /api/exams/[id]/marks nests exam fields under raw.exam and
      // returns the per-student rows under raw.students (not
      // raw.student_results) — this mismatch previously meant
      // passing_pct/exam_name always fell back to stale exam-list data and
      // student_results was always empty, silently rendering zero students
      // in the report card preview.
      const passingPct = raw.exam?.passing_pct ?? 35
      const data: MarksData = {
        exam: {
          exam_name:   raw.exam?.exam_name ?? exam.exam_name,
          exam_type:   exam.exam_type,
          exam_date:   exam.exam_date ?? '',
          passing_pct: passingPct,
          grade:       exam.grade,
          section:     exam.section,
        },
        subject_stats: (raw.subject_stats ?? []).map((s: { subject_name: string; teacher_name: string | null; max_marks: number; avg_marks: number | null; pass_count: number; fail_count: number; absent_count: number }) => ({
          subject_name: s.subject_name,
          teacher_name: s.teacher_name ?? '—',
          max_marks: s.max_marks,
          avg_marks: s.avg_marks,
          pass_count: s.pass_count,
          fail_count: s.fail_count,
          absent_count: s.absent_count,
        })),
        student_results: (raw.students ?? []).map((s: {
          student_id: number; name: string; roll_number: string
          subjects: Record<string, { marks_obtained: number | null; is_absent: boolean }>
          total_obtained: number | null; total_max: number; percentage: number | null; any_absent?: boolean
        }) => {
          const pct = s.percentage ?? 0
          const subjectsArr = Object.entries(s.subjects).map(([subject_name, m]) => {
            const subStat = (raw.subject_stats ?? []).find((ss: { subject_name: string }) => ss.subject_name === subject_name)
            return { subject_name, marks_obtained: m.marks_obtained, is_absent: m.is_absent, max_marks: subStat?.max_marks ?? 0 }
          })
          return {
            student_id: s.student_id,
            name: s.name,
            roll_number: s.roll_number,
            subjects: subjectsArr,
            total_obtained: s.total_obtained ?? 0,
            total_max: s.total_max,
            percentage: pct,
            grade_label: s.percentage !== null ? gradeLabel(pct) : '—',
            result: s.any_absent ? 'ABSENT' : pct >= passingPct ? 'PASS' : 'FAIL',
          } satisfies StudentResult
        }),
      }
      setRcData(data)
    } finally {
      setRcLoading(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  const selectedExamObj = exams.find(e => String(e.id) === rcExam)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">Export Center</h2>
        <p className="text-sm text-gray-400 mt-0.5">Download CSV reports and print report cards</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([
          ['attendance', 'Attendance CSV'],
          ['marks',      'Marks CSV'],
          ['report-card','Report Cards'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ATTENDANCE EXPORT ──────────────────────────────────────── */}
      {tab === 'attendance' && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-5 max-w-lg">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Export Attendance</h3>
            <p className="text-xs text-gray-400 mt-0.5">Downloads a CSV with morning & afternoon sessions per student per day</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Class *</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={attClass}
              onChange={e => setAttClass(e.target.value)}
            >
              <option value="">Select class…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">From Date *</label>
              <input type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={attFrom}
                onChange={e => setAttFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">To Date *</label>
              <input type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={attTo}
                onChange={e => setAttTo(e.target.value)}
                min={attFrom}
              />
            </div>
          </div>

          <button
            onClick={downloadAttendance}
            disabled={!attClass || !attFrom || !attTo || attLoading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {attLoading ? 'Exporting…' : 'Download Attendance CSV'}
          </button>
        </div>
      )}

      {/* ── MARKS EXPORT ──────────────────────────────────────────── */}
      {tab === 'marks' && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-5 max-w-lg">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Export Marks</h3>
            <p className="text-xs text-gray-400 mt-0.5">Downloads a CSV with per-student per-subject marks, totals and results</p>
          </div>

          {loadingMeta ? (
            <p className="text-sm text-gray-400">Loading exams…</p>
          ) : exams.length === 0 ? (
            <div className="bg-amber-50 border border-amber-100 text-amber-700 text-sm px-4 py-3 rounded-xl">
              No published exams found. Publish an exam first from the Exam Schedule.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Select Exam *</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={marksExam}
                  onChange={e => setMarksExam(e.target.value)}
                >
                  <option value="">Select exam…</option>
                  {exams.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.exam_name} — {e.grade}-{e.section} ({EXAM_TYPE_LABELS[e.exam_type] ?? e.exam_type})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={downloadMarks}
                disabled={!marksExam || marksLoading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {marksLoading ? 'Exporting…' : 'Download Marks CSV'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── REPORT CARDS ──────────────────────────────────────────── */}
      {tab === 'report-card' && (
        <div className="space-y-5">
          {/* Selector */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Select Exam</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={rcExam}
                onChange={e => { setRcExam(e.target.value); setRcData(null) }}
              >
                <option value="">Select published exam…</option>
                {exams.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.exam_name} — {e.grade}-{e.section}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={loadReportCard}
              disabled={!rcExam || rcLoading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {rcLoading ? 'Loading…' : 'Generate'}
            </button>
            {rcData && (
              <button
                onClick={handlePrint}
                className="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print All
              </button>
            )}
          </div>

          {rcError && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{rcError}</div>
          )}

          {/* Report cards preview */}
          {rcData && (
            <div ref={printRef} className="space-y-6 print:space-y-0">
              <style>{`
                @media print {
                  body > *:not(#report-card-root) { display: none !important; }
                  .no-print { display: none !important; }
                  .print-page { page-break-after: always; padding: 24px; }
                }
              `}</style>

              {rcData.student_results.map((student, idx) => (
                <div key={student.student_id}
                  className="print-page bg-white border-2 border-gray-200 rounded-2xl overflow-hidden shadow-sm">

                  {/* Report card header */}
                  <div className="bg-indigo-700 text-white px-8 py-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest opacity-75">Report Card</p>
                      <h3 className="text-xl font-bold mt-0.5">{schoolName || 'School'}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-75">{EXAM_TYPE_LABELS[rcData.exam.exam_type] ?? rcData.exam.exam_type}</p>
                      <p className="font-semibold">{rcData.exam.exam_name}</p>
                      <p className="text-xs opacity-75">Class {rcData.exam.grade}-{rcData.exam.section}</p>
                    </div>
                  </div>

                  {/* Student info */}
                  <div className="px-8 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Student Name</p>
                      <p className="text-lg font-bold text-gray-800">{student.name}</p>
                      {student.roll_number && (
                        <p className="text-xs text-gray-400">Roll No: {student.roll_number}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Exam Date</p>
                      <p className="text-sm font-medium text-gray-700">{rcData.exam.exam_date || '—'}</p>
                    </div>
                    <div className={`text-center px-6 py-3 rounded-xl ${
                      student.result === 'PASS' ? 'bg-green-100' :
                      student.result === 'ABSENT' ? 'bg-gray-100' : 'bg-red-100'
                    }`}>
                      <p className="text-xs text-gray-500">Result</p>
                      <p className={`text-2xl font-black ${
                        student.result === 'PASS' ? 'text-green-600' :
                        student.result === 'ABSENT' ? 'text-gray-500' : 'text-red-600'
                      }`}>{student.result}</p>
                      <p className="text-sm font-bold text-gray-700">{student.grade_label}</p>
                    </div>
                  </div>

                  {/* Marks table */}
                  <div className="px-8 py-4 overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</th>
                          <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Max Marks</th>
                          <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Obtained</th>
                          <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">%</th>
                          <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {student.subjects.map(sub => {
                          const pct = sub.max_marks > 0 && !sub.is_absent && sub.marks_obtained != null
                            ? Math.round((sub.marks_obtained / sub.max_marks) * 100) : null
                          const gl = pct != null ? gradeLabel(pct) : '—'
                          return (
                            <tr key={sub.subject_name} className="border-b border-gray-100">
                              <td className="py-2.5 font-medium text-gray-800">{sub.subject_name}</td>
                              <td className="py-2.5 text-center text-gray-600">{sub.max_marks}</td>
                              <td className={`py-2.5 text-center font-semibold ${
                                sub.is_absent ? 'text-gray-400' :
                                pct != null && pct < rcData.exam.passing_pct ? 'text-red-500' : 'text-gray-800'
                              }`}>
                                {sub.is_absent ? 'AB' : sub.marks_obtained ?? '—'}
                              </td>
                              <td className="py-2.5 text-center text-gray-500 text-xs">{pct != null ? `${pct}%` : '—'}</td>
                              <td className="py-2.5 text-center">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  gl === 'F' ? 'bg-red-100 text-red-600' :
                                  gl === 'A+' || gl === 'A' ? 'bg-green-100 text-green-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{gl}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50">
                          <td className="py-3 font-bold text-gray-800">Total</td>
                          <td className="py-3 text-center font-bold text-gray-800">{student.total_max}</td>
                          <td className="py-3 text-center font-bold text-gray-800">{student.total_obtained}</td>
                          <td className="py-3 text-center font-bold text-indigo-700">{student.percentage}%</td>
                          <td className="py-3 text-center">
                            <span className={`text-sm font-black px-3 py-1 rounded-full ${
                              student.grade_label === 'F' ? 'bg-red-100 text-red-600' :
                              ['A+','A'].includes(student.grade_label) ? 'bg-green-100 text-green-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>{student.grade_label}</span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="px-8 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                    <p className="text-xs text-gray-400">Passing criteria: {rcData.exam.passing_pct}% overall</p>
                    <p className="text-xs text-gray-400">Generated by WLYL School Management</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
