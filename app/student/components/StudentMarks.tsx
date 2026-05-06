'use client'

import { useEffect, useState } from 'react'

type SubjectResult = {
  subject_name: string
  max_marks: number
  marks_obtained: number | null
  is_absent: boolean
  percentage: number | null
  grade: string | null
  pass: boolean | null
}

type ExamResult = {
  exam_id: number
  exam_name: string
  exam_type: string
  exam_date: string
  passing_pct: number
  published_at: string
  subjects: SubjectResult[]
  total_obtained: number | null
  total_max: number
  percentage: number | null
  grade: string | null
  pass: boolean | null
  parent_acknowledged: boolean
  parent_ack_name: string | null
  parent_ack_at: string | null
}

type Props = {
  studentId: number
  schoolId: number
  classId: number
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test',
  mid_term: 'Mid Term',
  final_exam: 'Final Exam',
  practical: 'Practical',
}

const GRADE_COLORS: Record<string, string> = {
  A1: 'bg-emerald-100 text-emerald-800',
  A2: 'bg-green-100 text-green-800',
  B1: 'bg-teal-100 text-teal-800',
  B2: 'bg-cyan-100 text-cyan-800',
  C1: 'bg-blue-100 text-blue-800',
  C2: 'bg-indigo-100 text-indigo-800',
  D: 'bg-amber-100 text-amber-800',
  E: 'bg-red-100 text-red-800',
}

export default function StudentMarks({ studentId, schoolId, classId }: Props) {
  const [exams, setExams] = useState<ExamResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [ackingId, setAckingId] = useState<number | null>(null)
  const [ackName, setAckName] = useState('')
  const [ackPhone, setAckPhone] = useState('')
  const [ackSaving, setAckSaving] = useState(false)
  const [ackError, setAckError] = useState('')

  useEffect(() => {
    fetchExams()
  }, [studentId, schoolId, classId])

  async function fetchExams() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/students/${studentId}/exams?school_id=${schoolId}&class_id=${classId}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setExams(data)
      if (data.length > 0) setExpanded(data[0].exam_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load marks')
    } finally {
      setLoading(false)
    }
  }

  async function submitAck(examId: number) {
    if (!ackName.trim()) { setAckError('Parent name is required'); return }
    setAckSaving(true)
    setAckError('')
    try {
      const res = await fetch(`/api/exams/${examId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, school_id: schoolId, parent_name: ackName.trim(), parent_phone: ackPhone.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setAckingId(null)
      setAckName('')
      setAckPhone('')
      fetchExams()
    } catch (e: unknown) {
      setAckError(e instanceof Error ? e.message : 'Failed to submit')
    } finally {
      setAckSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={fetchExams} className="mt-3 text-sm text-red-700 underline">Retry</button>
      </div>
    )
  }

  if (exams.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
        <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">No Results Yet</h3>
        <p className="text-sm text-gray-400">Exam results will appear here once published by your teacher.</p>
      </div>
    )
  }

  const latestExam = exams[0]

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {latestExam.percentage !== null && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Latest Result</p>
            <p className="text-white font-bold text-lg mt-0.5">{latestExam.exam_name}</p>
            <p className="text-blue-200 text-sm">{EXAM_TYPE_LABELS[latestExam.exam_type] || latestExam.exam_type} · {latestExam.exam_date}</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black">{latestExam.percentage}%</div>
            <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold mt-1 ${latestExam.pass ? 'bg-green-400 text-green-900' : 'bg-red-400 text-red-900'}`}>
              {latestExam.grade} · {latestExam.pass ? 'PASS' : 'FAIL'}
            </div>
          </div>
        </div>
      )}

      {/* Exam cards */}
      {exams.map((exam) => (
        <div key={exam.exam_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setExpanded(expanded === exam.exam_id ? null : exam.exam_id)}
          >
            <div className="flex items-center gap-3 text-left">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black ${exam.pass === true ? 'bg-green-100 text-green-700' : exam.pass === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                {exam.grade || '—'}
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{exam.exam_name}</p>
                <p className="text-xs text-gray-400">{EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type} · {exam.exam_date}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {exam.percentage !== null && (
                <div className="text-right">
                  <div className="text-base font-bold text-gray-800">{exam.percentage}%</div>
                  <div className={`text-xs font-semibold ${exam.pass ? 'text-green-600' : 'text-red-500'}`}>
                    {exam.pass ? 'PASS' : 'FAIL'}
                  </div>
                </div>
              )}
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${expanded === exam.exam_id ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Expanded detail */}
          {expanded === exam.exam_id && (
            <div className="border-t border-gray-100 px-4 py-3">
              {/* Subject marks table */}
              <div className="overflow-x-auto">
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left pb-2 font-medium">Subject</th>
                    <th className="text-right pb-2 font-medium">Marks</th>
                    <th className="text-right pb-2 font-medium">%</th>
                    <th className="text-right pb-2 font-medium">Grade</th>
                    <th className="text-right pb-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {exam.subjects.map((sub) => (
                    <tr key={sub.subject_name} className="hover:bg-gray-50">
                      <td className="py-2 text-gray-700 font-medium">{sub.subject_name}</td>
                      <td className="py-2 text-right text-gray-600">
                        {sub.is_absent ? (
                          <span className="text-amber-500 text-xs font-semibold">ABSENT</span>
                        ) : sub.marks_obtained !== null ? (
                          `${sub.marks_obtained}/${sub.max_marks}`
                        ) : '—'}
                      </td>
                      <td className="py-2 text-right text-gray-600">
                        {sub.percentage !== null ? `${sub.percentage}%` : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {sub.grade ? (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[sub.grade] || 'bg-gray-100 text-gray-600'}`}>
                            {sub.grade}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {sub.pass === true && <span className="text-green-600 text-xs font-semibold">Pass</span>}
                        {sub.pass === false && <span className="text-red-500 text-xs font-semibold">Fail</span>}
                        {sub.pass === null && <span className="text-gray-400 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {exam.total_obtained !== null && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 font-semibold">
                      <td className="pt-2 text-gray-800">Total</td>
                      <td className="pt-2 text-right text-gray-800">{exam.total_obtained}/{exam.total_max}</td>
                      <td className="pt-2 text-right text-gray-800">{exam.percentage}%</td>
                      <td className="pt-2 text-right">
                        {exam.grade && (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[exam.grade] || 'bg-gray-100 text-gray-600'}`}>
                            {exam.grade}
                          </span>
                        )}
                      </td>
                      <td className="pt-2 text-right">
                        <span className={`text-xs font-bold ${exam.pass ? 'text-green-600' : 'text-red-500'}`}>
                          {exam.pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
              </div>

              {/* Parent acknowledgement */}
              <div className="border-t border-gray-100 pt-3">
                {exam.parent_acknowledged ? (
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                    <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      Acknowledged by <strong>{exam.parent_ack_name}</strong>
                      {exam.parent_ack_at && ` on ${new Date(exam.parent_ack_at).toLocaleDateString()}`}
                    </span>
                  </div>
                ) : ackingId === exam.exam_id ? (
                  <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-800 mb-1">Parent Acknowledgement</p>
                    <input
                      type="text"
                      placeholder="Parent / Guardian name *"
                      value={ackName}
                      onChange={e => setAckName(e.target.value)}
                      className="w-full border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    <input
                      type="tel"
                      placeholder="Phone number (optional)"
                      value={ackPhone}
                      onChange={e => setAckPhone(e.target.value)}
                      className="w-full border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    {ackError && <p className="text-xs text-red-600">{ackError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitAck(exam.exam_id)}
                        disabled={ackSaving}
                        className="flex-1 bg-blue-600 text-white text-sm rounded-lg py-1.5 font-semibold disabled:opacity-50"
                      >
                        {ackSaving ? 'Saving...' : 'Confirm & Sign'}
                      </button>
                      <button
                        onClick={() => { setAckingId(null); setAckName(''); setAckPhone(''); setAckError('') }}
                        className="px-4 text-sm text-gray-500 border border-gray-200 rounded-lg py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAckingId(exam.exam_id)}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-blue-300 text-blue-600 text-xs font-semibold rounded-lg py-2 hover:bg-blue-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Parent has seen this result — tap to acknowledge
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
