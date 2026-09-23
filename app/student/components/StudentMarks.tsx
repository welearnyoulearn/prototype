'use client'

import { useEffect, useState } from 'react'
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion'
import { Award, BarChart3, Printer } from 'lucide-react'
import { GRADE_COLORS, type ExamGrade } from '@/lib/examGrading'
import { InlineLoader } from '@/components/loaders'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StudentEmptyState, StudentPageIntro, StudentProgressTrack } from './StudentExperience'

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

function CountUpPercent({ value }: { value: number }) {
  const reduceMotion = useReducedMotion()
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, v => Math.round(v))
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const controls = animate(mv, value, { duration: reduceMotion ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] })
    const unsub = rounded.on('change', v => setDisplay(v))
    return () => { controls.stop(); unsub() }
  }, [value, reduceMotion]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{display}</>
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
  const reduceMotion = useReducedMotion()

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
      <InlineLoader portal="student" label="Preparing your released results…" size="lg" className="py-20" />
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <StudentPageIntro eyebrow="Academic progress" title="My marks" description="Review released exams, understand each subject result, and open a score card when you need the full record." />
        <div role="alert" className="border-l-2 border-red-600 bg-red-50 p-5">
          <p className="text-red-800 text-sm">We couldn’t load your released results. {error}</p>
          <button onClick={fetchExams} className="mt-3 min-h-10 text-sm font-semibold text-red-800 underline underline-offset-4">Try again</button>
        </div>
      </div>
    )
  }

  if (exams.length === 0) {
    return (
      <div className="space-y-6">
        <StudentPageIntro eyebrow="Academic progress" title="My marks" description="Review released exams, understand each subject result, and open a score card when you need the full record." />
        <StudentEmptyState icon={<BarChart3 size={22} />} title="No released results yet" description="Your exam results will appear here after your school releases them." />
      </div>
    )
  }

  const latestExam = exams[0]

  return (
    <div className="space-y-6">
      <StudentPageIntro eyebrow="Academic progress" title="My marks" description="Review released exams, understand each subject result, and open a score card when you need the full record." />
      {latestExam.percentage !== null && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="grid gap-6 border-y border-[#dcd8cd] bg-white/60 px-4 py-6 text-foreground sm:grid-cols-[1fr_auto] sm:items-center"
        >
          <div className="relative">
            <p className="student-section-kicker">Latest released result</p>
            <p className="text-foreground font-semibold text-xl mt-1">{latestExam.exam_name}</p>
            <p className="text-muted-foreground text-sm">{EXAM_TYPE_LABELS[latestExam.exam_type] || latestExam.exam_type} · {latestExam.exam_date}</p>
            <div className="mt-4 max-w-sm"><StudentProgressTrack value={latestExam.percentage} label={`${latestExam.total_obtained ?? '—'} of ${latestExam.total_max} total marks`} tone={latestExam.pass ? 'green' : 'red'} /></div>
          </div>
          <div className="relative flex items-center gap-3">
            <div className="text-center">
              <div className="text-3xl font-semibold"><CountUpPercent value={latestExam.percentage} />%</div>
              <div className={`mt-1 text-xs font-bold ${latestExam.pass ? 'text-green-700' : 'text-red-700'}`}>{latestExam.grade} · {latestExam.pass ? 'PASS' : 'FAIL'}</div>
            </div>
            <button onClick={() => setScoreCardExam(latestExam)} data-testid="view-score-card"
              className="min-h-11 bg-[#8b4a10] hover:bg-[#713b0b] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
              Open score card
            </button>
          </div>
        </motion.div>
      )}

      {exams.map((exam, i) => (
        <motion.div
          key={exam.exam_id}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 + i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white rounded-md border border-gray-200 overflow-hidden">
          <button aria-expanded={expanded === exam.exam_id} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setExpanded(expanded === exam.exam_id ? null : exam.exam_id)}>
            <div className="flex items-center gap-3 text-left">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${exam.pass === true ? 'bg-green-100 text-green-700' : exam.pass === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                {exam.grade || '—'}
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{exam.exam_name}</p>
                <p className="text-xs text-muted-foreground">{EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type} · {exam.exam_date}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {exam.percentage !== null && (
                <div className="text-right">
                  <div className="text-base font-bold text-gray-800">{exam.percentage}%</div>
                  <div className={`text-xs font-semibold ${exam.pass ? 'text-green-600' : 'text-red-500'}`}>{exam.pass ? 'PASS' : 'FAIL'}</div>
                </div>
              )}
              <svg className={`w-4 h-4 text-muted-foreground transition-transform ${expanded === exam.exam_id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {expanded === exam.exam_id && (
            <div className="border-t border-gray-100 px-4 py-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm mb-3">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wide">
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
                          {sub.pass === null && <span className="text-muted-foreground text-xs">—</span>}
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
                <button onClick={() => setScoreCardExam(exam)} className="min-h-10 text-xs font-semibold text-[#8b4a10] hover:text-[#6f3b0b] flex-shrink-0">Open score card →</button>
              </div>
            </div>
          )}
        </motion.div>
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
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto border-0 p-0 sm:max-w-lg" showCloseButton>
        <DialogHeader className="bg-[#713f0f] px-6 py-6 pr-14 text-white">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#f0bc72]"><Award size={15} aria-hidden="true" />Released score card</div>
          <DialogTitle className="text-xl font-semibold text-white">{exam.exam_name}</DialogTitle>
          <DialogDescription className="text-sm text-white/65">{EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type} · {exam.exam_date}</DialogDescription>
          <div className="mt-5 flex items-center gap-5 sm:gap-6">
            <div>
              <p className="text-4xl font-semibold">{exam.percentage}%</p>
              <p className="text-white/55 text-xs uppercase tracking-wide mt-1">Overall</p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div>
              <p className="text-4xl font-semibold">{exam.grade}</p>
              <p className="text-white/55 text-xs uppercase tracking-wide mt-1">Grade</p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div>
              <p className={`text-2xl font-semibold ${exam.pass ? 'text-emerald-300' : 'text-red-300'}`}>{exam.pass ? 'PASS' : 'FAIL'}</p>
              <p className="text-white/55 text-xs uppercase tracking-wide mt-1">Result</p>
            </div>
          </div>
        </DialogHeader>
        <div className="p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b border-gray-100">
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
          <p className="text-xs text-gray-500 text-center mt-5">Passing criteria: {exam.passing_pct}% · Released {new Date(exam.released_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <button onClick={() => window.print()} className="flex min-h-11 w-full items-center justify-center gap-2 mt-4 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-md hover:bg-gray-50 transition-colors">
            <Printer size={16} aria-hidden="true" />Print or save as PDF
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
