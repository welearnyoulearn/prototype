'use client'

import { useEffect, useState } from 'react'
import { GRADE_COLORS, type ExamGrade } from '@/lib/examGrading'

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
  released_at: string
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

export default function StudentMarks({ studentId, schoolId, classId }: Props) {
  const [exams, setExams] = useState<ExamResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scoreCardExam, setScoreCardExam] = useState<ExamResult | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    fetchExams()
  }, [studentId, schoolId, classId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchExams() {
    setLoading(true)
    try {
      const res = await fetch(`/api/students/${studentId}/exams?school_id=${schoolId}&class_id=${classId}`)
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
        <p className="text-sm text-gray-400">Exam results will appear here once released by your school.</p>
      </div>
    )
  }

  const latestExam = exams[0]

  return (
    <div className="space-y-4">
      {latestExam.percentage !== null && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Latest Result</p>
            <p className="text-white font-bold text-lg mt-0.5">{latestExam.exam_name}</p>
            <p className="text-blue-200 text-sm">{EXAM_TYPE_LABELS[latestExam.exam_type] || latestExam.exam_type} · {latestExam.exam_date}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-3xl font-black">{latestExam.percentage}%</div>
              <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold mt-1 ${latestExam.pass ? 'bg-green-400 text-green-900' : 'bg-red-400 text-red-900'}`}>
                {latestExam.grade} · {latestExam.pass ? 'PASS' : 'FAIL'}
              </div>
            </div>
            <button onClick={() => setScoreCardExam(latestExam)} data-testid="view-score-card"
              className="bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
              View Score Card
            </button>
          </div>
        </div>
      )}

      {exams.map((exam) => (
        <div key={exam.exam_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setExpanded(expanded === exam.exam_id ? null : exam.exam_id)}>
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
                  <div className={`text-xs font-semibold ${exam.pass ? 'text-green-600' : 'text-red-500'}`}>{exam.pass ? 'PASS' : 'FAIL'}</div>
                </div>
              )}
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === exam.exam_id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {expanded === exam.exam_id && (
            <div className="border-t border-gray-100 px-4 py-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm mb-3">
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
                          {sub.is_absent ? <span className="text-amber-500 text-xs font-semibold">ABSENT</span> : sub.marks_obtained !== null ? `${sub.marks_obtained}/${sub.max_marks}` : '—'}
                        </td>
                        <td className="py-2 text-right text-gray-600">{sub.percentage !== null ? `${sub.percentage}%` : '—'}</td>
                        <td className="py-2 text-right">
                          {sub.grade ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[sub.grade as ExamGrade] ?? 'bg-gray-100 text-gray-600'}`}>{sub.grade}</span>
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
                          {exam.grade && <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[exam.grade as ExamGrade] ?? 'bg-gray-100 text-gray-600'}`}>{exam.grade}</span>}
                        </td>
                        <td className="pt-2 text-right">
                          <span className={`text-xs font-bold ${exam.pass ? 'text-green-600' : 'text-red-500'}`}>{exam.pass ? 'PASS' : 'FAIL'}</span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="border-t border-gray-100 pt-3 flex items-center justify-between gap-3">
                {exam.parent_acknowledged ? (
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 flex-1">
                    <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Acknowledged by <strong>{exam.parent_ack_name}</strong>{exam.parent_ack_at && ` on ${new Date(exam.parent_ack_at).toLocaleDateString()}`}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 flex-1">
                    <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Waiting for your parent to acknowledge this result in their own portal.</span>
                  </div>
                )}
                <button onClick={() => setScoreCardExam(exam)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex-shrink-0">Score Card →</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {scoreCardExam && <ScoreCardModal exam={scoreCardExam} onClose={() => setScoreCardExam(null)} />}
    </div>
  )
}

// ─── Score Card Modal ───────────────────────────────────────────────────────
// A dedicated, print-friendly "moment" view — distinct from the routine
// accordion above, since a released result is something a family shares/
// prints, not just a dashboard number.
function ScoreCardModal({ exam, onClose }: { exam: ExamResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white px-6 py-6 rounded-t-2xl text-center relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-white/70 hover:text-white">✕</button>
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest">Score Card</p>
          <p className="text-xl font-bold mt-1">{exam.exam_name}</p>
          <p className="text-indigo-200 text-sm mt-0.5">{EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type} · {exam.exam_date}</p>
          <div className="mt-4 flex items-center justify-center gap-6">
            <div>
              <p className="text-4xl font-black">{exam.percentage}%</p>
              <p className="text-indigo-200 text-[10px] uppercase tracking-wide mt-1">Overall</p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div>
              <p className="text-4xl font-black">{exam.grade}</p>
              <p className="text-indigo-200 text-[10px] uppercase tracking-wide mt-1">Grade</p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div>
              <p className={`text-2xl font-black ${exam.pass ? 'text-emerald-300' : 'text-red-300'}`}>{exam.pass ? 'PASS' : 'FAIL'}</p>
              <p className="text-indigo-200 text-[10px] uppercase tracking-wide mt-1">Result</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-2 font-semibold">Subject</th>
                <th className="text-right pb-2 font-semibold">Marks</th>
                <th className="text-right pb-2 font-semibold">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {exam.subjects.map(sub => (
                <tr key={sub.subject_name}>
                  <td className="py-2 text-gray-700">{sub.subject_name}</td>
                  <td className="py-2 text-right text-gray-600">{sub.is_absent ? 'Absent' : sub.marks_obtained !== null ? `${sub.marks_obtained}/${sub.max_marks}` : '—'}</td>
                  <td className="py-2 text-right">
                    {sub.grade ? <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[sub.grade as ExamGrade] ?? 'bg-gray-100 text-gray-600'}`}>{sub.grade}</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-bold">
                <td className="pt-2 text-gray-800">Total</td>
                <td className="pt-2 text-right text-gray-800">{exam.total_obtained}/{exam.total_max}</td>
                <td className="pt-2 text-right text-gray-800">{exam.percentage}%</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-[10px] text-gray-300 text-center mt-5">Passing criteria: {exam.passing_pct}% · Released {new Date(exam.released_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <button onClick={() => window.print()} className="w-full mt-4 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
            Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  )
}
